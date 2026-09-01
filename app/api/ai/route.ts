import { NextRequest, NextResponse } from 'next/server'
import { runChain } from '@/lib/ai/lc-chains'
import { withAuth } from '@/lib/server/auth'
import { guardContext } from '@/lib/server/request-guard'
import type { Phase } from '@/lib/types/phase'
import type { AiMode } from '@/lib/types/project'

// glm-5.2 是推理模型，单次调用实测可能耗时 1~10 分钟（真实检查中 write_dialogue、
// choice_consequence 都出现过超过 3~4 分钟仍未返回的情况）。此前单字段动作
// （fill_emotion/suggest_choices/scene_analysis/scene_tension/choice_consequence/
// revise_dialogue/character_voice 等）只给 120s，validate/world 阶段只给 90s，
// 远小于模型实际耗时，会把"还在思考"误判成超时错误。统一按 10 分钟兜底，
// 只保留大批量生成（structure/branches 的 generate）更长的预算。
const FAST_TIMEOUT_FLOOR = 60000

function baseTimeout(phase: string, action: string): number {
  if (action === 'generate' && phase === 'structure') return 1800000
  if (action === 'generate' && (phase === 'branches' || phase === 'workshop')) return 1200000
  if (phase === 'structure') return 1800000
  if (phase === 'branches') return 1200000
  return 600000
}

// fast 模式下用现有超时预算的 1/3（下限 60s）；thinking（含缺省）沿用现状。
function getTimeout(phase: string, action: string, mode?: AiMode): number {
  const base = baseTimeout(phase, action)
  if (mode !== 'fast') return base
  return Math.max(FAST_TIMEOUT_FLOOR, Math.round(base / 3))
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
    const guarded = guardContext(body.context)
    if (!guarded.ok) {
      return NextResponse.json({ ok: false, error: guarded.error, errorType: 'bad_request' }, { status: 400 })
    }
    const context = guarded.context
    const mode = body.mode as AiMode | undefined
    const timeoutMs = getTimeout(phase ?? '', action ?? '', mode)

    // req.signal 在客户端取消/断开时触发：一路传到 CLI 子进程与上游 HTTP 调用，
    // 否则用户关页后任务仍跑满超时，占死仅有的 2 个 CLI 并发槽
    const { result, runId } = await runChain({ phase: phase!, action: action!, context, timeoutMs, mode, signal: req.signal })
    return NextResponse.json({ ok: true, result, runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const { error, errorType } = classifyError(msg)
    const runId = (err instanceof Error ? (err as Error & { runId?: string | null }).runId : null) ?? null
    return NextResponse.json({ ok: false, error, errorType, phase, action, runId }, { status: 500 })
  }
})
