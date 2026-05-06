# filmgame-2 LangChain 全面重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 LangChain / LangGraph / LangSmith 完全替换 filmgame-2 的 AI 层，实现可观测性追踪、结构化输出验证、可编排的并行工作流。

**Architecture:** 新建 `lib/ai/lc-cli-model.ts`（Claude CLI 适配为 LangChain BaseChatModel）、`lib/ai/lc-providers.ts`（多提供商工厂）、`lib/ai/schemas.ts`（全量 Zod 响应模式）、`lib/ai/lc-chains.ts`（带结构化输出的 Runnable 链，替换 callProvider + buildPrompt 管道）、`lib/ai/lg-structure.ts`（LangGraph 两阶段并行结构生成图）、`lib/ai/lg-workshop.ts`（LangGraph 批量工坊图）；删除 `claude.ts` 和 `call-provider.ts`；LangSmith 通过环境变量零侵入接入，所有 AI 调用自动上报追踪。

**Tech Stack:** `@langchain/core` `@langchain/anthropic` `@langchain/openai` `@langchain/google-genai` `langgraph` `langsmith` `zod`

---

## 文件变更地图

### 新建文件
| 文件 | 职责 |
|------|------|
| `lib/ai/lc-cli-model.ts` | Claude CLI spawn 逻辑包装为 LangChain BaseChatModel |
| `lib/ai/lc-providers.ts` | 根据 AIConfig 返回对应 LangChain 模型实例 |
| `lib/ai/schemas.ts` | 全量 Zod schema：23+ 个 AI 响应的类型定义与验证 |
| `lib/ai/lc-chains.ts` | 每个 phase:action 的 Runnable 链，封装 prompt + model + output parser |
| `lib/ai/lg-structure.ts` | LangGraph StateGraph：spine → 并行章节生成 |
| `lib/ai/lg-workshop.ts` | LangGraph StateGraph：批量情感/对白并行处理 |
| `.env.local.example` | LangSmith 环境变量模板 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `app/api/ai/route.ts` | 替换 `callProvider` 为 `lc-chains.ts` 的 `runChain()` |
| `app/api/ai/structure/route.ts` | 替换手写 Promise.all 为 `lg-structure.ts` 的 `runStructureGraph()` |
| `lib/ai/server-config.ts` | 添加 LangSmith 配置读取 |

### 删除文件
- `lib/ai/claude.ts` — 由 `lc-cli-model.ts` + `lc-providers.ts` 替代
- `lib/ai/call-provider.ts` — 由 `lc-providers.ts` + `lc-chains.ts` 替代

### 保持不变
- `lib/ai/prompts.ts` — prompt 模板字符串全部保留，被 `lc-chains.ts` 引用
- `lib/ai/config.ts` — AIConfig 类型定义保留
- 所有其他文件 — 不涉及本次重构

---

## Task 1: 安装依赖 & LangSmith 环境配置

**Files:**
- Modify: `filmgame-2/package.json`
- Create: `filmgame-2/.env.local.example`

- [ ] **Step 1: 安装 LangChain 生态包**

在 `filmgame-2/` 目录下运行：

```bash
cd filmgame-2
pnpm add @langchain/core @langchain/anthropic @langchain/openai @langchain/google-genai langgraph langsmith zod
```

- [ ] **Step 2: 验证安装**

```bash
pnpm list @langchain/core langgraph langsmith zod
```

期望输出：每个包均显示版本号，无 peer dependency 报错。

- [ ] **Step 3: 创建 LangSmith 环境变量模板**

创建 `filmgame-2/.env.local.example`：

```bash
# LangSmith 可观测性（在 https://smith.langchain.com 获取 API Key）
LANGSMITH_API_KEY=lsv2_pt_xxxxxxxx
LANGSMITH_TRACING_V2=true
LANGSMITH_PROJECT=filmgame-2

# 如使用 Anthropic API 直连（非 CLI 模式）
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

- [ ] **Step 4: 创建本地 .env.local（不提交）**

```bash
cp .env.local.example .env.local
# 然后填入真实的 LANGSMITH_API_KEY
```

确认 `.gitignore` 包含 `.env.local`（Next.js 默认已包含）。

- [ ] **Step 5: 验证构建不报错**

```bash
pnpm build
```

期望：构建成功（新包安装后无破坏性变更）。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local.example
git commit -m "chore: add langchain/langgraph/langsmith/zod dependencies"
```

---

## Task 2: Claude CLI → LangChain BaseChatModel

**Files:**
- Create: `lib/ai/lc-cli-model.ts`

将现有的 `claude.ts` spawn 逻辑包装为 LangChain `BaseChatModel`，使其能像其他 LangChain 模型一样使用，并自动获得 LangSmith 追踪。

