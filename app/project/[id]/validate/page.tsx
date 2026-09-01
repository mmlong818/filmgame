'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useProjectStore } from '@/lib/store/projectStore'
import { runValidation } from '@/lib/validation/engine'
import { exportProjectJson, exportInk } from '@/lib/persistence'
import { useToast } from '@/app/components/toast'
import { aiJson } from '@/lib/ai/client'
import { useAiAction, type AiActionState } from '@/lib/hooks/useAiAction'
import { enumeratePaths } from '@/lib/graph'
import { NODE_TYPES, nodeTypeStyle } from '@/lib/ui/nodeTypes'
import { Button } from '@/app/components/ui/button'
import { StickyNote } from '@/app/components/ui/sticky-note'
import { Tag } from '@/app/components/ui/tag'
import { SkeletonPage } from '@/app/components/ui/skeleton'
import { AssistRail, AssistSection } from '@/app/components/ui/assist-rail'
import type { ValidationReport, ValidationIssue, IssueLevel, DirectorReview, Project, StoryNode, NodeType } from '@/lib/types/project'

interface AiReportResult { summary: string; priority_issues: string[]; suggestions: string[] }

const NOTE_TILT = [-1.5, 1.2, -0.8, 1.8, -1.2]

export default function ValidatePage() {
  const router = useRouter()
  const { project, setValidationReport, clearStaleFlag, setDirectorReview } = useProjectStore()
  const [aiSuggestions, setAiSuggestions] = useState<AiReportResult | null>(null)
  const [directorReview, setLocalDirectorReview] = useState<DirectorReview | null>(() => project?.directorReview ?? null)
  const aiReport = useAiAction()
  const aiDirector = useAiAction()
  const { toast } = useToast()

  // 随项目内容变化重跑：此前依赖为空只在挂载时用当时的快照跑一次，
  // hydrate 对账/其它标签页更新后用户看到的是基于旧数据的过时结论
  useEffect(() => {
    if (!project) return
    const r = runValidation(project)
    setValidationReport(r)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.nodes, project?.chapters, project?.acts, project?.variables, project?.endings])

  if (!project) return <SkeletonPage />

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
    const data = await aiReport.run('生成改进建议', signal =>
      aiJson<{ result: AiReportResult }>('validate', 'report', report as unknown as Record<string, unknown>, signal),
    )
    if (data) setAiSuggestions(data.result)
  }

  async function handleDirectorReview() {
    if (!project) return
    const data = await aiDirector.run('五位导演终审', signal =>
      aiJson<{ result: Omit<DirectorReview, 'generatedAt'> }>('validate', 'director_review', {
        worldAnchor: project.worldAnchor,
        characters: project.characters,
        endings: project.endings,
        nodes: project.nodes.map(n => ({
          ...n,
          choiceTargets: n.choices.map(c => c.targetNodeId),
          fakeBranch: n.type === 'branch' && n.choices.length > 0 &&
            new Set(n.choices.map(c => c.targetNodeId).filter(Boolean)).size === 1,
        })),
      }, signal),
    )
    if (data) {
      const review: DirectorReview = { ...data.result, generatedAt: new Date().toISOString() }
      setLocalDirectorReview(review)
      setDirectorReview(review)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-ink">全局校验</h2>
        <p className="text-sm text-pencil mt-1">检测结构问题，生成可执行报告</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── 核心产出区 ── */}
        <section aria-label="核心产出区" className="flex-1 min-w-0">
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="primary" onClick={handleValidate}>运行校验</Button>
            {report && (
              <>
                <Button variant="secondary" onClick={() => { exportProjectJson(project); toast('JSON 已导出', 'info') }}>
                  导出 JSON
                </Button>
                <Button variant="secondary" onClick={() => { exportInk(project); toast('.ink 文件已导出', 'info') }}>
                  导出 .ink
                </Button>
              </>
            )}
          </div>

          {!report ? (
            <div className="paper-sheet border border-dashed border-line text-center py-16 text-pencil">
              <p className="text-sm">点击「运行校验」开始检测</p>
            </div>
          ) : (
            <>
              <ScorePanel report={report} />

              {(report.issues?.length ?? 0) === 0 ? (
                <div className="bg-paper border-l-4 border-leaf px-5 py-4 mb-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <p className="text-leaf font-medium text-sm">✓ 校验通过，没有发现结构问题</p>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="flex justify-end mb-2">
                    <Link
                      href={`/project/${project.id}/structure`}
                      className="text-xs text-inkblue hover:text-vermilion underline underline-offset-2 cursor-pointer"
                    >
                      → 去结构页定向重构
                    </Link>
                  </div>
                  {(['error', 'warning', 'info'] as const).map(level => {
                    const items = (report.issues ?? []).filter(i => i.level === level)
                    if (items.length === 0) return null
                    return (
                      <IssueGroup key={level} level={level} items={items} projectId={project.id} />
                    )
                  })}
                </div>
              )}

              <EmotionArcChart project={project} />
              <PathDurationTable project={project} />
              <NarrativeMap project={project} />
            </>
          )}
        </section>

        {/* ── 辅助区 ── */}
        <AssistRail>
          <AssistSection title="AI 协作">
            <div className="bg-paper border border-line-soft p-3.5 space-y-3">
              <AiTriggerButton ai={aiReport} label={aiSuggestions ? '重新生成改进建议' : 'AI 改进建议'} onRun={handleAiReport} disabled={!report} />
              <AiTriggerButton ai={aiDirector} label={directorReview ? '重新召唤终审' : '五位导演终审'} onRun={handleDirectorReview} disabled={!report} />
              {!report && <p className="text-[11px] text-pencil">运行校验后可用</p>}
            </div>
          </AssistSection>

          {aiSuggestions && (
            <AssistSection title="AI 报告">
              <StickyNote title="AI 改进建议">
                <p className="mb-2">{aiSuggestions.summary}</p>
                {aiSuggestions.priority_issues?.length > 0 && (
                  <div className="mb-2">
                    <p className="font-semibold mb-1">优先修复</p>
                    {aiSuggestions.priority_issues.map((issue, i) => <p key={i}>・{issue}</p>)}
                  </div>
                )}
                {aiSuggestions.suggestions?.length > 0 && (
                  <div>
                    <p className="font-semibold mb-1">优化建议</p>
                    {aiSuggestions.suggestions.map((s, i) => <p key={i}>・{s}</p>)}
                  </div>
                )}
              </StickyNote>
            </AssistSection>
          )}

          {directorReview && (
            <AssistSection title="导演终审">
              <DirectorReviewPanel review={directorReview} />
            </AssistSection>
          )}

          <AssistSection title="说明">
            <div className="text-[11.5px] text-pencil leading-relaxed space-y-1.5">
              <p>通过率 = 100 − 错误数×20 − 警告数×8 − 提示数×2（下限 0）。</p>
              <p>「运行校验」重新扫描当前项目结构；导出的 JSON / .ink 基于最近一次校验后的项目数据。</p>
            </div>
          </AssistSection>
        </AssistRail>
      </div>
    </div>
  )
}

