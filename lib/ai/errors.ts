// AI 错误的统一形态：服务端 classifyError 产出的 errorType 在此映射为可操作的中文引导。
// 此前后端已返回 errorType 但前端零处理，所有页面只把 error 字符串原样展示。

export type AiErrorType = 'no_cli' | 'timeout' | 'parse_failed' | 'unknown'

export class AiActionError extends Error {
  errorType: AiErrorType
  runId?: string
  constructor(message: string, errorType: AiErrorType = 'unknown', runId?: string) {
    super(message)
    this.name = 'AiActionError'
    this.errorType = errorType
    this.runId = runId
  }
}

const HINTS: Record<AiErrorType, string> = {
  no_cli: '未检测到 Claude CLI：请确认本机已安装并登录 claude 命令，或到「AI 设置」切换其他 Provider。',
  timeout: 'AI 响应超时：可切换到快速模式、缩小生成范围后重试；本地部署可直接重试。',
  parse_failed: 'AI 返回内容无法解析（已自动重试仍失败）：请再试一次，或切换思考模式提升输出质量。',
  unknown: '',
}

/** 把任意抛出物转成用户可读的错误提示（含差异化引导与 trace）。 */
export function formatAiError(e: unknown): string {
  if (e instanceof AiActionError) {
    const hint = HINTS[e.errorType]
    const trace = e.runId ? `（trace: ${e.runId}）` : ''
    return hint ? `${hint}${trace}` : `${e.message || 'AI 调用失败'}${trace}`
  }
  if (e instanceof Error) return e.message || 'AI 调用失败'
  return 'AI 调用失败'
}

/** 判断是否为用户主动取消（不应显示为错误）。 */
export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