- [ ] **Step 1: 创建 `lib/ai/lc-cli-model.ts`**

```typescript
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { type BaseMessage, AIMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { spawn } from 'child_process'
import { createReadStream, existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import os from 'os'
import path from 'path'

export const RETRY_SUFFIX = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

function resolveClaudePath(): { exe: string; args: string[] } {
  const isWin = process.platform === 'win32'
  const home = os.homedir()
  const candidates = isWin
    ? [
        process.env.CLAUDE_CLI_PATH,
        path.join(home, '.local', 'bin', 'claude.exe'),
        path.join(home, '.claude', 'bin', 'claude.exe'),
      ]
    : [
        process.env.CLAUDE_CLI_PATH,
        path.join(home, '.local', 'bin', 'claude'),
        path.join(home, '.claude', 'bin', 'claude'),
        '/usr/local/bin/claude',
      ]
  for (const p of candidates) {
    if (p && existsSync(p)) return { exe: p, args: ['--print', '--output-format', 'text'] }
  }
  const npmJs = path.join(home, 'AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js')
  if (existsSync(npmJs)) {
    return { exe: process.execPath, args: [npmJs, '--print', '--output-format', 'text'] }
  }
  return { exe: isWin ? 'claude.exe' : 'claude', args: ['--print', '--output-format', 'text'] }
}

async function spawnClaude(prompt: string, timeoutMs: number): Promise<string> {
  const tmpDir = process.env.TEMP || process.env.TMP || os.tmpdir()
  const promptFile = join(tmpDir, `claude_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`)
  await writeFile(promptFile, prompt, 'utf8')

  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      delete env.ANTHROPIC_API_KEY
    }

    const cmd = resolveClaudePath()
    const proc = spawn(cmd.exe, cmd.args, {
      shell: false,
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => unlink(promptFile).catch(() => {})

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill('SIGKILL') } catch {}
      cleanup()
      reject(new Error(`timeout: claude CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      if (code !== 0) {
        const msg = (stderr || stdout).slice(0, 500)
        if (code === null) reject(new Error(`timeout: claude CLI timed out after ${timeoutMs}ms`))
        else if (msg.includes('not found') || msg.includes('ENOENT') || code === 127)
          reject(new Error('no_cli: claude CLI not found'))
        else reject(new Error(`claude exit ${code}: ${msg}`))
      } else {
        resolve(stdout)
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'no_cli: claude CLI not found'
          : err.message
      ))
    })

    const fileStream = createReadStream(promptFile, { encoding: 'utf8' })
    fileStream.on('error', (err) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })
    if (!proc.stdin) { cleanup(); reject(new Error('stdin not available')); return }
    fileStream.pipe(proc.stdin)
  })
}

export interface ClaudeCLIModelParams extends BaseChatModelParams {
  timeoutMs?: number
}

export class ClaudeCLIModel extends BaseChatModel {
  timeoutMs: number

  constructor(params: ClaudeCLIModelParams = {}) {
    super(params)
    this.timeoutMs = params.timeoutMs ?? 120000
  }

  _llmType(): string { return 'claude_cli' }

  async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const prompt = messages.map(m => m.content as string).join('\n')
    const text = await spawnClaude(prompt, this.timeoutMs)
    return {
      generations: [{ message: new AIMessage(text), text }],
      llmOutput: {},
    }
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
pnpm tsc --noEmit
```

期望：无类型错误。

- [ ] **Step 3: Commit**

```bash
git add lib/ai/lc-cli-model.ts
git commit -m "feat: wrap claude CLI as LangChain BaseChatModel"
```

---

## Task 3: Provider 工厂 — lc-providers.ts

**Files:**
- Create: `lib/ai/lc-providers.ts`

根据 `AIConfig` 返回对应的 LangChain 模型实例。LangSmith 追踪通过环境变量自动启用，无需代码改动。

- [ ] **Step 1: 创建 `lib/ai/lc-providers.ts`**

```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ClaudeCLIModel } from './lc-cli-model'
import type { AIConfig } from './config'

export interface ProviderOptions {
  timeoutMs?: number
}

