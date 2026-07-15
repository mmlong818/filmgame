import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyPassword, signSession } from '@/lib/server/crypto'
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/server/auth'

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
})

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ ok: false, error: 'wrong password' }, { status: 401 })
  }

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
