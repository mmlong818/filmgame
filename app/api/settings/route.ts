import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loadServerAIConfig, saveServerAIConfig } from '@/lib/ai/server-config'

const AIConfigSchema = z.object({
  provider: z.enum(['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']),
  apiKey: z.string().max(256).optional(),
  model: z.string().max(128).optional(),
  baseUrl: z.string().url().max(512).optional(),
})

export async function GET() {
  const config = await loadServerAIConfig()
  const masked = { ...config }
  if (masked.apiKey && masked.apiKey.length > 8) {
    masked.apiKey = masked.apiKey.slice(0, 4) + '•'.repeat(masked.apiKey.length - 8) + masked.apiKey.slice(-4)
  }
  return NextResponse.json({ ok: true, config: masked })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = AIConfigSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid config' }, { status: 400 })
    }
    await saveServerAIConfig(parsed.data)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
}
