// 客户端 AI 请求封装：自动从当前项目的 aiMode 注入 mode 字段，避免每个调用点手写。
import { useProjectStore } from '@/lib/store/projectStore'

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
