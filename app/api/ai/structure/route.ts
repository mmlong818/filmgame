import { NextRequest, NextResponse } from 'next/server'
import { runStructureGraph } from '@/lib/ai/lg-structure'
import { withAuth } from '@/lib/server/auth'
import { guardContext } from '@/lib/server/request-guard'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { getRunId } from '@/lib/ai/lc-chains'
import type { AiMode } from '@/lib/types/project'

export const POST = withAuth(async (req: NextRequest) => {
  const collector = new RunCollectorCallbackHandler()
  try {
    const body = await req.json()
    const guarded = guardContext(body.context)
    if (!guarded.ok) {
      return NextResponse.json({ ok: false, error: guarded.error, errorType: 'bad_request' }, { status: 400 })
    }
    const context = guarded.context
    const mode = body.mode as AiMode | undefined
    const { worldAnchor, scalePlan, characters } = context

    const { chapters, errors, warnings } = await runStructureGraph(
      { worldAnchor, scalePlan, characters, mode },
      // req.signal：客户端取消/断开时中止各章的模型调用，释放 CLI 并发槽
      { callbacks: [collector], signal: req.signal }
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
      : msg.startsWith('timeout:') ? 'timeout'
      : msg.startsWith('truncated:') ? 'truncated' : 'unknown'
    return NextResponse.json({ ok: false, error: msg, errorType, runId: getRunId(collector) }, { status: 500 })
  }
})