export function createModel(config: AIConfig, opts: ProviderOptions = {}): BaseChatModel {
  const timeout = opts.timeoutMs ?? 120000

  switch (config.provider) {
    case 'claude_cli':
      return new ClaudeCLIModel({ timeoutMs: timeout })

    case 'anthropic':
      return new ChatAnthropic({
        model: config.model ?? 'claude-opus-4-5',
        apiKey: config.apiKey,
        maxTokens: 8192,
        timeout: timeout,
      })

    case 'openai':
      return new ChatOpenAI({
        model: config.model ?? 'gpt-4o',
        apiKey: config.apiKey,
        temperature: 0.7,
        timeout: timeout,
      })

    case 'gemini':
      return new ChatGoogleGenerativeAI({
        model: config.model ?? 'gemini-2.0-flash',
        apiKey: config.apiKey,
        maxOutputTokens: 8192,
        temperature: 0.7,
      })

    case 'custom':
      return new ChatOpenAI({
        model: config.model ?? 'llama3',
        apiKey: config.apiKey ?? 'none',
        configuration: { baseURL: config.baseUrl ?? 'http://localhost:11434/v1' },
        temperature: 0.7,
        timeout: timeout,
      })

    default:
      throw new Error(`Unknown provider: ${(config as AIConfig).provider}`)
  }
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/lc-providers.ts
git commit -m "feat: add LangChain provider factory for all AI providers"
```

---

## Task 4: Zod Schemas — World & Scale 阶段

**Files:**
- Create: `lib/ai/schemas.ts`（仅 world / scale 部分，后续任务继续追加）

- [ ] **Step 1: 创建 `lib/ai/schemas.ts` 并定义 world / scale schemas**

```typescript
import { z } from 'zod'

// ─── World Phase ────────────────────────────────────────────────

export const WorldReviewSchema = z.object({
  consistency: z.enum(['通过', '有风险']),
  structure_analysis: z.string(),
  interactive_potential: z.enum(['高', '中', '低']),
  issues: z.array(z.object({
    field: z.string(),
    issue: z.string(),
    suggestion: z.string(),
  })),
  duration_match: z.enum(['匹配', '偏多', '偏少']),
  overall: z.string(),
})
export type WorldReview = z.infer<typeof WorldReviewSchema>

export const WorldFixIssuesSchema = z.object({
  storyCore: z.string().optional(),
  theme: z.string().optional(),
  genre: z.string().optional(),
  worldRules: z.string().optional(),
})
export type WorldFixIssues = z.infer<typeof WorldFixIssuesSchema>

export const CharacterSchema = z.object({
  name: z.string(),
  role: z.enum(['protagonist', 'antagonist', 'support', 'other']),
  motivation: z.string(),
  relationship: z.string(),
  wound: z.string().optional(),
  lie: z.string().optional(),
  want: z.string().optional(),
  need: z.string().optional(),
})

export const SuggestCharactersSchema = z.object({
  characters: z.array(CharacterSchema),
})
export type SuggestCharacters = z.infer<typeof SuggestCharactersSchema>

export const VariableSchema = z.object({
  name: z.string(),
  type: z.enum(['flag', 'counter', 'relationship', 'item']),
  defaultValue: z.string(),
  description: z.string(),
})

export const SuggestVariablesSchema = z.object({
  variables: z.array(VariableSchema),
})
export type SuggestVariables = z.infer<typeof SuggestVariablesSchema>

export const EndingDesignSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['good', 'bad', 'neutral', 'secret']).or(z.string()),
  triggerCondition: z.string(),
  avoidCondition: z.string().optional(),
  keyVariable: z.string().optional(),
})

export const EndingsDesignSchema = z.object({
  endings: z.array(EndingDesignSchema),
})
export type EndingsDesign = z.infer<typeof EndingsDesignSchema>

// ─── Scale Phase ─────────────────────────────────────────────────

export const ScalePlanSchema = z.object({
  id: z.string(),
  label: z.string(),
  chapterCount: z.number(),
  totalNodes: z.number(),
  chapters: z.array(z.object({
    title: z.string(),
    brief: z.string(),
  })),
  estimatedHours: z.number().optional(),
})

export const ScaleGenerateSchema = z.object({
  plans: z.array(ScalePlanSchema),
})
export type ScaleGenerate = z.infer<typeof ScaleGenerateSchema>
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/schemas.ts
git commit -m "feat: add Zod schemas for world and scale phase AI responses"
```

---

## Task 5: Zod Schemas — Structure / Branches / Workshop 阶段

**Files:**
- Modify: `lib/ai/schemas.ts`（追加后续阶段的 schema）

- [ ] **Step 1: 追加 structure / branches / workshop schemas 到 `lib/ai/schemas.ts`**

在文件末尾追加：

```typescript
// ─── Structure Phase ─────────────────────────────────────────────

export const SpineSchema = z.object({
  throughlines: z.array(z.string()),
  chapter_handoffs: z.array(z.object({
    from: z.string(),
    to: z.string(),
    carry_over: z.string(),
  })).optional(),
  character_arcs: z.record(z.array(z.string())).optional(),
})
export type Spine = z.infer<typeof SpineSchema>

