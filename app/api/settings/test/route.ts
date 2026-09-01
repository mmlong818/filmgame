import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/server/auth'
import { testConnection } from '@/lib/ai/model-discovery'

const BodySchema = z.object({
  provider: z.enum(['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']),
  apiKey: z.string().max(256).optional(),
  baseUrl: z.string().url().max(512).optional(),
  model: z.string().max(128).optional(),
})

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid request' }, { status: 400 })
    }
    const result = await testConnection(parsed.data)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
})
