import { NextRequest, NextResponse } from 'next/server'
import { loadServerAIConfig, saveServerAIConfig } from '@/lib/ai/server-config'

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
    await saveServerAIConfig(body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
