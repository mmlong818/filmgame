import { NextRequest, NextResponse } from 'next/server'
import { runStructureGraph } from '@/lib/ai/lg-structure'
import { withAuth } from '@/lib/server/auth'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { getRunId } from '@/lib/ai/lc-chains'

export const POST = withAuth(async (req: NextRequest) => {
  const collector = new RunCollectorCallbackHandler()
  try {
    const body = await req.json()
    const context = body.context as Record<string, unknown>
    const { worldAnchor, scalePlan, characters } = context

    const { chapters, errors, warnings } = await runStructureGraph(
      { worldAnchor, scalePlan, characters },
      { callbacks: [collector] }
    )
    const runId = getRunId(collector)

    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: errors.join('; '),
        errorType: 'parse_failed',
        runId,
      }, { status: 502 })
    }

    return NextResponse.json({ ok: true, result: { chapters }, warnings, runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errorType = msg.startsWith('no_cli:') ? 'no_cli'
      : msg.startsWith('timeout:') ? 'timeout' : 'unknown'
    return NextResponse.json({ ok: false, error: msg, errorType, runId: getRunId(collector) }, { status: 500 })
  }
})
