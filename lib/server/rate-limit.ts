// 进程内固定窗口限流。用于登录等低频端点：单实例部署下足够挡住在线爆破，
// 多实例部署需换成共享存储（Redis），此处不做过度设计。
interface Bucket {
  count: number
  resetAt: number
  blockedUntil: number
}

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 5000

function sweep(now: number): void {
  if (buckets.size < MAX_KEYS) return
  for (const [key, b] of buckets) {
    if (b.resetAt < now && b.blockedUntil < now) buckets.delete(key)
  }
}

export interface RateLimitOptions {
  /** 窗口内允许的失败次数 */
  limit: number
  /** 窗口长度（毫秒） */
  windowMs: number
  /** 超限后的封禁时长（毫秒） */
  blockMs: number
}

export interface RateLimitState {
  blocked: boolean
  retryAfterSeconds: number
}

/** 只读检查当前是否处于封禁中（不计数） */
export function checkRateLimit(key: string, now = Date.now()): RateLimitState {
  const b = buckets.get(key)
  if (b && b.blockedUntil > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((b.blockedUntil - now) / 1000) }
  }
  return { blocked: false, retryAfterSeconds: 0 }
}

/** 记一次失败；达到阈值则进入封禁 */
export function registerFailure(key: string, opts: RateLimitOptions, now = Date.now()): RateLimitState {
  sweep(now)
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs, blockedUntil: 0 })
    return { blocked: false, retryAfterSeconds: 0 }
  }
  b.count++
  if (b.count >= opts.limit) {
    b.blockedUntil = now + opts.blockMs
    b.count = 0
    b.resetAt = now + opts.windowMs
    return { blocked: true, retryAfterSeconds: Math.ceil(opts.blockMs / 1000) }
  }
  return { blocked: false, retryAfterSeconds: 0 }
}

/** 成功后清除该 key 的失败记录 */
export function clearFailures(key: string): void {
  buckets.delete(key)
}

/** 从请求头取客户端标识：优先反代传递的真实 IP，回落到直连地址 */
export function clientKey(headers: Headers, fallback = 'unknown'): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? fallback
}
