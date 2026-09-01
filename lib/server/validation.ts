// 四个项目 API 路由此前各自复制了同一份 id 校验与 zod 错误格式化实现
// （SAFE_ID 四份、validateId 三份、formatZodError 三份）。改一处漏三处是迟早的事，
// 尤其 SAFE_ID 是安全相关的白名单。收敛到这里统一维护。
import type { ZodError } from 'zod'

/** 允许的 id 字符集：nanoid 生成的 id 只含字母数字与 -_，用作路径参数前必须校验 */
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id)
}

export function formatZodError(error: ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}
