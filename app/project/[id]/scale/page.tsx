'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { aiJson } from '@/lib/ai/client'
import { Skeleton } from '@/app/components/ui/skeleton'
import { AssistRail, AssistSection } from '@/app/components/ui/assist-rail'
import type { ScalePlan } from '@/lib/types/project'

// A2 展示端：分支节点数对应 lib/ai/schemas.ts ScalePlanSchema 的可选字段 branchCount
// （lib/types/project.ts 的 ScalePlan 尚未补上该字段，这里按结构兼容的扩展类型读取，不阻塞渲染）。
type ScalePlanWithBranchNodes = ScalePlan & { branchCount?: number }

function PlanCard({
  plan,
  selected,
  onSelect,
  nodeCount,
}: {
  plan: ScalePlan
  selected: boolean
  onSelect: () => void
  nodeCount: number
}) {
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const hasChapters = (plan.chapters?.length ?? 0) > 0
  const branchNodeCount = (plan as ScalePlanWithBranchNodes).branchCount

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`paper-sheet relative px-5 py-4 transition-colors ${
        selected ? 'border-2 border-vermilion' : 'border border-line/70 hover:bg-paper-dim'
      }`}
    >
      <span aria-hidden className={`pin ${selected ? 'pin-red' : ''}`} />

      {/* Top row: label + badge */}
      <div className="flex items-start justify-between mb-2">
        <span className="courier text-sm font-bold text-ink tracking-wide">{plan.label}</span>
        {selected && (
          <span className="text-xs text-vermilion font-medium">已选中 ✓</span>
        )}
      </div>

      {/* Core data row */}
      <p className="text-sm font-medium text-ink-soft mb-1">
        {plan.chapterCount} 章 × {plan.actCountPerChapter} 幕/章 = {plan.totalNodes} 节点
        <span className="text-pencil mx-1">·</span>
        {plan.totalBranches} 个分支
        {typeof branchNodeCount === 'number' && (
          <>
            <span className="text-pencil mx-1">·</span>
            预估分支节点 {branchNodeCount}
          </>
        )}
        <span className="text-pencil mx-1">·</span>
        预估 {plan.estimatedHours}h
      </p>

      {/* AI rationale */}
      {plan.aiRationale && (
        <p className="text-xs text-pencil italic mb-3">{plan.aiRationale}</p>
      )}

      {/* Change warning */}
      {!selected && nodeCount > 0 && (
        <p className="text-xs text-amberink mb-3">
          已有 {nodeCount} 个节点，更换方案将在进入结构阶段后需要重新生成结构
        </p>
      )}

      {/* Chapter outline collapsible */}
      {hasChapters && (
        <div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setChaptersOpen(o => !o) }}
            className="flex items-center gap-1 text-xs text-pencil hover:text-ink-soft mb-1"
          >
            <span className={`inline-block transition-transform ${chaptersOpen ? 'rotate-90' : ''}`}>▶</span>
            章节大纲（{plan.chapters!.length} 章）
          </button>
          {chaptersOpen && (
            <div className="space-y-1 pl-3 border-l-2 border-line mt-1">
              {plan.chapters!.map((ch, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="courier text-vermilion shrink-0 font-medium">第{i + 1}章</span>
                  <span className="font-medium text-ink-soft shrink-0">{ch.title}</span>
                  {ch.brief && <span className="text-pencil">— {ch.brief}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompareTable({
  plans,
  selectedId,
}: {
  plans: ScalePlan[]
  selectedId: string | null
}) {
  const rows: { label: string; key: keyof ScalePlanWithBranchNodes }[] = [
    { label: '章数', key: 'chapterCount' },
    { label: '总节点数', key: 'totalNodes' },
    { label: '分支节点数', key: 'branchCount' },
    { label: '分支数', key: 'totalBranches' },
    { label: '预估工时', key: 'estimatedHours' },
  ]

  return (
    <div className="mt-6 overflow-x-auto border border-line">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-paper-dim">
            <th className="text-left px-4 py-2.5 text-pencil text-[11px] tracking-wider font-medium border-b border-line w-32">维度</th>
            {plans.map(plan => (
              <th
                key={plan.id}
                className={`px-4 py-2.5 text-center text-[11px] tracking-wider font-medium border-b border-line ${selectedId === plan.id ? 'text-vermilion bg-paper' : 'text-pencil'}`}
              >
                {plan.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} className={ri % 2 === 0 ? 'bg-paper' : 'bg-paper-dim/50'}>
              <td className="px-4 py-2.5 text-pencil border-b border-line-soft">{row.label}</td>
              {plans.map(plan => {
                const val = (plan as ScalePlanWithBranchNodes)[row.key]
                const display = val === undefined ? '—' : row.key === 'estimatedHours' ? `${val}h` : val
                return (
                  <td
                    key={plan.id}
                    className={`px-4 py-2.5 text-center font-medium border-b border-line-soft ${selectedId === plan.id ? 'text-vermilion' : 'text-ink'}`}
                  >
                    {display as string}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ScalePage() {
  const router = useRouter()
  const { project, setScalePlanOptions, selectScalePlan, advancePhase, clearDownstream, clearStaleFlag } = useProjectStore()
  const ai = useAiAction()

  useEffect(() => {
    if (project?.scalePlanOptions.length === 0 && project?.worldAnchor) {
      void generatePlans()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  async function generatePlans() {
    if (!project?.worldAnchor) return
    const data = await ai.run('生成规模方案', signal =>
      aiJson<{ result?: { plans?: ScalePlan[] } }>(
        'scale',
        'generate',
        project.worldAnchor as unknown as Record<string, unknown>,
        signal,
      ),
    )
    if (data?.result?.plans) {
      setScalePlanOptions(data.result.plans)
    }
  }

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-pencil text-sm">
      加载中...
    </div>
  )

  const selected = project.selectedScalePlanId
  const nodeCount = project.nodes.length
  const loading = Boolean(ai.loading)
  const endings = project.worldAnchor?.endingsDesign ?? []
  const typeLabel: Record<string, string> = { good: '好', bad: '坏', neutral: '中立', secret: '隐藏' }
  const typeColor: Record<string, string> = { good: 'text-leaf', bad: 'text-vermilion', neutral: 'text-pencil', secret: 'text-inkblue' }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 bg-paper min-h-screen">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-ink">规模规划</h2>
        <p className="text-sm text-pencil mt-1">选择适合你的项目体量</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── 核心产出区 ── */}
        <section aria-label="核心产出区" className="flex-1 min-w-0">
          {project.downstreamStale && (
            <div className="mb-4 flex items-center gap-3 bg-paper border-l-[3px] border-amberink px-4 py-3">
              <span className="text-amberink text-sm flex-1">世界锚点已更新，当前方案基于旧版本</span>
              <button
                type="button"
                onClick={() => { clearDownstream('scale'); void generatePlans() }}
                className="text-xs px-3 py-1.5 bg-vermilion text-paper hover:bg-vermilion-deep"
              >重新生成</button>
              <button
                type="button"
                onClick={() => clearStaleFlag()}
                className="text-xs px-3 py-1.5 border border-line text-ink-soft hover:bg-paper-dim"
              >忽略</button>
            </div>
          )}

          {loading ? (
            <div className="grid gap-4" role="status" aria-label="AI 正在生成规模方案">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="paper-sheet border border-line/70 px-5 py-4">
                  <Skeleton className="h-4 w-28 mb-3" />
                  <Skeleton className="h-3.5 w-full mb-2" />
                  <Skeleton className="h-3.5 w-3/5" />
                </div>
              ))}
            </div>
          ) : project.scalePlanOptions.length === 0 ? (
            <div className="text-center py-16 text-pencil">
              <p className="text-sm">暂无方案，请先完成世界锚点设置</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4" role="radiogroup" aria-label="规模方案">
                {project.scalePlanOptions.map(plan => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    selected={selected === plan.id}
                    onSelect={() => selectScalePlan(plan.id)}
                    nodeCount={nodeCount}
                  />
                ))}
              </div>

              {project.scalePlanOptions.length > 1 && (
                <CompareTable plans={project.scalePlanOptions} selectedId={selected} />
              )}
            </>
          )}

          <div className="flex justify-end mt-8">
            <button
              type="button"
              onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/structure`) }}
              disabled={!selected}
              className="px-5 py-2 bg-vermilion text-paper text-sm font-medium hover:bg-vermilion-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一步：结构设计 →
            </button>
          </div>
        </section>

        {/* ── 辅助区 ── */}
        <AssistRail>
          <AssistSection title="AI 协作">
            <div className="bg-paper border border-line-soft p-3.5 space-y-3">
              {loading ? (
                <button
                  type="button"
                  onClick={() => ai.cancel()}
                  className="text-sm text-vermilion hover:text-vermilion-deep"
                >中止生成</button>
              ) : (
                <button
                  type="button"
                  onClick={() => void generatePlans()}
                  className="text-sm text-inkblue hover:text-vermilion"
                >重新生成</button>
              )}
              {ai.error && (
                <div className="bg-paper border-l-[3px] border-vermilion px-3 py-2.5" role="alert">
                  <p className="text-ink-soft text-xs mb-1.5">{ai.error}</p>
                  <button
                    type="button"
                    onClick={() => ai.retry()}
                    className="text-vermilion hover:text-vermilion-deep underline text-xs"
                  >重试</button>
                </div>
              )}
            </div>
          </AssistSection>

          {endings.length > 0 && (
            <AssistSection title="结局线摘要">
              <p className="text-[11px] text-amberink mb-2">已设计 {endings.length} 条结局线（规模方案需容纳所有分支路径）</p>
              <div className="flex flex-wrap gap-1.5">
                {endings.map((e, i) => (
                  <span key={e.id ?? i} className="text-[11px] bg-paper border border-line px-2.5 py-1">
                    <span className={`font-medium ${typeColor[e.type] ?? 'text-pencil'}`}>[{typeLabel[e.type] ?? e.type}]</span>
                    <span className="text-ink-soft ml-1">{e.title}</span>
                  </span>
                ))}
              </div>
            </AssistSection>
          )}

          <AssistSection title="说明">
            <div className="text-[11.5px] text-pencil leading-relaxed space-y-1.5">
              <p>体量方案由「章数 × 幕/章」决定节点总量与分支数，用于估算后续结构设计与写作的工作量。</p>
              <p>预估工时为粗略估算口径，实际耗时随内容复杂度浮动；已有节点时更换方案需重新生成结构。</p>
            </div>
          </AssistSection>
        </AssistRail>
      </div>
    </div>
  )
}
