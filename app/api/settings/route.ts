import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loadServerAIConfig, saveServerAIConfig } from '@/lib/ai/server-config'
import { withAuth } from '@/lib/server/auth'
import { assertPublicHttpUrl } from '@/lib/server/url-guard'

const AIConfigSchema = z.object({
  provider: z.enum(['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']),
  apiKey: z.string().max(256).optional(),
  model: z.string().max(128).optional(),
  baseUrl: z.string().url().max(512).optional(),
  modelFast: z.string().max(128).optional(),
  modelThinking: z.string().max(128).optional(),
})

export const GET = withAuth(async () => {
  const config = await loadServerAIConfig()
  const masked = { ...config }
  if (masked.apiKey) {
    masked.apiKey = masked.apiKey.length > 8
      ? masked.apiKey.slice(0, 4) + '•'.repeat(masked.apiKey.length - 8) + masked.apiKey.slice(-4)
      : '••••'
  }
  return NextResponse.json({ ok: true, config: masked, deployMode: process.env.DEPLOY_MODE ?? 'local' })
})

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const parsed = AIConfigSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid config' }, { status: 400 })
    }
    // 落库前收口 SSRF：createModel 是同步的、且在多处被调用，与其在每个调用点校验，
    // 不如保证存进设置里的 baseUrl 本身安全——后续所有 AI 调用都只会拿到已校验地址
    if (parsed.data.provider === 'custom' && parsed.data.baseUrl) {
      const guard = await assertPublicHttpUrl(parsed.data.baseUrl)
      if (!guard.ok) {
        return NextResponse.json({ ok: false, error: `API 地址不可用：${guard.error}` }, { status: 400 })
      }
    }
    await saveServerAIConfig(parsed.data)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
})