export const NodeDraftSchema = z.object({
  title: z.string(),
  type: z.enum(['start', 'normal', 'branch', 'explore', 'ending', 'merge']).or(z.string()),
  notes: z.string().optional(),
})

export const ActDraftSchema = z.object({
  title: z.string(),
  nodes: z.array(NodeDraftSchema),
})

export const ChapterDraftSchema = z.object({
  title: z.string(),
  acts: z.array(ActDraftSchema),
})
export type ChapterDraft = z.infer<typeof ChapterDraftSchema>

// ─── Branches Phase ──────────────────────────────────────────────

export const ChoiceDraftSchema = z.object({
  text: z.string(),
  targetNodeId: z.string(),
  variableEffects: z.string().optional(),
  choiceWeight: z.enum(['light', 'heavy', 'critical']).optional(),
  consequence: z.string().optional(),
})

export const BranchesGenerateSchema = z.object({
  nodeChoices: z.array(z.object({
    nodeId: z.string(),
    choices: z.array(ChoiceDraftSchema),
  })),
})
export type BranchesGenerate = z.infer<typeof BranchesGenerateSchema>

// ─── Workshop Phase ───────────────────────────────────────────────

export const FillEmotionSchema = z.object({
  emotionIn: z.string(),
  emotionOut: z.string(),
  tension: z.number().min(0).max(10),
  internal_lie: z.string().optional(),
  fear: z.string().optional(),
})
export type FillEmotion = z.infer<typeof FillEmotionSchema>

export const DialogueLineSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  emotion: z.string().optional(),
})

export const WriteDialogueSchema = z.object({
  sceneDesc: z.string(),
  dialogue: z.array(DialogueLineSchema),
})
export type WriteDialogue = z.infer<typeof WriteDialogueSchema>

export const SuggestChoicesSchema = z.object({
  choices: z.array(z.object({
    text: z.string(),
    consequence: z.string(),
    dramatic_cost: z.string(),
    thematic_resonance: z.string(),
  })),
})
export type SuggestChoices = z.infer<typeof SuggestChoicesSchema>

export const SceneAnalysisSchema = z.object({
  issues: z.array(z.string()),
  killer_line: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
})
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>

export const SceneTensionSchema = z.object({
  tension_score: z.number().min(0).max(10),
  diagnosis: z.string(),
  suggestions: z.array(z.string()),
})
export type SceneTension = z.infer<typeof SceneTensionSchema>

export const CharacterVoiceSchema = z.object({
  speaking_rhythm: z.string(),
  vocabulary: z.string(),
  defense_mechanism: z.string(),
  sample_lines: z.array(z.string()),
})
export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>

export const ChoiceConsequenceSchema = z.object({
  immediate: z.string(),
  downstream: z.string(),
  thematic_cost: z.string(),
})
export type ChoiceConsequence = z.infer<typeof ChoiceConsequenceSchema>
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/schemas.ts
git commit -m "feat: add Zod schemas for structure, branches, and workshop phases"
```

---

## Task 6: Zod Schemas — Validate 阶段

**Files:**
- Modify: `lib/ai/schemas.ts`（追加 validate schemas）

- [ ] **Step 1: 追加 validate schemas 到 `lib/ai/schemas.ts`**

```typescript
// ─── Validate Phase ───────────────────────────────────────────────

export const ValidateReportSchema = z.object({
  summary: z.string(),
  priority_issues: z.array(z.object({
    issue: z.string(),
    severity: z.enum(['high', 'medium', 'low']).or(z.string()),
    suggestion: z.string(),
  })),
  suggestions: z.array(z.string()),
})
export type ValidateReport = z.infer<typeof ValidateReportSchema>

export const DirectorVerdictSchema = z.object({
  lens: z.string(),
  score: z.number().min(0).max(10),
  observation: z.string(),
  note: z.string(),
})

export const DirectorReviewSchema = z.object({
  verdicts: z.array(DirectorVerdictSchema),
  overallScore: z.number().min(0).max(10),
  greenlit: z.boolean(),
  executiveSummary: z.string(),
  mustFix: z.array(z.string()),
  standout_moment: z.string(),
})
export type DirectorReview = z.infer<typeof DirectorReviewSchema>

// ─── Schema Registry ─────────────────────────────────────────────
// 将 phase:action 映射到对应 Zod schema，供 lc-chains.ts 查找