/** 辅助区通用：AI 动作按钮 + 运行中中止 + 失败重试 */
function AiTriggerButton({ ai, label, onRun, disabled }: {
  ai: AiActionState
  label: string
  onRun: () => void
  disabled?: boolean
}) {
  const isLoading = ai.loading !== null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button variant="secondary" loading={isLoading} disabled={disabled} onClick={onRun} className="flex-1 justify-center">
          {label}
        </Button>
        {isLoading && (
          <button
            type="button"
            onClick={ai.cancel}
            className="cursor-pointer text-xs text-pencil hover:text-vermilion underline underline-offset-2 shrink-0"
          >
            中止
          </button>
        )}
      </div>
      {ai.error && (
        <div className="flex items-center justify-between gap-3 bg-paper border-l-4 border-vermilion px-3 py-2 text-xs text-ink">
          <span>{ai.error}</span>
          <Button variant="link" size="sm" onClick={ai.retry}>重试</Button>
        </div>
      )}
    </div>
  )
}

function ScorePanel({ report }: { report: ValidationReport }) {
  const tierText = report.passRate >= 80 ? 'text-leaf' : report.passRate >= 60 ? 'text-amberink' : 'text-vermilion'
  const tierBg = report.passRate >= 80 ? 'bg-leaf' : report.passRate >= 60 ? 'bg-amberink' : 'bg-vermilion'
  const issueCount = report.issues?.length ?? 0
  return (
    <div className="paper-sheet px-5 py-5 mb-4 flex flex-wrap items-end gap-8">
      <div>
        <div className={`courier text-5xl font-bold leading-none ${tierText}`}>{report.passRate}%</div>
        <div className="h-1.5 bg-pencil/15 mt-2 w-32 overflow-hidden">
          <div className={`h-full ${tierBg}`} style={{ width: `${report.passRate}%` }} />
        </div>
        <div className="text-xs text-pencil mt-1.5 tracking-wide">通过率</div>
      </div>
      <div className="flex gap-6">
        <div className="text-center">
          <div className="courier text-xl text-ink">{report.totalNodes}</div>
          <div className="text-xs text-pencil mt-0.5">总节点</div>
        </div>
        <div className="text-center">
          <div className="courier text-xl text-ink">{report.totalBranches}</div>
          <div className="text-xs text-pencil mt-0.5">总分支</div>
        </div>
        <div className="text-center">
          <div className={`courier text-xl ${issueCount === 0 ? 'text-leaf' : 'text-vermilion'}`}>{issueCount}</div>
          <div className="text-xs text-pencil mt-0.5">问题数</div>
        </div>
      </div>
    </div>
  )
}

