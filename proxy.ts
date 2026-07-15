import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/server/auth'

/**
 * 全站门禁（Next 16：middleware.ts → proxy.ts，导出函数名必须是 `proxy`）。
 * 未认证浏览器请求 → redirect /login；未认证 /api/** → 401 JSON。
 * 注意：Next 16 文档明确要求不可只靠此层做认证，各 route handler 内还有 withAuth 兜底二次校验。
 * 不设置 runtime 配置项——proxy 默认且只能用 Node.js runtime，显式设置会报错。
 */
export function proxy(request: NextRequest) {
  if (verifySession(request)) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    // 排除静态资源、favicon 与登录相关路径，其余全部经过门禁
    '/((?!_next/static|_next/image|favicon.ico|login|api/auth/login).*)',
  ],
}