export const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  'world:review': WorldReviewSchema,
  'world:fix_issues': WorldFixIssuesSchema,
  'world:suggest_characters': SuggestCharactersSchema,
  'world:suggest_variables': SuggestVariablesSchema,
  'world:endings_design': EndingsDesignSchema,
  'scale:generate': ScaleGenerateSchema,
  'structure:spine': SpineSchema,
  'structure:chapter': ChapterDraftSchema,
  'branches:generate': BranchesGenerateSchema,
  'workshop:fill_emotion': FillEmotionSchema,
  'workshop:write_dialogue': WriteDialogueSchema,
  'workshop:revise_dialogue': WriteDialogueSchema,
  'workshop:suggest_choices': SuggestChoicesSchema,
  'workshop:scene_analysis': SceneAnalysisSchema,
  'workshop:scene_tension': SceneTensionSchema,
  'workshop:character_voice': CharacterVoiceSchema,
  'workshop:choice_consequence': ChoiceConsequenceSchema,
  'validate:report': ValidateReportSchema,
  'validate:director_review': DirectorReviewSchema,
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/schemas.ts
git commit -m "feat: complete Zod schema registry for all 19 phase:action responses"
```

---

## Task 7: LangChain Chains 层 — lc-chains.ts

**Files:**
- Create: `lib/ai/lc-chains.ts`

这是整个重构的核心层：将 `buildPrompt + callProvider` 管道替换为 LangChain Runnable 链。
- API 提供商（anthropic/openai/gemini/custom）使用 `.withStructuredOutput()` 直接返回验证后的对象
- CLI 提供商使用 `extractAndValidate` 从原始文本提取并用 Zod 验证

- [ ] **Step 1: 创建 `lib/ai/lc-chains.ts`**

```typescript
import { HumanMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { z } from 'zod'
import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { loadServerAIConfig } from './server-config'
import { SCHEMA_REGISTRY } from './schemas'
import { RETRY_SUFFIX } from './lc-cli-model'
import type { Phase } from '@/lib/types/phase'

type Context = Record<string, unknown>

// JSON 从原始文本中提取（CLI 模式备用）
function extractJson(text: string): unknown {
  const t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      const inner = JSON.parse(t)
      if (typeof inner === 'string') {
        try { return JSON.parse(inner) } catch {}
      }
    } catch {}
  }
  const blockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()) } catch {}
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch {}
  }
  const astart = t.indexOf('[')
  const aend = t.lastIndexOf(']')
  if (astart !== -1 && aend > astart) {
    try { return JSON.parse(t.slice(astart, aend + 1)) } catch {}
  }
  return null
}

// CLI 模式：提取 + Zod 验证，失败重试
async function runWithCliRetry(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny,
  timeoutMs: number,
  maxRetries = 3
): Promise<unknown> {
  // CLI 模型的 timeout 在 ClaudeCLIModel 构造时设置，这里重新创建带正确 timeout 的实例
  // 由于 model 已传入，我们直接用它，timeout 在 Task 10 的 route 中设置
  for (let i = 0; i < maxRetries; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)])
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    const extracted = extractJson(raw)
    if (extracted !== null) {
      const parsed = schema.safeParse(extracted)
      if (parsed.success) return parsed.data
    }
  }
  throw new Error('parse_failed: AI response could not be parsed and validated after retries')
}

// API 模式：使用 withStructuredOutput，Zod schema 直接约束输出
async function runWithStructuredOutput(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny
): Promise<unknown> {
  // withStructuredOutput 仅 API 模式支持（非 CLI）
  const structured = (model as BaseChatModel & {
    withStructuredOutput: (s: z.ZodTypeAny) => { invoke: (msgs: unknown[]) => Promise<unknown> }
  }).withStructuredOutput(schema)
  return structured.invoke([new HumanMessage(prompt)])
}

export interface ChainRunOptions {
  phase: string
  action: string
  context: Context
  timeoutMs?: number
}

export async function runChain(opts: ChainRunOptions): Promise<unknown> {
  const { phase, action, context, timeoutMs = 120000 } = opts
  const key = `${phase}:${action}`
  const schema = SCHEMA_REGISTRY[key]

  if (!schema) {
    throw new Error(`No schema registered for ${key}`)
  }

  const prompt = buildPrompt(phase as Phase, action, context)
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs })

  if (config.provider === 'claude_cli') {
    return runWithCliRetry(model, prompt, schema, timeoutMs)
  }
  return runWithStructuredOutput(model, prompt, schema)
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/lc-chains.ts
git commit -m "feat: add LangChain chains layer with structured output and Zod validation"
```

---

## Task 8: LangGraph — 结构生成图

**Files:**
- Create: `lib/ai/lg-structure.ts`

用 LangGraph StateGraph 替换 `app/api/ai/structure/route.ts` 中的手写 Promise.all，实现：spine → 并行章节生成的可观测、可重试编排。

- [ ] **Step 1: 创建 `lib/ai/lg-structure.ts`**

```typescript
import { StateGraph, Annotation, Send } from '@langchain/langgraph'
import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { loadServerAIConfig } from './server-config'
import { SpineSchema, ChapterDraftSchema, type Spine, type ChapterDraft } from './schemas'
import { HumanMessage } from '@langchain/core/messages'
import { RETRY_SUFFIX } from './lc-cli-model'
import { z } from 'zod'

