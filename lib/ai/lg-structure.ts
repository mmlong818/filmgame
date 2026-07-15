import { StateGraph, Annotation, Send, START, END } from '@langchain/langgraph'
import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { loadServerAIConfig } from './server-config'
import { SpineSchema, ChapterDraftSchema, type Spine, type ChapterDraft } from './schemas'
import { HumanMessage } from '@langchain/core/messages'
import { RETRY_SUFFIX } from './lc-cli-model'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'

const SPINE_TIMEOUT = 90000
const CHAPTER_TIMEOUT = 300000

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

// ─── State 定义 ───────────────────────────────────────────────────

const StructureState = Annotation.Root({
  worldAnchor: Annotation<unknown>(),
  scalePlan: Annotation<unknown>(),
  characters: Annotation<unknown>(),
  chapterCount: Annotation<number>(),
  chapterIndex: Annotation<number>(),
  spine: Annotation<Spine | null>({ reducer: (_left, right) => right, default: () => null }),
  chapters: Annotation<ChapterDraft[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  errors: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
})

type StructureStateType = typeof StructureState.State

// ─── 节点：生成叙事骨干 ─────────────────────────────────────────────

async function generateSpine(state: StructureStateType): Promise<Partial<StructureStateType>> {
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs: SPINE_TIMEOUT })
  const prompt = buildPrompt('structure', 'spine', {
    worldAnchor: state.worldAnchor,
    scalePlan: state.scalePlan,
    characters: state.characters,
  })
  // @langchain/google-genai 的 ChatGoogleGenerativeAI 构造函数不支持 timeout 字段，
  // 借助 LangChain 通用的 RunnableConfig.timeout（invoke 时转换为 AbortSignal.timeout）兜底
  const invokeOptions = config.provider === 'gemini' ? { timeout: SPINE_TIMEOUT } : undefined

  for (let i = 0; i < 3; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)], invokeOptions)
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    const extracted = extractJson(raw)
    if (extracted !== null) {
      const parsed = SpineSchema.safeParse(extracted)
      if (parsed.success) return { spine: parsed.data }
    }
  }
  // spine 解析失败时使用空骨干继续，但需让调用方感知这次降级
  return { spine: null, errors: ['叙事骨干生成失败，章节将在无跨章脉络下生成'] }
}

// ─── 条件边：扇出每章为独立并行任务 ──────────────────────────────────

function fanOutChapters(state: StructureStateType) {
  return Array.from({ length: state.chapterCount }, (_, i) =>
    new Send('generateChapter', { ...state, chapterIndex: i })
  )
}

// ─── 节点：生成单章（并行，失败互不影响） ─────────────────────────────

async function generateChapter(state: StructureStateType): Promise<Partial<StructureStateType>> {
  const { chapterIndex } = state
  try {
    const config = await loadServerAIConfig()
    const model = createModel(config, { timeoutMs: CHAPTER_TIMEOUT })
    const prompt = buildPrompt('structure', 'chapter', {
      worldAnchor: state.worldAnchor,
      scalePlan: state.scalePlan,
      characters: state.characters,
      spine: state.spine,
      chapterIndex,
    })
    const invokeOptions = config.provider === 'gemini' ? { timeout: CHAPTER_TIMEOUT } : undefined

    for (let i = 0; i < 3; i++) {
      const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
      const result = await model.invoke([new HumanMessage(input)], invokeOptions)
      const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
      const extracted = extractJson(raw)
      if (extracted !== null) {
        const parsed = ChapterDraftSchema.safeParse(extracted)
        if (parsed.success) return { chapters: [parsed.data] }
      }
    }
    return { errors: [`第${chapterIndex + 1}章解析失败`] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { errors: [`第${chapterIndex + 1}章生成失败: ${msg}`] }
  }
}

// ─── 组图 ─────────────────────────────────────────────────────────

const graph = new StateGraph(StructureState)
  .addNode('generateSpine', generateSpine)
  .addNode('generateChapter', generateChapter)
  .addEdge(START, 'generateSpine')
  .addConditionalEdges('generateSpine', fanOutChapters, ['generateChapter'])
  .addEdge('generateChapter', END)

/** 编译后的结构生成图，供流式路由 `structureGraph.stream(input,{streamMode:'updates'})` 消费。 */
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

export interface RunStructureGraphOptions {
  /** 用于捕获 LangSmith root run id（如 RunCollectorCallbackHandler）的回调，非流式路由取 runId 用 */
  callbacks?: BaseCallbackHandler[]
}

export async function runStructureGraph(
  input: StructureGraphInput,
  options?: RunStructureGraphOptions
): Promise<StructureGraphResult> {
  const scalePlan = input.scalePlan as Record<string, unknown>
  const chapterCount = Number(scalePlan?.chapterCount ?? 3)

  const result = await structureGraph.invoke(
    { ...input, chapterCount, chapterIndex: 0, spine: null, chapters: [], errors: [] },
    options?.callbacks ? { callbacks: options.callbacks } : undefined
  )

  return { spine: result.spine, chapters: result.chapters, errors: result.errors }
}
