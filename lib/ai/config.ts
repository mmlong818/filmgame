export type AIProvider = 'claude_cli' | 'anthropic' | 'openai' | 'gemini' | 'custom'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
  baseUrl?: string
  /** 快速模式使用的模型 ID；留空按 provider 给默认（见 lib/ai/lc-providers.ts resolveModel） */
  modelFast?: string
  /** 思考模式使用的模型 ID；留空则沿用 model */
  modelThinking?: string
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude_cli: '',
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-5.4',
  gemini: 'gemini-3.5-flash',
  custom: 'llama3',
}

/** fast 模式的默认模型：按 provider，custom 下按端点厂商。lc-providers.resolveModel 使用。 */
export const FAST_MODE_MODELS = {
  anthropic: 'claude-haiku-4-5',
  bigmodel: 'glm-5-turbo',
} as const

/** AI 调用默认超时（毫秒）。长任务（整章结构生成）在调用点显式放大。 */
export const DEFAULT_TIMEOUT_MS = 120000

// ─── 输出长度预算 ────────────────────────────────────────────────────────
// 此前所有 provider 共用写死的 maxTokens: 8192，是"输出被截断"类失败的直接原因：
// 实测本产品单次结构/分支生成需要 4.3K~6.1K token（精简版 18~22 节点/章），
// 标准版（30 节点/章）必然超过 8192 → JSON 被砍成半截 → extractJson 失败 →
// 报 parse_failed，而重试只追加"请输出纯 JSON"（纠正格式，对截断毫无作用），
// 三次重试在同一处被砍断后失败。
//
// 两个维度共同决定预算：
//   1) 模型能力上限——各家差一个数量级（Claude 5 系 128K、GLM 5.x 131K、
//      Gemini 3.x 64K、Qwen3.7-max 64K、DeepSeek V4 384K）。
//   2) 是否默认思考——思考型模型的 max_tokens 同时封顶思考与正文，
//      Opus 5 / GLM-5 系 / Qwen3.7-max 不传 thinking 也会思考，预算必须留出思考份额。
// 数值来源：E:\CC\ai-models.md（2026-08-29 全厂商官方文档核对）。

/** 各模型的最大输出 token（模型能力上限，非本产品的用量）。键为模型 ID 前缀，取最长匹配。 */
const MODEL_OUTPUT_CEILING: Record<string, number> = {
  // Anthropic：Claude 5 系 128K；Haiku 4.5 / Opus 4.x 为 64K
  'claude-opus-5': 128000,
  'claude-sonnet-5': 128000,
  'claude-fable-5': 128000,
  'claude-mythos-5': 128000,
  'claude-opus-4': 64000,
  'claude-sonnet-4': 64000,
  'claude-haiku-4-5': 64000,
  // OpenAI
  'gpt-5': 128000,
  // Gemini 3.x：1M 输入 / 64K 输出
  'gemini-3': 64000,
  'gemini-2': 64000,
  // 智谱 GLM：5.2/5.3 输出上限 131,072
  'glm-5': 131072,
  'glm-4': 32000,
  // DeepSeek V4：输出 ≤384K
  'deepseek-v4': 384000,
  'deepseek-': 64000,
  // 通义千问：3.7-max 输出 ≤64K
  'qwen3': 64000,
  // 月之暗面 / 其它 OpenAI 兼容端点走 DEFAULT_OUTPUT_CEILING
  'kimi-': 64000,
}

/** 未知模型的保守上限：足够本产品最大单次产出，又不至于超出小模型的真实能力 */
const DEFAULT_OUTPUT_CEILING = 16384

/** 默认开启思考的模型（max_tokens 同时封顶思考+正文，需按倍数放大预算） */
const THINKING_BY_DEFAULT = ['claude-opus-5', 'glm-5', 'qwen3.7-max', 'deepseek-v4-pro']

/** 本产品各动作实际需要的输出量（token）。数值按真实项目反推后留 ~2 倍余量。 */
const ACTION_OUTPUT_NEED: Record<string, number> = {
  // 整章结构骨架：实测 4.3K~6.1K（18~22 节点/章），标准版 30 节点/章按比例约 8.5K
  'structure:chapter': 16000,
  'structure:spine': 4000,
  'structure:generate': 16000,
  'structure:targeted_fix': 8000,
  // 整章分支：实测 4.7K~5.7K
  'branches:generate': 16000,
  // 规模方案：多套方案并列
  'scale:generate': 8000,
  // 单节点动作：对白最长约 2K
  'workshop:write_dialogue': 6000,
  'workshop:revise_dialogue': 6000,
  'validate:report': 8000,
  'validate:director_review': 8000,
  'world:endings_design': 6000,
}
/** 未列出的动作（单字段补全、建议类）默认预算 */
const DEFAULT_ACTION_NEED = 4000

/**
 * 计算一次调用的 max_tokens：取「本动作实际需要」与「模型能力上限」的较小值；
 * 思考型模型再按 2 倍放大需求（思考与正文共用同一预算），仍不超过模型上限。
 *
 * @param model 模型 ID（未知/为空时按保守默认）
 * @param actionKey `${phase}:${action}`
 */
export function resolveMaxTokens(model: string | undefined, actionKey?: string): number {
  const id = (model ?? '').toLowerCase()
  let ceiling = DEFAULT_OUTPUT_CEILING
  let matched = ''
  for (const [prefix, limit] of Object.entries(MODEL_OUTPUT_CEILING)) {
    if (id.startsWith(prefix) && prefix.length > matched.length) {
      matched = prefix
      ceiling = limit
    }
  }
  const need = (actionKey ? ACTION_OUTPUT_NEED[actionKey] : undefined) ?? DEFAULT_ACTION_NEED
  const thinks = THINKING_BY_DEFAULT.some(m => id.startsWith(m))
  return Math.min(ceiling, thinks ? need * 2 : need)
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude_cli: 'Claude 订阅模式（Claude CLI）',
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  gemini: 'Google Gemini API',
  custom: '自定义端点（OpenAI 兼容）',
}

const SETTINGS_KEY = 'filmgame:ai-settings'

export function loadAIConfig(): AIConfig {
  if (typeof window === 'undefined') return { provider: 'claude_cli' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : { provider: 'claude_cli' }
  } catch { return { provider: 'claude_cli' } }
}

export function saveAIConfig(config: AIConfig): void {
  if (typeof window === 'undefined') return
  // apiKey 不落 localStorage（BYOK 密钥仅经 POST /api/settings 上行，服务端加密存 DB）；
  // 本地仅保留非敏感的 provider/model/baseUrl/modelFast/modelThinking，用于下次打开设置页时的默认选中项。
  const { provider, model, baseUrl, modelFast, modelThinking } = config
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider, model, baseUrl, modelFast, modelThinking }))
}