const SPINE_TIMEOUT = 90000
const CHAPTER_TIMEOUT = 300000

// ─── State 定义 ───────────────────────────────────────────────────

const StructureState = Annotation.Root({
  worldAnchor: Annotation<unknown>(),
  scalePlan: Annotation<unknown>(),
  characters: Annotation<unknown>(),
  chapterCount: Annotation<number>(),
  spine: Annotation<Spine | null>({ default: () => null, reducer: (_, v) => v }),
  chapters: Annotation<ChapterDraft[]>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
  errors: Annotation<string[]>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
})

type StructureStateType = typeof StructureState.State

// ─── 工具函数 ──────────────────────────────────────────────────────

async function extractAndValidate<T>(
  model: ReturnType<typeof createModel>,
  prompt: string,
  schema: z.ZodType<T>,
  isCliProvider: boolean
): Promise<T | null> {
  const maxRetries = isCliProvider ? 3 : 1

  for (let i = 0; i < maxRetries; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)])
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)

    if (isCliProvider) {
      // CLI: 提取原始 JSON 文本
      const t = raw.trim()
      const blockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = blockMatch ? blockMatch[1].trim() : t
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start !== -1 && end > start) {
        try {
          const parsed = schema.safeParse(JSON.parse(jsonStr.slice(start, end + 1)))
          if (parsed.success) return parsed.data
        } catch {}
      }
    } else {
      try {
        const parsed = schema.safeParse(JSON.parse(raw))
        if (parsed.success) return parsed.data
      } catch {}
    }
  }
  return null
}

// ─── 节点：生成 spine ─────────────────────────────────────────────

async function generateSpine(state: StructureStateType) {
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs: SPINE_TIMEOUT })
  const prompt = buildPrompt('structure', 'spine', {
    worldAnchor: state.worldAnchor,
    scalePlan: state.scalePlan,
    characters: state.characters,
  })

  const spine = await extractAndValidate(model, prompt, SpineSchema, config.provider === 'claude_cli')
  return { spine: spine ?? null }
}

// ─── 节点：扇出 → 为每章发送 Send ────────────────────────────────

function fanOutChapters(state: StructureStateType) {
  return Array.from({ length: state.chapterCount }, (_, i) =>
    new Send('generateChapter', { ...state, chapterIndex: i })
  )
}

// ─── 节点：生成单章（并行） ────────────────────────────────────────

async function generateChapter(state: StructureStateType & { chapterIndex: number }) {
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs: CHAPTER_TIMEOUT })
  const prompt = buildPrompt('structure', 'chapter', {
    worldAnchor: state.worldAnchor,
    scalePlan: state.scalePlan,
    characters: state.characters,
    spine: state.spine,
    chapterIndex: state.chapterIndex,
  })

  const chapter = await extractAndValidate(
    model, prompt, ChapterDraftSchema, config.provider === 'claude_cli'
  )

  if (!chapter) {
    return { errors: [`第${state.chapterIndex + 1}章解析失败`] }
  }
  return { chapters: [chapter] }
}

// ─── 构建图 ───────────────────────────────────────────────────────

const graph = new StateGraph(StructureState)
  .addNode('generateSpine', generateSpine)
  .addNode('generateChapter', generateChapter)
  .addEdge('__start__', 'generateSpine')
  .addConditionalEdges('generateSpine', fanOutChapters, ['generateChapter'])
  .addEdge('generateChapter', '__end__')

export const structureGraph = graph.compile()

// ─── 公开入口 ────────────────────────────────────────────────────

export interface StructureGraphInput {
  worldAnchor: unknown
  scalePlan: unknown
  characters: unknown
}

export interface StructureGraphResult {
  spine: Spine | null
  chapters: ChapterDraft[]
  errors: string[]
}

