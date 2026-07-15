import { NextRequest, NextResponse } from 'next/server'
import { verifySession as verifySessionToken } from './crypto'

/** cookie 名与有效期集中管理，供 login/logout route 与 proxy.ts 共用 */
export const SESSION_COOKIE_NAME = 'filmgame_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 天

/** 从请求 cookie 取 session token 并校验；供 proxy.ts 与 route handler 双重校验共用 */
export function verifySession(req: NextRequest): boolean {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
  return verifySessionToken(token)
}

type RouteHandler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response

/**
 * route handler 包装器：在 handler 内再校验一次 session。
 * Next 16 文档明确要求不可只靠 proxy 做认证，这里作为每个受保护 route 的兜底。
 */
export function withAuth<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    if (!verifySession(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    return handler(req, ctx)
  }
}
