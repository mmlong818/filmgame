import { HumanMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { z } from 'zod'
import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { loadServerAIConfig } from './server-config'
import { SCHEMA_REGISTRY } from './schemas'
import { RETRY_SUFFIX } from './lc-cli-model'
import type { Phase } from '@/lib/types/phase'

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

async function runWithCliRetry(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny,
  callbacks: BaseCallbackHandler[],
  maxRetries = 3
): Promise<unknown> {
  for (let i = 0; i < maxRetries; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)], { callbacks })
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
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
  invokeOptions?: { timeout?: number }
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
}

// 模块级缓存，避免每次请求重新创建 LangChain 实例导致内存泄漏
let cachedModel: BaseChatModel | null = null
let cachedCacheKey = ''

async function getModel(timeoutMs: number): Promise<{ model: BaseChatModel; provider: string }> {
  const config = await loadServerAIConfig()
  const cacheKey = `${config.provider}:${config.apiKey ?? ''}:${config.baseUrl ?? ''}:${config.model ?? ''}:${timeoutMs}`
  if (!cachedModel || cachedCacheKey !== cacheKey) {
    cachedModel = createModel(config, { timeoutMs })
    cachedCacheKey = cacheKey
  }
  return { model: cachedModel, provider: config.provider }
}

export interface ChainRunResult {
  result: unknown
  runId: string | null
}

export async function runChain(opts: ChainRunOptions): Promise<ChainRunResult> {
  const { phase, action, context, timeoutMs = 120000 } = opts
  const key = `${phase}:${action}`
  const schema = SCHEMA_REGISTRY[key]

  if (!schema) {
    throw new Error(`No schema registered for ${key}`)
  }

  const prompt = buildPrompt(phase as Phase, action, context)
  const { model, provider } = await getModel(timeoutMs)
  const collector = new RunCollectorCallbackHandler()

  try {
    const result = provider === 'claude_cli'
      ? await runWithCliRetry(model, prompt, schema, [collector])
      : await runWithStructuredOutput(
          model, prompt, schema, [collector],
          // @langchain/google-genai 的 ChatGoogleGenerativeAI 构造函数不支持 timeout 字段，
          // 借助 LangChain 通用的 RunnableConfig.timeout（invoke 时转换为 AbortSignal.timeout）兜底
          provider === 'gemini' ? { timeout: timeoutMs } : undefined
        )
    return { result, runId: getRunId(collector) }
  } catch (err) {
    // 捕获失败时也附上已知 runId，供路由层错误响应回传（便于按 trace 定位失败请求）
    if (err instanceof Error) (err as Error & { runId?: string | null }).runId = getRunId(collector)
    throw err
  }
}
