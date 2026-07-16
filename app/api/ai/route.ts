import { NextRequest, NextResponse } from 'next/server'
import { runChain } from '@/lib/ai/lc-chains'
import { withAuth } from '@/lib/server/auth'
import type { Phase } from '@/lib/types/phase'

// glm-5.2 是推理模型，单次调用实测可能耗时 1~10 分钟（真实检查中 write_dialogue、
// choice_consequence 都出现过超过 3~4 分钟仍未返回的情况）。此前单字段动作
// （fill_emotion/suggest_choices/scene_analysis/scene_tension/choice_consequence/
// revise_dialogue/character_voice 等）只给 120s，validate/world 阶段只给 90s，
// 远小于模型实际耗时，会把"还在思考"误判成超时错误。统一按 10 分钟兜底，
// 只保留大批量生成（structure/branches 的 generate）更长的预算。
function getTimeout(phase: string, action: string): number {
  if (action === 'generate' && phase === 'structure') return 1800000
  if (action === 'generate' && (phase === 'branches' || phase === 'workshop')) return 1200000
  if (phase === 'structure') return 1800000
  if (phase === 'branches') return 1200000
  return 600000
}

function classifyError(msg: string): { error: string; errorType: string } {
  if (msg.startsWith('no_cli:')) return { error: msg, errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg, errorType: 'timeout' }
  if (msg.startsWith('parse_failed:')) return { error: msg, errorType: 'parse_failed' }
  return { error: msg, errorType: 'unknown' }
}

export const POST = withAuth(async (req: NextRequest) => {
  let phase: string | undefined
  let action: string | undefined
  try {
    const body = await req.json()
    ;({ phase, action } = body as { phase: Phase; action: string })
    const context = body.context as Record<string, unknown>
    const timeoutMs = getTimeout(phase ?? '', action ?? '')

    const { result, runId } = await runChain({ phase: phase!, action: action!, context, timeoutMs })
    return NextResponse.json({ ok: true, result, runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const { error, errorType } = classifyError(msg)
    const runId = (err instanceof Error ? (err as Error & { runId?: string | null }).runId : null) ?? null
    return NextResponse.json({ ok: false, error, errorType, phase, action, runId }, { status: 500 })
  }
})
