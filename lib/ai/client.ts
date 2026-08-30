// 客户端 AI 请求封装：自动从当前项目的 aiMode 注入 mode 字段，避免每个调用点手写。
import { useProjectStore } from '@/lib/store/projectStore'
import { AiActionError, type AiErrorType } from '@/lib/ai/errors'

function currentMode(): 'fast' | 'thinking' | undefined {
  return useProjectStore.getState().project?.aiMode
}

/** POST /api/ai，自动带上当前项目的 aiMode。 */
export async function aiFetch(
  phase: string,
  action: string,
  context: Record<string, unknown>,
  init?: RequestInit,
): Promise<Response> {
  const mode = currentMode()
  return fetch('/api/ai', {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    body: JSON.stringify({ phase, action, context, ...(mode ? { mode } : {}) }),
  })
}

/**
 * POST /api/ai 并解析 JSON；失败时抛出携带 errorType/runId 的 AiActionError。
 * 传入 signal 即可中止（配合 useAiAction）。
 */
export async function aiJson<T = Record<string, unknown>>(
  phase: string,
  action: string,
  context: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await aiFetch(phase, action, context, { signal })
  let data: { ok?: boolean; error?: string; errorType?: AiErrorType; runId?: string } & Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new AiActionError(`AI 服务响应异常（HTTP ${res.status}）`)
  }
  if (!res.ok || !data.ok) {
    throw new AiActionError(data.error || `AI 调用失败（HTTP ${res.status}）`, data.errorType ?? 'unknown', data.runId)
  }
  return data as T
}

/** POST /api/ai/structure 或 /api/ai/structure/stream，自动带上当前项目的 aiMode。 */
export async function aiStructureFetch(
  url: '/api/ai/structure' | '/api/ai/structure/stream',
  context: Record<string, unknown>,
  init?: RequestInit,
): Promise<Response> {
  const mode = currentMode()
  return fetch(url, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    body: JSON.stringify({ context, ...(mode ? { mode } : {}) }),
  })
}
