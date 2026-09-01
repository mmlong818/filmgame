import { HumanMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { z } from 'zod'
import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { DEFAULT_TIMEOUT_MS } from './config'
import { loadServerAIConfig } from './server-config'
import { SCHEMA_REGISTRY } from './schemas'
import { RETRY_SUFFIX } from './lc-cli-model'
import type { Phase } from '@/lib/types/phase'
import type { AiMode } from '@/lib/types/project'

/** 取当前已知的 root run id：优先用无 parent 的 run，否则任一已完成 run 的 trace_id 也指向根 run */
export function getRunId(collector: RunCollectorCallbackHandler): string | null {
  const root = collector.tracedRuns.find(r => !r.parent_run_id)
  if (root) return root.id
  const first = collector.tracedRuns[0]
  return first?.trace_id ?? first?.id ?? null
}

type Context = Record<string, unknown>

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

/**
 * 判断响应是否因达到输出上限被截断。各家字段不同：
 * Anthropic 用 `stop_reason: 'max_tokens'`，OpenAI 兼容端点（含 GLM/DeepSeek/Qwen）
 * 用 `finish_reason: 'length'`，Gemini 用 `finishReason: 'MAX_TOKENS'`。
 * LangChain 把它们放在 response_metadata / additional_kwargs 里，逐个探测。
 */
function isTruncated(result: { response_metadata?: Record<string, unknown>; additional_kwargs?: Record<string, unknown> }): boolean {
  const meta = { ...(result.response_metadata ?? {}), ...(result.additional_kwargs ?? {}) }
  const reason = String(
    meta.stop_reason ?? meta.finish_reason ?? meta.finishReason ?? '',
  ).toLowerCase()
  return reason === 'max_tokens' || reason === 'length'
}

/** 粗略 token 估算：中文约 1 token/字，英文与符号约 0.3 token/字符。仅用于错误提示。 */
function estimateTokens(text: string): number {
  const cjk = (text.match(/[一-鿿　-〿＀-￯]/g) ?? []).length
  return Math.round(cjk + (text.length - cjk) * 0.3)
}

async function runWithCliRetry(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny,
  callbacks: BaseCallbackHandler[],
  signal?: AbortSignal,
  maxRetries = 3
): Promise<unknown> {
  for (let i = 0; i < maxRetries; i++) {
    if (signal?.aborted) throw new Error('aborted: request cancelled')
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)], { callbacks, signal })
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    // 输出被 max_tokens 截断时重试没有意义：RETRY_SUFFIX 纠正的是「格式」，
    // 而截断是「长度」问题——同一提示重试三次会在同一处被砍断，白等三轮再失败。
    // 直接报可执行的错误：调高上限或减小单次生成规模。
    if (isTruncated(result)) {
      throw new Error(`truncated: 模型输出达到长度上限被截断（约 ${estimateTokens(raw)} token）——请在 AI 设置中改用输出上限更大的模型，或减少每章节点数后重试`)
    }
    const extracted = extractJson(raw)
    if (extracted !== null) {
      const parsed = schema.safeParse(extracted)
      if (parsed.success) return parsed.data
    }
  }
  throw new Error('parse_failed: AI response could not be parsed and validated after retries')
}

async function runWithStructuredOutput(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny,
  callbacks: BaseCallbackHandler[],
  invokeOptions?: { timeout?: number; signal?: AbortSignal }
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structured = (model as any).withStructuredOutput(schema)
  return structured.invoke([new HumanMessage(prompt)], { ...invokeOptions, callbacks })
}

export interface ChainRunOptions {
  phase: string
  action: string
  context: Context
  timeoutMs?: number
  mode?: AiMode
  /** 客户端断开/取消时中止上游调用（CLI 子进程会被 SIGKILL，HTTP 调用走 fetch abort） */
  signal?: AbortSignal
}

// 模块级缓存，避免每次请求重新创建 LangChain 实例导致内存泄漏
let cachedModel: BaseChatModel | null = null
let cachedCacheKey = ''

async function getModel(timeoutMs: number, mode?: AiMode, actionKey?: string): Promise<{ model: BaseChatModel; provider: string }> {
  const config = await loadServerAIConfig()
  // actionKey 必须进缓存键：输出预算按动作分配（整章生成 16K vs 单字段补全 4K），
  // 不入键会让后一个动作复用前一个动作的预算实例
  const cacheKey = `${config.provider}:${config.apiKey ?? ''}:${config.baseUrl ?? ''}:${config.model ?? ''}:${config.modelFast ?? ''}:${config.modelThinking ?? ''}:${mode ?? ''}:${timeoutMs}:${actionKey ?? ''}`
  if (!cachedModel || cachedCacheKey !== cacheKey) {
    cachedModel = createModel(config, { timeoutMs, mode, actionKey })
    cachedCacheKey = cacheKey
  }
  return { model: cachedModel, provider: config.provider }
}

export interface ChainRunResult {
  result: unknown
  runId: string | null
}

export async function runChain(opts: ChainRunOptions): Promise<ChainRunResult> {
  const { phase, action, context, timeoutMs = DEFAULT_TIMEOUT_MS, mode, signal } = opts
  const key = `${phase}:${action}`
  const schema = SCHEMA_REGISTRY[key]

  if (!schema) {
    throw new Error(`No schema registered for ${key}`)
  }

  const prompt = buildPrompt(phase as Phase, action, context)
  const { model, provider } = await getModel(timeoutMs, mode, key)
  const collector = new RunCollectorCallbackHandler()

  try {
    const result = provider === 'claude_cli'
      ? await runWithCliRetry(model, prompt, schema, [collector], signal)
      : await runWithStructuredOutput(
          model, prompt, schema, [collector],
          // @langchain/google-genai 的 ChatGoogleGenerativeAI 构造函数不支持 timeout 字段，
          // 借助 LangChain 通用的 RunnableConfig.timeout（invoke 时转换为 AbortSignal.timeout）兜底
          { ...(provider === 'gemini' ? { timeout: timeoutMs } : {}), ...(signal ? { signal } : {}) }
        )
    return { result, runId: getRunId(collector) }
  } catch (err) {
    // 捕获失败时也附上已知 runId，供路由层错误响应回传（便于按 trace 定位失败请求）
    if (err instanceof Error) (err as Error & { runId?: string | null }).runId = getRunId(collector)
    throw err
  }
}
