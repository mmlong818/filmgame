import { HumanMessage } from '@langchain/core/messages'
import { ClaudeCLIModel } from './lc-cli-model'
import type { AIProvider } from './config'
import { assertPublicHttpUrl } from '@/lib/server/url-guard'

const MODELS_TIMEOUT_MS = 15000
const TEST_TIMEOUT_MS = 20000
const CLI_TEST_TIMEOUT_MS = 5000

export interface DiscoverModelsInput {
  provider: AIProvider
  apiKey?: string
  baseUrl?: string
}

export type DiscoverModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; status: number; error: string }

export interface TestConnectionInput {
  provider: AIProvider
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface TestConnectionResult {
  ok: boolean
  latencyMs: number
  error?: string
  hint?: string
}

// OpenAI /v1/models 返回的列表混有语音/嵌入/绘图等非对话模型，按 id 关键字过滤掉明显不可用于对话的项。
const OPENAI_NON_CHAT_PATTERN = /whisper|tts|embedding|dall-e|moderation/i

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function upstreamErrorMessage(status: number, bodySnippet: string): string {
  if (status === 401 || status === 403) return 'API Key 无效或无权限'
  if (status === 404) return '接口地址不存在（请检查 Base URL）'
  return `上游返回 ${status}${bodySnippet ? `：${bodySnippet}` : ''}`
}

async function readErrorSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, 200)
  } catch {
    return ''
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
}

/** 服务端代理拉取各 provider 的可用模型列表；key 只在本次请求中转发，不落库不回显。 */
export async function discoverModels(input: DiscoverModelsInput): Promise<DiscoverModelsResult> {
  const { provider, apiKey, baseUrl } = input

  if (provider === 'claude_cli') {
    return { ok: false, status: 400, error: 'Claude 订阅模式（CLI）不支持模型列表拉取' }
  }
  if (provider !== 'custom' && !apiKey) {
    return { ok: false, status: 400, error: '缺少 API Key' }
  }
  if (provider === 'custom' && !baseUrl) {
    return { ok: false, status: 400, error: '缺少 API 地址（Base URL）' }
  }

  try {
    switch (provider) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
        })
        if (!res.ok) {
          const snippet = await readErrorSnippet(res)
          return { ok: false, status: res.status, error: upstreamErrorMessage(res.status, snippet) }
        }
        const json = (await res.json()) as { data?: Array<{ id: string }> }
        return { ok: true, models: (json.data ?? []).map(m => m.id) }
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
        })
        if (!res.ok) {
          const snippet = await readErrorSnippet(res)
          return { ok: false, status: res.status, error: upstreamErrorMessage(res.status, snippet) }
        }
        const json = (await res.json()) as { data?: Array<{ id: string }> }
        const ids = (json.data ?? []).map(m => m.id).filter(id => !OPENAI_NON_CHAT_PATTERN.test(id))
        ids.sort()
        return { ok: true, models: ids }
      }

      case 'gemini': {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey!)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) })
        if (!res.ok) {
          const snippet = await readErrorSnippet(res)
          return { ok: false, status: res.status, error: upstreamErrorMessage(res.status, snippet) }
        }
        const json = (await res.json()) as {
          models?: Array<{ name: string; supportedGenerationMethods?: string[] }>
        }
        const models = (json.models ?? [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace(/^models\//, ''))
        return { ok: true, models }
      }

      case 'custom': {
        // 用户提供的地址会带着 API Key 被服务端请求且响应回显，必须先挡住内网/元数据地址
        const guard = await assertPublicHttpUrl(baseUrl!)
        if (!guard.ok) return { ok: false, status: 400, error: guard.error! }
        const url = `${stripTrailingSlash(baseUrl!)}/models`
        const headers: Record<string, string> = {}
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) })
        if (!res.ok) {
          const snippet = await readErrorSnippet(res)
          return { ok: false, status: res.status, error: upstreamErrorMessage(res.status, snippet) }
        }
        const json = (await res.json()) as { data?: Array<{ id: string }> }
        return { ok: true, models: (json.data ?? []).map(m => m.id) }
      }

      default:
        return { ok: false, status: 400, error: '不支持的 provider' }
    }
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, status: 504, error: '请求超时，请检查网络或地址是否可达' }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 502, error: `网络请求失败：${msg}` }
  }
}

/** 用当前表单配置发一条最小消息做连接测试；claude_cli 改为探测本机 CLI（不需要 key）。 */
export async function testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
  const { provider, apiKey, baseUrl, model } = input
  const start = Date.now()

  if (provider === 'claude_cli') {
    try {
      const cli = new ClaudeCLIModel({ timeoutMs: CLI_TEST_TIMEOUT_MS })
      await cli.invoke([new HumanMessage('hi')])
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      const latencyMs = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('no_cli:')) {
        return {
          ok: false,
          latencyMs,
          error: '未检测到本机 Claude CLI',
          hint: '请确认已安装 @anthropic-ai/claude-code 并完成登录',
        }
      }
      if (msg.startsWith('timeout:')) {
        return {
          ok: false,
          latencyMs,
          error: 'CLI 响应超时',
          hint: '请确认已登录 Claude 订阅账号，或稍后重试',
        }
      }
      return { ok: false, latencyMs, error: msg, hint: '请检查 Claude CLI 是否可正常运行' }
    }
  }

  if (provider !== 'custom' && !apiKey) {
    return { ok: false, latencyMs: 0, error: '缺少 API Key' }
  }
  if (provider === 'custom' && !baseUrl) {
    return { ok: false, latencyMs: 0, error: '缺少 API 地址（Base URL）' }
  }
  if (!model) {
    return { ok: false, latencyMs: 0, error: '缺少测试模型' }
  }

  try {
    let res: Response
    switch (provider) {
      case 'anthropic':
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey!,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        })
        break

      case 'openai':
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        })
        break

      case 'gemini':
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey!)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'hi' }] }],
              generationConfig: { maxOutputTokens: 8 },
            }),
            signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
          },
        )
        break

      case 'custom': {
        // 同 discoverModels：拦住指向内网/云元数据的 Base URL（SSRF）
        const guard = await assertPublicHttpUrl(baseUrl!)
        if (!guard.ok) return { ok: false, latencyMs: Date.now() - start, error: guard.error!, hint: '请填写公网可访问的 https 接口地址' }
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`
        res = await fetch(`${stripTrailingSlash(baseUrl!)}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        })
        break
      }

      default:
        return { ok: false, latencyMs: Date.now() - start, error: '不支持的 provider' }
    }

    const latencyMs = Date.now() - start
    if (!res.ok) {
      const snippet = await readErrorSnippet(res)
      const hint =
        res.status === 401 || res.status === 403
          ? 'API Key 无效或无权限，请检查密钥'
          : res.status === 404
            ? '请检查 Base URL 或模型名称是否正确'
            : '请检查上游服务状态'
      return { ok: false, latencyMs, error: upstreamErrorMessage(res.status, snippet), hint }
    }
    return { ok: true, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - start
    if (isAbortError(err)) {
      return { ok: false, latencyMs, error: '连接超时', hint: '请检查网络或该地址是否可达' }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, latencyMs, error: `网络请求失败：${msg}`, hint: '请检查网络连接与服务状态' }
  }
}
