import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/server/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete({ name: SESSION_COOKIE_NAME, path: '/' })
  return res
}
