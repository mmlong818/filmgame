import { NextRequest, NextResponse } from 'next/server'
import { runStructureGraph } from '@/lib/ai/lg-structure'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const context = body.context as Record<string, unknown>
    const { worldAnchor, scalePlan, characters } = context

    const { chapters, errors } = await runStructureGraph({ worldAnchor, scalePlan, characters })

    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: errors.join('; '),
        errorType: 'parse_failed',
      }, { status: 502 })
    }

    return NextResponse.json({ ok: true, result: { chapters } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errorType = msg.startsWith('no_cli:') ? 'no_cli'
      : msg.startsWith('timeout:') ? 'timeout' : 'unknown'
    return NextResponse.json({ ok: false, error: msg, errorType }, { status: 500 })
  }
}