const LEVEL_CONF: Record<IssueLevel, { label: string; border: string }> = {
  error: { label: '错误', border: 'border-vermilion' },
  warning: { label: '警告', border: 'border-amberink' },
  info: { label: '提示', border: 'border-inkblue' },
}

function IssueGroup({ level, items, projectId }: { level: IssueLevel; items: ValidationIssue[]; projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(level === 'error')
  const conf = LEVEL_CONF[level]
  return (
    <div className="mb-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 cursor-pointer text-left py-1.5 px-1 text-xs font-medium text-pencil tracking-wide"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {conf.label}（{items.length}）
      </button>
      {open && (
        <div className="space-y-1.5">
          {items.map(issue => (
            <div key={issue.id} className={`bg-paper border-l-4 ${conf.border} px-3 py-2 text-sm text-ink`} style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-start justify-between gap-2">
                <span><span className="courier text-xs text-pencil">[{issue.code}]</span> {issue.message}</span>
                {issue.relatedIds?.length > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="shrink-0"
                    onClick={() => router.push(`/project/${projectId}/workshop?node=${issue.relatedIds[0]}`)}
                  >
                    去修复 →
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ENDING_TONE: Record<string, { dot: string; bar: string }> = {
  good: { dot: 'bg-leaf', bar: 'bg-leaf' },
  bad: { dot: 'bg-vermilion', bar: 'bg-vermilion' },
  neutral: { dot: 'bg-pencil', bar: 'bg-pencil' },
  secret: { dot: 'bg-inkblue', bar: 'bg-inkblue' },
}

function PathDurationTable({ project }: { project: Project }) {
  const nodeMap = new Map(project.nodes.map(n => [n.id, n]))
  const startNode = project.nodes.find(n => n.type === 'start')
  if (!startNode || project.nodes.length < 2) return null

  const paths = enumeratePaths(startNode.id, nodeMap, 30)
  if (paths.length === 0) return null

  const pathData = paths.map((path, i) => {
    const totalSeconds = path.reduce((sum, id) => sum + (nodeMap.get(id)?.durationSeconds ?? 0), 0)
    const endingNode = nodeMap.get(path[path.length - 1])
    const endingDef = project.endings.find(e => e.nodeId === endingNode?.id)
    const type = endingDef?.type ?? 'neutral'
    return {
      label: endingDef?.title ?? endingNode?.title ?? `路径 ${i + 1}`,
      nodes: path.length,
      minutes: Math.round(totalSeconds / 60),
      barClass: ENDING_TONE[type]?.bar ?? ENDING_TONE.neutral.bar,
    }
  })
  const maxMinutes = Math.max(...pathData.map(p => p.minutes), 1)

  return (
    <div className="paper-sheet p-5 mb-4">
      <h3 className="text-sm font-semibold text-ink mb-4">路径时长分布</h3>
      <div className="space-y-2.5">
        {pathData.map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 text-xs text-ink-soft truncate shrink-0" title={p.label}>{p.label}</div>
            <div className="flex-1 h-3 bg-pencil/15 overflow-hidden">
              <div className={`h-full ${p.barClass}`} style={{ width: `${(p.minutes / maxMinutes) * 100}%` }} />
            </div>
            <div className="text-xs text-pencil shrink-0 w-24 text-right">{p.minutes}分 · {p.nodes}节点</div>
          </div>
        ))}
      </div>
      {paths.length >= 30 && (
        <p className="text-xs text-pencil mt-2">仅显示前30条路径</p>
      )}
    </div>
  )
}

function NarrativeMap({ project }: { project: Project }) {
  const endingNodeCount = project.nodes.filter(n => n.type === 'ending').length
  const branchNodeCount = project.nodes.filter(n => n.type === 'branch').length
  const dialogueNodeCount = project.nodes.filter(n => n.dialogue.length > 0).length
  const branchDensity = project.nodes.length > 0 ? Math.round((branchNodeCount / project.nodes.length) * 100) : 0
  const dialogueRate = project.nodes.length > 0 ? Math.round((dialogueNodeCount / project.nodes.length) * 100) : 0

  return (
    <div className="paper-sheet p-5 mb-4">
      <h3 className="text-sm font-semibold text-ink mb-4">叙事地图</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="courier text-2xl font-bold text-ink">{endingNodeCount}</div>
          <div className="text-xs text-pencil mt-0.5">结局定义</div>
          <div className="flex justify-center gap-1 mt-1.5">
            {(['good', 'bad', 'neutral', 'secret'] as const).map(type => (
              <div key={type} className={`w-2 h-2 rounded-full ${ENDING_TONE[type].dot}`} title={type} />
            ))}
          </div>
        </div>
        <div className="text-center">
          <div className="courier text-2xl font-bold text-ink">{branchDensity}%</div>
          <div className="text-xs text-pencil mt-0.5">分支密度</div>
          <div className="text-xs text-pencil/80 mt-1">{branchNodeCount} / {project.nodes.length} 节点</div>
        </div>
        <div className="text-center">
          <div className="courier text-2xl font-bold text-ink">{dialogueRate}%</div>
          <div className="text-xs text-pencil mt-0.5">对白完成度</div>
          <div className="text-xs text-pencil/80 mt-1">
            {project.nodes.reduce((sum, n) => sum + n.dialogue.length, 0)} 行对白
          </div>
        </div>
      </div>
      {project.chapters.length > 0 && (
        <div className="mt-4 space-y-2">
          {project.chapters.slice().sort((a, b) => a.order - b.order).map(ch => {
            const chNodes = project.acts
              .filter(a => a.chapterId === ch.id)
              .flatMap(a => a.nodeIds)
              .map(id => project.nodes.find(n => n.id === id))
              .filter((n): n is StoryNode => Boolean(n))
            const filled = chNodes.filter(n => n.dialogue.length > 0).length
            const pct = chNodes.length > 0 ? Math.round((filled / chNodes.length) * 100) : 0
            return (
              <div key={ch.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink-soft">{ch.title}</span>
                  <span className="text-pencil">{filled}/{chNodes.length}</span>
                </div>
                <div className="h-1.5 bg-pencil/15 overflow-hidden">
                  <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmotionArcChart({ project }: { project: Project }) {
  const orderedNodes: StoryNode[] = []
  project.chapters.slice().sort((a, b) => a.order - b.order).forEach(ch => {
    project.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).forEach(act => {
      act.nodeIds.forEach(nid => {
        const n = project.nodes.find(x => x.id === nid)
        if (n && n.emotionFunction.tension > 0) orderedNodes.push(n)
      })
    })
  })

  if (orderedNodes.length < 2) return (
    <div className="paper-sheet border border-dashed border-line text-center py-8 text-pencil text-sm mb-4">
      填充节点情感函数后，此处将显示情感弧线
    </div>
  )

  const W = 600, H = 120, PAD = 20
  const xs = orderedNodes.map((_, i) => PAD + (i / (orderedNodes.length - 1)) * (W - PAD * 2))
  const ys = orderedNodes.map(n => PAD + ((10 - n.emotionFunction.tension) / 10) * (H - PAD * 2))
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const peakIdx = ys.reduce((best, y, i) => (y < ys[best] ? i : best), 0)

  return (
    <div className="paper-sheet p-4 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-ink">情感弧线</h3>
        <div className="flex items-center gap-3 text-xs text-pencil">
          <span>低 ←紧张度→ 高</span>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(NODE_TYPES) as NodeType[]).map(type => (
              <span key={type} className="flex items-center gap-0.5">
                <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: nodeTypeStyle(type).hex }} />
                {nodeTypeStyle(type).label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28">
        {[2, 5, 8].map(v => {
          const y = PAD + ((10 - v) / 10) * (H - PAD * 2)
          return <line key={v} x1={PAD} y1={y} x2={W - PAD} y2={y} style={{ stroke: 'var(--color-pencil)', opacity: 0.2 }} strokeWidth="1" />
        })}
        <polyline points={points} fill="none" style={{ stroke: 'var(--color-inkblue)' }} strokeWidth="2" strokeLinejoin="round" />
        {orderedNodes.map((n, i) => (
          <g key={n.id}>
            {i === peakIdx && (
              <circle cx={xs[i]} cy={ys[i]} r={7} fill="none" style={{ stroke: 'var(--color-vermilion)' }} strokeWidth="1.5" />
            )}
            <circle cx={xs[i]} cy={ys[i]} r={4} fill={nodeTypeStyle(n.type).hex} />
            <title>{n.title}（紧张度 {n.emotionFunction.tension}）</title>
          </g>
        ))}
        <text x={PAD - 4} y={PAD + 4} fontSize="9" style={{ fill: 'var(--color-pencil)' }} textAnchor="end">10</text>
        <text x={PAD - 4} y={H - PAD + 4} fontSize="9" style={{ fill: 'var(--color-pencil)' }} textAnchor="end">0</text>
      </svg>
    </div>
  )
}

function scoreTextClass(s: number) {
  return s >= 8 ? 'text-leaf' : s >= 6 ? 'text-amberink' : 'text-vermilion'
}

function DirectorReviewPanel({ review }: { review: DirectorReview }) {
  return (
    <div className="bg-paper border border-line-soft overflow-hidden">
      <div className="px-3.5 py-3 border-b border-line-soft">
        <p className="text-sm text-ink mb-2">{review.executiveSummary}</p>
        <div className="flex items-center gap-3">
          <div className={`courier text-2xl font-bold ${scoreTextClass(review.overallScore)}`}>
            {review.overallScore}<span className="text-sm font-normal text-pencil">/10</span>
          </div>
          <Tag tone={review.greenlit ? 'leaf' : 'vermilion'}>
            {review.greenlit ? '绿灯通过' : '需修订'}
          </Tag>
        </div>
      </div>

      {review.mustFix?.length > 0 && (
        <div className="px-3.5 py-3 border-b border-line-soft bg-paper border-l-4 border-vermilion">
          <p className="text-xs font-semibold text-vermilion mb-1.5">绿灯前必须修复</p>
          {review.mustFix.map((item, i) => <p key={i} className="text-xs text-ink">・{item}</p>)}
        </div>
      )}

      <div className="p-3.5 space-y-3">
        {(review.verdicts ?? []).map((v, i) => (
          <StickyNote key={i} title={v.lens} tilt={NOTE_TILT[i % NOTE_TILT.length]}>
            <div className={`courier text-xl font-bold mb-1 ${scoreTextClass(v.score)}`}>{v.score}</div>
            <p className="mb-1">{v.observation}</p>
            <p className="opacity-80">→ {v.note}</p>
          </StickyNote>
        ))}
      </div>

      <p className="px-3.5 pb-3 text-[11px] text-pencil">{new Date(review.generatedAt).toLocaleString('zh-CN')}</p>
    </div>
  )
}
