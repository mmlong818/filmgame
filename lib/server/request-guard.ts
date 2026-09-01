// AI 路由的 context 是自由形状的对象（各阶段字段不同），无法用 zod 精确建模，
// 但不能因此完全不设限：它会被整个拼进 prompt、写入临时文件、发往上游按 token 计费。
// 这里只做形状与体积的粗粒度守卫，挡住畸形/超大载荷造成的内存与成本放大。

/** context 序列化后的字节上限：一个满配项目的完整上下文约数百 KB，2MB 留足余量 */
const MAX_CONTEXT_BYTES = 2 * 1024 * 1024

export type ContextGuardResult =
  | { ok: true; context: Record<string, unknown> }
  | { ok: false; error: string }

export function guardContext(raw: unknown): ContextGuardResult {
  if (raw === undefined || raw === null) return { ok: true, context: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'context 必须是对象' }
  }
  let bytes: number
  try {
    bytes = new TextEncoder().encode(JSON.stringify(raw)).byteLength
  } catch {
    return { ok: false, error: 'context 无法序列化（可能含循环引用）' }
  }
  if (bytes > MAX_CONTEXT_BYTES) {
    return { ok: false, error: `context 过大（${Math.round(bytes / 1024)}KB，上限 ${MAX_CONTEXT_BYTES / 1024}KB）` }
  }
  return { ok: true, context: raw as Record<string, unknown> }
}