export async function runStructureGraph(input: StructureGraphInput): Promise<StructureGraphResult> {
  const scalePlan = input.scalePlan as Record<string, unknown>
  const chapterCount = Number(scalePlan?.chapterCount ?? 3)

  const result = await structureGraph.invoke({
    ...input,
    chapterCount,
    spine: null,
    chapters: [],
    errors: [],
  })

  return {
    spine: result.spine,
    chapters: result.chapters,
    errors: result.errors,
  }
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/lg-structure.ts
git commit -m "feat: add LangGraph structure generation graph with parallel chapter nodes"
```

---

## Task 9: LangGraph — 工坊批量操作图

**Files:**
- Create: `lib/ai/lg-workshop.ts`

工坊页面的批量操作（批量填充情感、批量撰写对白）当前是顺序调用。用 LangGraph Send API 实现节点级并行。

- [ ] **Step 1: 创建 `lib/ai/lg-workshop.ts`**

```typescript
import { StateGraph, Annotation, Send } from '@langchain/langgraph'
import { runChain } from './lc-chains'
import { FillEmotionSchema, WriteDialogueSchema, type FillEmotion, type WriteDialogue } from './schemas'

// ─── 批量填充情感 ─────────────────────────────────────────────────

interface EmotionTask {
  nodeId: string
  nodeContext: Record<string, unknown>
}

const BatchEmotionState = Annotation.Root({
  tasks: Annotation<EmotionTask[]>(),
  results: Annotation<Array<{ nodeId: string; emotion: FillEmotion | null }>>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
})

async function processEmotionNode(
  state: typeof BatchEmotionState.State & { currentTask: EmotionTask }
) {
  try {
    const result = await runChain({
      phase: 'workshop',
      action: 'fill_emotion',
      context: state.currentTask.nodeContext,
      timeoutMs: 60000,
    })
    const parsed = FillEmotionSchema.safeParse(result)
    return {
      results: [{
        nodeId: state.currentTask.nodeId,
        emotion: parsed.success ? parsed.data : null,
      }],
    }
  } catch {
    return { results: [{ nodeId: state.currentTask.nodeId, emotion: null }] }
  }
}

function fanOutEmotionTasks(state: typeof BatchEmotionState.State) {
  return state.tasks.map(task =>
    new Send('processEmotionNode', { ...state, currentTask: task })
  )
}

const emotionGraph = new StateGraph(BatchEmotionState)
  .addNode('processEmotionNode', processEmotionNode)
  .addConditionalEdges('__start__', fanOutEmotionTasks, ['processEmotionNode'])
  .addEdge('processEmotionNode', '__end__')
  .compile()

export async function runBatchFillEmotion(
  tasks: EmotionTask[]
): Promise<Array<{ nodeId: string; emotion: FillEmotion | null }>> {
  const result = await emotionGraph.invoke({ tasks, results: [] })
  return result.results
}

// ─── 批量撰写对白 ─────────────────────────────────────────────────

interface DialogueTask {
  nodeId: string
  nodeContext: Record<string, unknown>
}

const BatchDialogueState = Annotation.Root({
  tasks: Annotation<DialogueTask[]>(),
  results: Annotation<Array<{ nodeId: string; dialogue: WriteDialogue | null }>>({
    default: () => [],
    reducer: (existing, incoming) => [...existing, ...incoming],
  }),
})

async function processDialogueNode(
  state: typeof BatchDialogueState.State & { currentTask: DialogueTask }
) {
  try {
    const result = await runChain({
      phase: 'workshop',
      action: 'write_dialogue',
      context: state.currentTask.nodeContext,
      timeoutMs: 180000,
    })
    const parsed = WriteDialogueSchema.safeParse(result)
    return {
      results: [{
        nodeId: state.currentTask.nodeId,
        dialogue: parsed.success ? parsed.data : null,
      }],
    }
  } catch {
    return { results: [{ nodeId: state.currentTask.nodeId, dialogue: null }] }
  }
}

function fanOutDialogueTasks(state: typeof BatchDialogueState.State) {
  return state.tasks.map(task =>
    new Send('processDialogueNode', { ...state, currentTask: task })
  )
}

const dialogueGraph = new StateGraph(BatchDialogueState)
  .addNode('processDialogueNode', processDialogueNode)
  .addConditionalEdges('__start__', fanOutDialogueTasks, ['processDialogueNode'])
  .addEdge('processDialogueNode', '__end__')
  .compile()

export async function runBatchWriteDialogue(
  tasks: DialogueTask[]
): Promise<Array<{ nodeId: string; dialogue: WriteDialogue | null }>> {
  const result = await dialogueGraph.invoke({ tasks, results: [] })
  return result.results
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/lg-workshop.ts
git commit -m "feat: add LangGraph workshop batch graphs for parallel emotion/dialogue generation"
```

---

## Task 10: 更新 API Routes

**Files:**
- Modify: `app/api/ai/route.ts`
- Modify: `app/api/ai/structure/route.ts`

- [ ] **Step 1: 重写 `app/api/ai/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runChain } from '@/lib/ai/lc-chains'
import type { Phase } from '@/lib/types/phase'

function getTimeout(phase: string, action: string): number {
  if (action === 'generate' && phase === 'structure') return 1800000
  if (action === 'generate' && (phase === 'branches' || phase === 'workshop')) return 1200000
  if (phase === 'structure') return 1800000
  if (phase === 'branches') return 1200000
  if (phase === 'workshop' && action === 'write_dialogue') return 180000
  if (phase === 'world' || phase === 'validate') return 90000
  return 120000
}

function classifyError(msg: string): { error: string; errorType: string } {
  if (msg.startsWith('no_cli:')) return { error: msg, errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg, errorType: 'timeout' }
  if (msg.startsWith('parse_failed:')) return { error: msg, errorType: 'parse_failed' }
  return { error: msg, errorType: 'unknown' }
}

export async function POST(req: NextRequest) {
  let phase: string | undefined
  let action: string | undefined
  try {
    const body = await req.json()
    ;({ phase, action } = body as { phase: Phase; action: string })
    const context = body.context as Record<string, unknown>
    const timeoutMs = getTimeout(phase ?? '', action ?? '')

    const result = await runChain({ phase: phase!, action: action!, context, timeoutMs })
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const { error, errorType } = classifyError(msg)
    return NextResponse.json({ ok: false, error, errorType, phase, action }, { status: 500 })
  }
}
```

- [ ] **Step 2: 重写 `app/api/ai/structure/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runStructureGraph } from '@/lib/ai/lg-structure'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const context = body.context as Record<string, unknown>
    const { worldAnchor, scalePlan, characters } = context

    const { chapters, errors } = await runStructureGraph({ worldAnchor, scalePlan, characters })

    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: errors.join('; '),
        errorType: 'parse_failed',
      }, { status: 502 })
    }

    return NextResponse.json({ ok: true, result: { chapters } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errorType = msg.startsWith('no_cli:') ? 'no_cli'
      : msg.startsWith('timeout:') ? 'timeout' : 'unknown'
    return NextResponse.json({ ok: false, error: msg, errorType }, { status: 500 })
  }
}
```

- [ ] **Step 3: 验证 TypeScript**

```bash
pnpm tsc --noEmit
```

期望：无类型错误。

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/route.ts app/api/ai/structure/route.ts
git commit -m "feat: update API routes to use LangChain chains and LangGraph graphs"
```

