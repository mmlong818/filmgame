import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyPassword, signSession } from '@/lib/server/crypto'
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/server/auth'
import { checkRateLimit, registerFailure, clearFailures, clientKey } from '@/lib/server/rate-limit'

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
})

// 单密码门禁没有账号锁定概念，仅靠 scrypt 的计算成本节流不足以挡住持续爆破
const LOGIN_LIMIT = { limit: 8, windowMs: 5 * 60_000, blockMs: 15 * 60_000 }

export async function POST(req: NextRequest) {
  const key = `login:${clientKey(req.headers)}`
  const limited = checkRateLimit(key)
  if (limited.blocked) {
    return NextResponse.json(
      { ok: false, error: `尝试次数过多，请 ${Math.ceil(limited.retryAfterSeconds / 60)} 分钟后再试` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  let passwordOk: boolean
  try {
    passwordOk = verifyPassword(parsed.data.password)
  } catch {
    return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 })
  }

  if (!passwordOk) {
    const state = registerFailure(key, LOGIN_LIMIT)
    if (state.blocked) {
      return NextResponse.json(
        { ok: false, error: `尝试次数过多，请 ${Math.ceil(state.retryAfterSeconds / 60)} 分钟后再试` },
        { status: 429, headers: { 'Retry-After': String(state.retryAfterSeconds) } },
      )
    }
    return NextResponse.json({ ok: false, error: 'wrong password' }, { status: 401 })
  }

  clearFailures(key)
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const token = signSession({ exp })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // 本地 http 开发下 Secure cookie 无法写入，只在生产（https）启用
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return res
}
