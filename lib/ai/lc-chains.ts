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
  maxRetries = 3
): Promise<unknown> {
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

async function runWithStructuredOutput(
  model: BaseChatModel,
  prompt: string,
  schema: z.ZodTypeAny
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structured = (model as any).withStructuredOutput(schema)
  return structured.invoke([new HumanMessage(prompt)])
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
  const cacheKey = `${config.provider}:${config.apiKey ?? ''}:${config.baseUrl ?? ''}`
  if (!cachedModel || cachedCacheKey !== cacheKey) {
    cachedModel = createModel(config, { timeoutMs })
    cachedCacheKey = cacheKey
  }
  return { model: cachedModel, provider: config.provider }
}

export async function runChain(opts: ChainRunOptions): Promise<unknown> {
  const { phase, action, context, timeoutMs = 120000 } = opts
  const key = `${phase}:${action}`
  const schema = SCHEMA_REGISTRY[key]

  if (!schema) {
    throw new Error(`No schema registered for ${key}`)
  }

  const prompt = buildPrompt(phase as Phase, action, context)
  const { model, provider } = await getModel(timeoutMs)

  if (provider === 'claude_cli') {
    return runWithCliRetry(model, prompt, schema)
  }
  return runWithStructuredOutput(model, prompt, schema)
}