---

## Task 11: 清理旧文件 & 全量验证

**Files:**
- Delete: `lib/ai/claude.ts`
- Delete: `lib/ai/call-provider.ts`

- [ ] **Step 1: 确认无其他文件引用旧模块**

```bash
grep -r "from.*claude'" lib/ app/ --include="*.ts" --include="*.tsx"
grep -r "from.*call-provider'" lib/ app/ --include="*.ts" --include="*.tsx"
```

期望：无任何引用（均已替换）。

- [ ] **Step 2: 删除旧文件**

```bash
rm lib/ai/claude.ts lib/ai/call-provider.ts
```

- [ ] **Step 3: 再次全量类型检查**

```bash
pnpm tsc --noEmit
```

期望：零类型错误。

- [ ] **Step 4: 生产构建验证**

```bash
pnpm build
```

期望：构建成功，无报错。

- [ ] **Step 5: 启动开发服务器做冒烟测试**

```bash
pnpm dev
```

访问 `http://localhost:3000`，确认：
- 首页正常加载
- 进入已有项目，调用任意 AI 功能（如世界审查）
- LangSmith 控制台（https://smith.langchain.com）出现追踪记录

- [ ] **Step 6: Final Commit**

```bash
git add -A
git commit -m "chore: remove legacy claude.ts and call-provider.ts after LangChain migration"
```

---

## 验收标准

| 项目 | 验收条件 |
|------|---------|
| **LangSmith 追踪** | 每次 AI 调用在 LangSmith 控制台可见，包含 prompt、response、延迟、token 用量 |
| **结构化输出** | API 提供商使用 `.withStructuredOutput()`，返回值通过 Zod 验证，无手写 JSON 提取 |
| **LangGraph 结构生成** | spine → 并行章节在 LangSmith 中显示为图节点，可看到每章的并行执行 |
| **批量工坊** | bulkFillEmotion / bulkWriteDialogue 通过 LangGraph 并行执行 |
| **CLI 兼容** | claude_cli 提供商功能不降级，仍支持重试与 JSON 提取 |
| **类型安全** | `pnpm tsc --noEmit` 零错误 |
| **构建通过** | `pnpm build` 成功 |
| **旧文件删除** | `lib/ai/claude.ts` 和 `lib/ai/call-provider.ts` 不存在 |
