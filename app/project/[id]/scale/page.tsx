'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import type { ScalePlan } from '@/lib/types/project'

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

  return (
    <div
      onClick={onSelect}
      className={`
        relative border-2 rounded-xl p-5 cursor-pointer transition-all
        ${selected ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-amber-200'}
      `}
    >
      {/* Top row: label + badge */}
      <div className="flex items-start justify-between mb-2">
        <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${selected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
          {plan.label}
        </span>
        {selected && (
          <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">已选中 ✓</span>
        )}
      </div>

      {/* Core data row */}
      <p className="text-sm font-medium text-gray-800 mb-1">
        {plan.chapterCount} 章 × {plan.actCountPerChapter} 幕/章 = {plan.totalNodes} 节点
        <span className="text-gray-400 mx-1">·</span>
        {plan.totalBranches} 个分支
        <span className="text-gray-400 mx-1">·</span>
        预估 {plan.estimatedHours}h
      </p>

      {/* AI rationale */}
      {plan.aiRationale && (
        <p className="text-xs text-gray-400 italic mb-3">{plan.aiRationale}</p>
      )}

      {/* Change warning */}
      {!selected && nodeCount > 0 && (
        <p className="text-xs text-amber-600 mb-3">
          ⚠️ 已有 {nodeCount} 个节点，更换方案将在进入结构阶段后需要重新生成结构
        </p>
      )}

      {/* Chapter outline collapsible */}
      {hasChapters && (
        <div>
          <button
            onClick={(e) => { e.stopPropagation(); setChaptersOpen(o => !o) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-1"
          >
            <span className={`transition-transform ${chaptersOpen ? 'rotate-90' : ''}`}>▶</span>
            章节大纲（{plan.chapters!.length} 章）
          </button>
          {chaptersOpen && (
            <div className="space-y-1 pl-3 border-l-2 border-amber-200 mt-1">
              {plan.chapters!.map((ch, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-amber-500 shrink-0 font-medium">第{i + 1}章</span>
                  <span className="font-medium text-gray-700 shrink-0">{ch.title}</span>
                  {ch.brief && <span className="text-gray-400">— {ch.brief}</span>}
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
  const rows: { label: string; key: keyof ScalePlan }[] = [
    { label: '章数', key: 'chapterCount' },
    { label: '总节点数', key: 'totalNodes' },
    { label: '分支数', key: 'totalBranches' },
    { label: '预估工时', key: 'estimatedHours' },
  ]

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-32">维度</th>
            {plans.map(plan => (
              <th
                key={plan.id}
                className={`px-4 py-2.5 text-center font-medium ${selectedId === plan.id ? 'text-amber-600 bg-amber-50' : 'text-gray-600'}`}
              >
                {plan.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-4 py-2.5 text-gray-500">{row.label}</td>
              {plans.map(plan => {
                const val = plan[row.key]
                const display = row.key === 'estimatedHours' ? `${val}h` : val
                return (
                  <td
                    key={plan.id}
                    className={`px-4 py-2.5 text-center font-medium ${selectedId === plan.id ? 'text-amber-600' : 'text-gray-800'}`}
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (project?.scalePlanOptions.length === 0 && project?.worldAnchor) {
      generatePlans()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generatePlans() {
    if (!project?.worldAnchor) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'scale', action: 'generate', context: project.worldAnchor }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'AI 服务不可用，请稍后重试')
        return
      }
      if (data.result?.plans) {
        setScalePlanOptions(data.result.plans as ScalePlan[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 服务不可用，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      加载中...
    </div>
  )

  const selected = project.selectedScalePlanId
  const nodeCount = project.nodes.length

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 bg-white min-h-screen">
      {project.downstreamStale && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-600 text-sm flex-1">世界锚点已更新，当前方案基于旧版本</span>
          <button
            onClick={() => { clearDownstream(); generatePlans() }}
            className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >重新生成</button>
          <button
            onClick={() => clearStaleFlag()}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          >忽略</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">规模规划</h2>
          <p className="text-sm text-gray-500 mt-1">选择适合你的项目体量</p>
        </div>
        <button
          onClick={generatePlans}
          disabled={loading}
          className="text-sm text-amber-600 hover:text-amber-700 disabled:opacity-40"
        >
          {loading ? '生成中...' : '重新生成'}
        </button>
      </div>

      {(() => {
        const endings = project.worldAnchor?.endingsDesign ?? []
        if (endings.length === 0) return null
        const typeLabel: Record<string, string> = { good: '好', bad: '坏', neutral: '中立', secret: '隐藏' }
        const typeColor: Record<string, string> = { good: 'text-green-600', bad: 'text-red-600', neutral: 'text-gray-500', secret: 'text-purple-600' }
        return (
          <div className="mb-6 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-amber-700 mb-2">已设计 {endings.length} 条结局线（规模方案需容纳所有分支路径）</p>
            <div className="flex flex-wrap gap-2">
              {endings.map((e, i) => (
                <span key={e.id ?? i} className="text-xs bg-white border border-amber-100 rounded-full px-3 py-1">
                  <span className={`font-medium ${typeColor[e.type] ?? 'text-gray-500'}`}>[{typeLabel[e.type] ?? e.type}]</span>
                  <span className="text-gray-700 ml-1">{e.title}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={generatePlans} className="text-red-600 hover:text-red-800 underline text-xs ml-4 shrink-0">重试</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">AI 正在根据你的世界锚点生成规模方案...</p>
        </div>
      ) : project.scalePlanOptions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">暂无方案，请先完成世界锚点设置</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
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
          onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/structure`) }}
          disabled={!selected}
          className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一步：结构设计 →
        </button>
      </div>
    </div>
  )
}
