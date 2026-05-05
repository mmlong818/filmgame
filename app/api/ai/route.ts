import { NextRequest, NextResponse } from 'next/server'
import { runChain } from '@/lib/ai/lc-chains'
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

function classifyError(msg: string): { error: string; errorType: string } {
  if (msg.startsWith('no_cli:')) return { error: msg, errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg, errorType: 'timeout' }
  if (msg.startsWith('parse_failed:')) return { error: msg, errorType: 'parse_failed' }
  return { error: msg, errorType: 'unknown' }
}

export async function POST(req: NextRequest) {
  let phase: string | undefined
  let action: string | undefined
  try {
    const body = await req.json()
    ;({ phase, action } = body as { phase: Phase; action: string })
    const context = body.context as Record<string, unknown>
    const timeoutMs = getTimeout(phase ?? '', action ?? '')

    const result = await runChain({ phase: phase!, action: action!, context, timeoutMs })
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const { error, errorType } = classifyError(msg)
    return NextResponse.json({ ok: false, error, errorType, phase, action }, { status: 500 })
  }
}
