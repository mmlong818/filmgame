import { NextRequest, NextResponse } from 'next/server'
import { buildPrompt } from '@/lib/ai/prompts'
import { isFallback } from '@/lib/ai/claude'
import { callProvider } from '@/lib/ai/call-provider'
import { loadServerAIConfig } from '@/lib/ai/server-config'
import type { Phase } from '@/lib/types/phase'

function getTimeout(phase: string, action: string): number {
  if (action === 'generate' && phase === 'structure') return 1800000
  if (action === 'generate' && (phase === 'branches' || phase === 'workshop')) return 1200000
  if (phase === 'structure') return 1800000
  if (phase === 'branches') return 1200000
  if (phase === 'workshop' && action === 'write_dialogue') return 180000
  if (phase === 'world' || phase === 'validate') return 90000
  return 120000
}

function classifyError(msg: string): { error: string; errorType: 'no_cli' | 'timeout' | 'parse_failed' | 'unknown' } {
  if (msg.startsWith('no_cli:')) return { error: msg.replace('no_cli: ', ''), errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg.replace('timeout: ', ''), errorType: 'timeout' }
  return { error: msg, errorType: 'unknown' }
}

export async function POST(req: NextRequest) {
  let phase: string | undefined
  let action: string | undefined
  try {
    const body = await req.json()
    ;({ phase, action } = body as { phase: Phase; action: string; context: Record<string, unknown> })
    const context = body.context as Record<string, unknown>
    const prompt = buildPrompt(phase as Phase, action, context)
    const timeoutMs = getTimeout(phase ?? '', action ?? '')

    const config = await loadServerAIConfig()
    const { raw, json } = await callProvider(prompt, config, timeoutMs)

    if (isFallback(json)) {
      return NextResponse.json({
        ok: false,
        error: 'parse_failed: AI response could not be parsed as JSON after 3 attempts',
        errorType: 'parse_failed',
        phase,
        action,
        raw,
      }, { status: 502 })
    }

    return NextResponse.json({ ok: true, result: json })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const { error, errorType } = classifyError(msg)
    return NextResponse.json({ ok: false, error, errorType, phase, action }, { status: 500 })
  }
}
