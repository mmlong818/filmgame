'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { runValidation } from '@/lib/validation/engine'
import { exportProjectJson, exportInk } from '@/lib/persistence'
import { useToast } from '@/app/components/toast'
import type { ValidationReport, DirectorReview, Project, StoryNode } from '@/lib/types/project'

export default function ValidatePage() {
  const router = useRouter()
  const { project, setValidationReport, clearStaleFlag, setDirectorReview } = useProjectStore()
  const [loading, setLoading] = useState(false)
  const [directorLoading, setDirectorLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<{ summary: string; priority_issues: string[]; suggestions: string[] } | null>(null)
  const [directorReview, setLocalDirectorReview] = useState<DirectorReview | null>(() => project?.directorReview ?? null)
  const { toast } = useToast()

  useEffect(() => {
    if (!project) return
    const r = runValidation(project)
    setValidationReport(r)
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'validate', action: 'report', context: r }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => { if (data.ok && data.result) setAiSuggestions(data.result) })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      加载中...
    </div>
  )

  const report = project.lastValidation

  function handleValidate() {
    const r = runValidation(project!)
    setValidationReport(r)
    clearStaleFlag()
    const errCount = r.issues.filter(i => i.level === 'error').length
    if (errCount === 0) {
      toast(`校验通过，通过率 ${r.passRate}%`, 'info')
    } else {
      toast(`发现 ${errCount} 个错误，请逐一修复`, 'error')
    }
  }

  async function handleAiReport() {
    if (!report) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'validate', action: 'report', context: report }),
      })
      const data = await res.json()
      if (data.ok && data.result) setAiSuggestions(data.result)
    } finally {
      setLoading(false)
    }
  }

  async function handleDirectorReview() {
    if (!project) return
    setDirectorLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'validate', action: 'director_review',
          context: {
            worldAnchor: project.worldAnchor,
            characters: project.characters,
            endings: project.endings,
            nodes: project.nodes.map(n => ({
              ...n,
              choiceTargets: n.choices.map(c => c.targetNodeId),
              fakeBranch: n.type === 'branch' && n.choices.length > 0 &&
                new Set(n.choices.map(c => c.targetNodeId).filter(Boolean)).size === 1,
            })),
          },
        }),
      })
      const data = await res.json()
      if (data.ok && data.result) {
        const review: DirectorReview = { ...data.result, generatedAt: new Date().toISOString() }
        setLocalDirectorReview(review)
        setDirectorReview(review)
      }
    } finally {
      setDirectorLoading(false)
    }
  }

  const levelColor = {
    error: 'text-red-600 bg-red-50 border-red-100',
    warning: 'text-amber-600 bg-amber-50 border-amber-100',
    info: 'text-blue-600 bg-blue-50 border-blue-100',
  }
  const levelLabel = { error: '错误', warning: '警告', info: '提示' }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">全局校验</h2>
          <p className="text-sm text-gray-500 mt-1">检测结构问题，生成可执行报告</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleValidate}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            运行校验
          </button>
          {report && (
            <>
              <button
                onClick={() => { exportProjectJson(project); toast('JSON 已导出', 'info') }}
                className="px-4 py-2 bg-white border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                导出 JSON
              </button>
              <button
                onClick={() => { exportInk(project); toast('.ink 文件已导出', 'info') }}
                className="px-4 py-2 bg-white border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                导出 .ink
              </button>
            </>
          )}
        </div>
      </div>

      {!report ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm">点击「运行校验」开始检测</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: '通过率', value: `${report.passRate}%`, color: report.passRate >= 80 ? 'text-green-600' : report.passRate >= 60 ? 'text-amber-600' : 'text-red-600' },
                { label: '总节点', value: report.totalNodes, color: 'text-gray-900' },
                { label: '总分支', value: report.totalBranches, color: 'text-gray-900' },
                { label: '问题数', value: report.issues?.length ?? 0, color: (report.issues?.length ?? 0) === 0 ? 'text-green-600' : 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {(report.issues?.length ?? 0) === 0 ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
              <p className="text-green-700 font-medium text-sm">✓ 校验通过，没有发现结构问题</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {(['error', 'warning', 'info'] as const).map(level => {
                const items = (report.issues ?? []).filter(i => i.level === level)
                if (items.length === 0) return null
                return (
                  <div key={level}>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">{levelLabel[level]} ({items.length})</p>
                    {items.map(issue => (
                      <div key={issue.id} className={`border rounded-lg p-3 mb-1.5 text-sm ${levelColor[issue.level]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span><span className="font-medium">[{issue.code}]</span> {issue.message}</span>
                          {issue.relatedIds?.length > 0 && (
                            <button
                              onClick={() => router.push(`/project/${project!.id}/workshop?node=${issue.relatedIds[0]}`)}
                              className="text-xs underline opacity-70 hover:opacity-100 shrink-0"
                            >
                              去修复 →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mb-4">
            <EmotionArcChart project={project} />
          </div>

          <div className="mb-4">
            <PathDurationTable project={project} />
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-4">叙事地图</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* 结局覆盖 */}
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-900">{project.nodes.filter(n => n.type === 'ending').length}</div>
                <div className="text-xs text-zinc-500 mt-0.5">结局定义</div>
                <div className="flex justify-center gap-1 mt-1.5">
                  {(['good','bad','neutral','secret'] as const).map(type => {
                    const colors: Record<string, string> = { good:'bg-green-400', bad:'bg-red-400', neutral:'bg-zinc-400', secret:'bg-purple-400' }
                    return <div key={type} className={`w-2 h-2 rounded-full ${colors[type]}`} title={type} />
                  })}
                </div>
              </div>
              {/* 分支密度 */}
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-900">
                  {project.nodes.length > 0 ? Math.round((project.nodes.filter(n => n.type === 'branch').length / project.nodes.length) * 100) : 0}%
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">分支密度</div>
                <div className="text-xs text-zinc-400 mt-1">{project.nodes.filter(n => n.type === 'branch').length} / {project.nodes.length} 节点</div>
              </div>
              {/* 对白完成度 */}
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-900">
                  {project.nodes.length > 0 ? Math.round((project.nodes.filter(n => n.dialogue.length > 0).length / project.nodes.length) * 100) : 0}%
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">对白完成度</div>
                <div className="text-xs text-zinc-400 mt-1">
                  {project.nodes.reduce((sum, n) => sum + n.dialogue.length, 0)} 行对白
                </div>
              </div>
            </div>
            {/* 章节进度条 */}
            {project.chapters.length > 0 && (
              <div className="mt-4 space-y-2">
                {project.chapters.sort((a, b) => a.order - b.order).map(ch => {
                  const chNodes = project.acts
                    .filter(a => a.chapterId === ch.id)
                    .flatMap(a => a.nodeIds)
                    .map(id => project.nodes.find(n => n.id === id))
                    .filter(Boolean)
                  const filled = chNodes.filter(n => n!.dialogue.length > 0).length
                  const pct = chNodes.length > 0 ? Math.round((filled / chNodes.length) * 100) : 0
                  return (
                    <div key={ch.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-600">{ch.title}</span>
                        <span className="text-zinc-400">{filled}/{chNodes.length}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {!aiSuggestions ? (
            <button
              onClick={handleAiReport}
              disabled={loading}
              className="w-full py-2.5 text-sm text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
              AI 生成改进建议
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-4">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">AI 改进建议</p>
              <p className="text-sm text-gray-700 mb-3">{aiSuggestions.summary}</p>
              {aiSuggestions.priority_issues?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">优先修复</p>
                  {aiSuggestions.priority_issues.map((issue, i) => (
                    <p key={i} className="text-sm text-gray-700">• {issue}</p>
                  ))}
                </div>
              )}
              {aiSuggestions.suggestions?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">优化建议</p>
                  {aiSuggestions.suggestions.map((s, i) => (
                    <p key={i} className="text-sm text-gray-700">• {s}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DirectorReviewPanel
            review={directorReview}
            loading={directorLoading}
            onRequest={handleDirectorReview}
          />
        </>
      )}
    </div>
  )
}

function PathDurationTable({ project }: { project: Project }) {
  const nodeMap = new Map(project.nodes.map(n => [n.id, n]))
  const startNode = project.nodes.find(n => n.type === 'start')
  if (!startNode || project.nodes.length < 2) return null

  const paths: string[][] = []
  function dfs(nodeId: string, path: string[], visited: Set<string>) {
    if (visited.has(nodeId) || paths.length >= 30) return
    const node = nodeMap.get(nodeId)
    if (!node) return
    const newPath = [...path, nodeId]
    if (node.type === 'ending') { paths.push(newPath); return }
    const newVisited = new Set(visited)
    newVisited.add(nodeId)
    for (const choice of (node.choices ?? [])) {
      if (choice.targetNodeId) dfs(choice.targetNodeId, newPath, newVisited)
    }
  }
  dfs(startNode.id, [], new Set())
  if (paths.length === 0) return null

  const pathData = paths.map((path, i) => {
    const totalSeconds = path.reduce((sum, id) => sum + (nodeMap.get(id)?.durationSeconds ?? 0), 0)
    const endingNode = nodeMap.get(path[path.length - 1])
    const endingDef = project.endings.find(e => e.nodeId === endingNode?.id)
    const typeColors: Record<string, string> = { good: 'bg-green-400', bad: 'bg-red-400', neutral: 'bg-zinc-400', secret: 'bg-purple-400' }
    return {
      label: endingDef?.title ?? endingNode?.title ?? `路径 ${i + 1}`,
      type: endingDef?.type ?? 'neutral',
      nodes: path.length,
      minutes: Math.round(totalSeconds / 60),
      barColor: typeColors[endingDef?.type ?? 'neutral'] ?? 'bg-zinc-400',
    }
  })
  const maxMinutes = Math.max(...pathData.map(p => p.minutes), 1)

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-700 mb-4">路径时长分布</h3>
      <div className="space-y-2.5">
        {pathData.map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 text-xs text-zinc-600 truncate shrink-0" title={p.label}>{p.label}</div>
            <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${p.barColor}`} style={{ width: `${(p.minutes / maxMinutes) * 100}%` }} />
            </div>
            <div className="text-xs text-zinc-400 shrink-0 w-24 text-right">{p.minutes}分 · {p.nodes}节点</div>
          </div>
        ))}
      </div>
      {paths.length >= 30 && (
        <p className="text-xs text-zinc-400 mt-2">仅显示前30条路径</p>
      )}
    </div>
  )
}

function EmotionArcChart({ project }: { project: Project }) {
  const orderedNodes: StoryNode[] = []
  project.chapters.sort((a, b) => a.order - b.order).forEach(ch => {
    project.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).forEach(act => {
      act.nodeIds.forEach(nid => {
        const n = project.nodes.find(x => x.id === nid)
        if (n && n.emotionFunction.tension > 0) orderedNodes.push(n)
      })
    })
  })

  if (orderedNodes.length < 2) return (
    <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
      填充节点情感函数后，此处将显示情感弧线
    </div>
  )

  const W = 600, H = 120, PAD = 20
  const xs = orderedNodes.map((_, i) => PAD + (i / (orderedNodes.length - 1)) * (W - PAD * 2))
  const ys = orderedNodes.map(n => PAD + ((10 - n.emotionFunction.tension) / 10) * (H - PAD * 2))
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ')

  const dotColor: Record<string, string> = {
    start: '#22c55e', branch: '#7c3aed', merge: '#f43f5e', ending: '#f59e0b', normal: '#9ca3af', explore: '#14b8a6'
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">情感弧线</h3>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>低 ←紧张度→ 高</span>
          <div className="flex items-center gap-2">
            {([['开场','#22c55e'],['分支','#7c3aed'],['汇聚','#f43f5e'],['结局','#f59e0b'],['推进','#9ca3af'],['探索','#14b8a6']] as const).map(([label, color]) => (
              <span key={label} className="flex items-center gap-0.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28">
        {[2, 5, 8].map(v => {
          const y = PAD + ((10 - v) / 10) * (H - PAD * 2)
          return <line key={v} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f3f4f6" strokeWidth="1" />
        })}
        <polyline points={points} fill="none" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
        {orderedNodes.map((n, i) => (
          <g key={n.id}>
            <circle cx={xs[i]} cy={ys[i]} r={4} fill={dotColor[n.type] ?? '#9ca3af'} />
            <title>{n.title} (tension: {n.emotionFunction.tension})</title>
          </g>
        ))}
        <text x={PAD - 4} y={PAD + 4} fontSize="9" fill="#9ca3af" textAnchor="end">10</text>
        <text x={PAD - 4} y={H - PAD + 4} fontSize="9" fill="#9ca3af" textAnchor="end">0</text>
      </svg>
    </div>
  )
}

function DirectorReviewPanel({ review, loading, onRequest }: {
  review: DirectorReview | null
  loading: boolean
  onRequest: () => void
}) {
  const scoreColor = (s: number) => s >= 8 ? 'text-green-600' : s >= 6 ? 'text-amber-600' : 'text-red-600'
  const scoreBorderColor = (s: number) => s >= 8 ? '#16a34a' : s >= 6 ? '#d97706' : '#dc2626'

  if (!review) return (
    <button
      onClick={onRequest}
      disabled={loading}
      className="w-full py-3 text-sm border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-zinc-600"
    >
      {loading && <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />}
      {loading ? '创作总监评审中…' : '召唤五位专家终审'}
    </button>
  )

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-zinc-900 flex items-center justify-between">
        <div className="flex-1 mr-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">创作总监终审</p>
          <p className="text-sm text-white">{review.executiveSummary}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold ${scoreColor(review.overallScore)}`}>
            {review.overallScore}<span className="text-lg font-normal text-zinc-500">/10</span>
          </div>
          <div className={`text-xs mt-1 px-2 py-0.5 rounded-full border inline-block ${review.greenlit ? 'bg-green-900 border-green-700 text-green-300' : 'bg-red-900 border-red-700 text-red-300'}`}>
            {review.greenlit ? '✓ 绿灯通过' : '× 需修订'}
          </div>
        </div>
      </div>

      {review.mustFix?.length > 0 && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-100">
          <p className="text-xs font-semibold text-red-600 mb-1.5">绿灯前必须修复</p>
          {review.mustFix.map((item, i) => (
            <p key={i} className="text-sm text-red-700">• {item}</p>
          ))}
        </div>
      )}

      <div className="divide-y divide-zinc-100">
        {(review.verdicts ?? []).map((v, i) => (
          <div key={i} className="px-5 py-3 flex items-start gap-3 bg-white" style={{ borderLeft: `3px solid ${scoreBorderColor(v.score)}` }}>
            <div className="flex-1">
              <p className="text-xs font-semibold text-zinc-400 mb-1">{v.lens}</p>
              <p className="text-sm text-zinc-700 mb-1">{v.observation}</p>
              <p className="text-xs text-zinc-400">→ {v.note}</p>
            </div>
            <div className={`text-2xl font-bold shrink-0 ${scoreColor(v.score)}`}>{v.score}</div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-zinc-50 flex justify-between items-center">
        <p className="text-xs text-zinc-400">{new Date(review.generatedAt).toLocaleString('zh-CN')}</p>
        <button onClick={onRequest} disabled={loading} className="text-xs text-zinc-500 hover:text-zinc-700 underline disabled:opacity-40">
          重新评审
        </button>
      </div>
    </div>
  )
}
