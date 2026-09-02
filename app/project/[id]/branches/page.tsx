'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { enumeratePaths } from '@/lib/graph'
import { nodeTypeStyle } from '@/lib/ui/nodeTypes'
import type { NodeType } from '@/lib/types/project'
import { Button } from '@/app/components/ui/button'
import { Skeleton, SkeletonLines } from '@/app/components/ui/skeleton'
import { parseEffectPart, extractConditionVars } from '@/lib/conditions'

// ── Type config（图标本地维护，文案与配色一律取自 lib/ui/nodeTypes） ──────────

const TYPE_ICON: Record<NodeType, string> = {
  start: '○', normal: '▷', branch: '◇', merge: '◁', ending: '★', explore: '◎',
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent: string
}) {
  return (
    <div className="paper-sheet border border-line flex overflow-hidden">
      <div className={`w-1 shrink-0 ${accent}`} />
      <div className="px-4 py-4 flex-1">
        <div className="text-2xl font-bold text-ink leading-tight">{value}</div>
        {sub && <div className="text-xs text-pencil mt-0.5">{sub}</div>}
        <div className="text-xs text-ink-soft mt-1">{label}</div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const params = useParams()
  const id = params.id as string
  const project = useProjectStore(s => s.project)

  if (!project) return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <SkeletonLines lines={5} />
    </div>
  )

  const nodes = project.nodes ?? []

  if (nodes.length === 0) return (
    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <div className="text-5xl mb-4 text-pencil">◇</div>
      <p className="text-ink-soft text-sm mb-6">还没有节点，请先在结构编辑中创建节点。</p>
      <Link href={`/project/${id}/structure`}>
        <Button variant="secondary">← 前往结构编辑</Button>
      </Link>
    </div>
  )

  // ── Derived data ──────────────────────────────────────────────────────────

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const totalChoices = nodes.reduce((s, n) => s + (n.choices ?? []).length, 0)
  const branchNodes = nodes.filter(n => n.type === 'branch')
  const endingNodes = nodes.filter(n => n.type === 'ending')
  const branchPct = nodes.length > 0 ? Math.round(branchNodes.length / nodes.length * 100) : 0

  // Type distribution
  const typeCounts = new Map<NodeType, number>()
  for (const n of nodes) typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1)
  const typeOrder: NodeType[] = ['start', 'normal', 'branch', 'merge', 'ending', 'explore']

  // Path analysis
  const startNode = nodes.find(n => n.type === 'start')
  const paths = startNode ? enumeratePaths(startNode.id, nodeMap, 50) : []
  const pathLengths = paths.map(p => p.length)
  const minSteps = pathLengths.length > 0 ? Math.min(...pathLengths) : 0
  const maxSteps = pathLengths.length > 0 ? Math.max(...pathLengths) : 0
  const displayPaths = paths.slice(0, 8)
  const extraPaths = paths.length - displayPaths.length

  function nodeName(nodeId: string) {
    const n = nodeMap.get(nodeId)
    if (!n) return nodeId.slice(0, 6)
    return n.title.length > 10 ? n.title.slice(0, 10) + '…' : n.title
  }

  // Health checks
  const allTargetIds = new Set(
    nodes.flatMap(n => (n.choices ?? []).map(c => c.targetNodeId).filter(Boolean))
  )
  const deadEndNodes = nodes.filter(n =>
    n.type !== 'ending' &&
    (n.choices ?? []).length === 0 &&
    !(n.type === 'explore' && n.exploreReturnNodeId)  // 探索节点有自动返回，不是死路
  )
  const unreachableNodes = nodes.filter(n => n.type !== 'start' && !allTargetIds.has(n.id))

  // Variable coverage: how many variables are used in choices
  const allVarNames = new Set((project.variables ?? []).map(v => v.name))
  // 必须用 parseEffectPart 解析，不能只剥前缀 +-：实际数据以后缀写法为主
  // （AI 分支生成产出 "courage+1"），`'courage+1'.replace(/^[+-]/,'')` 仍是 "courage+1"，
  // 匹配不到任何变量名，覆盖率恒显示 0%——本轮实测 6 个变量全在用却显示 0/6。
  // 条件里引用的变量同样算"已使用"（门控是变量最主要的用途）。
  const usedVarNames = new Set(
    nodes.flatMap(n => n.choices ?? []).flatMap(c => {
      const fromEffects = (c.variableEffects ?? '').split(',')
        .map(part => parseEffectPart(part)?.name)
        .filter((v): v is string => !!v)
      const fromConditions = extractConditionVars(c.conditions ?? '')
      return [...fromEffects, ...fromConditions].filter(v => allVarNames.has(v))
    })
  )
  const varCoverage = allVarNames.size > 0 ? Math.round(usedVarNames.size / allVarNames.size * 100) : 100

  // Fake branches: all choices point to same target
  const fakeBranchNodes = branchNodes.filter(n => {
    const targets = new Set((n.choices ?? []).map(c => c.targetNodeId).filter(Boolean))
    return targets.size === 1 && (n.choices ?? []).length > 0
  })

  // Path differentiation: unique node sequences across paths
  const pathSets = paths.map(p => new Set(p))
  let sharedCount = 0
  if (pathSets.length >= 2) {
    const firstSet = pathSets[0]
    firstSet.forEach(id => {
      if (pathSets.every(s => s.has(id))) sharedCount++
    })
  }
  const differentiationPct = paths.length >= 2 && maxSteps > 0
    ? Math.round((1 - sharedCount / maxSteps) * 100)
    : 100

  return (
    <div className="min-h-full">
      {/* Breadcrumb */}
      <div className="bg-paper border-b border-line-soft px-6 py-3 flex items-center gap-3 text-xs text-pencil">
        <Link href={`/project/${id}/structure`} className="hover:text-ink transition-colors cursor-pointer">
          ← 返回结构
        </Link>
        <span className="text-line">|</span>
        <span className="text-ink font-medium">分支分析</span>
        <span className="text-line">|</span>
        <Link href={`/project/${id}/preview`} className="hover:text-ink transition-colors cursor-pointer">
          ▶ 预览
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Module 1: Stat cards */}
        <section>
          <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">总览</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总节点数"   value={nodes.length}        accent="bg-pencil" />
            <StatCard label="分支节点"   value={branchNodes.length}  sub={`占 ${branchPct}%`} accent="bg-vermilion" />
            <StatCard label="总选项数"   value={totalChoices}        accent="bg-inkblue" />
            <StatCard label="结局数"     value={endingNodes.length}  accent="bg-amberink" />
            <StatCard label="路径差异化" value={`${differentiationPct}%`} sub="路径独占节点比例" accent={differentiationPct >= 40 ? 'bg-leaf' : 'bg-vermilion'} />
            <StatCard label="变量覆盖率" value={allVarNames.size === 0 ? '—' : `${varCoverage}%`} sub={allVarNames.size > 0 ? `${usedVarNames.size}/${allVarNames.size} 变量在选项中使用` : '暂无变量'} accent={varCoverage >= 80 || allVarNames.size === 0 ? 'bg-leaf' : 'bg-amberink'} />
            {fakeBranchNodes.length > 0 && (
              <StatCard label="假分支数" value={fakeBranchNodes.length} sub="所有选项指向同一节点" accent="bg-vermilion" />
            )}
          </div>
          {fakeBranchNodes.length > 0 && (
            <div className="mt-3 p-3 bg-vermilion/10 border border-vermilion/30 text-xs text-vermilion">
              <span className="font-semibold">⚠ 发现假分支：</span> {fakeBranchNodes.map(n => `「${n.title}」`).join('、')}——玩家的选择没有实际效果，请在工坊中修复。
            </div>
          )}
        </section>

        {/* Replay differentiation breakdown */}
        {paths.length >= 2 && (
        <section>
          <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">重玩差异化分析</h2>
          <div className="paper-sheet border border-line p-4 space-y-3 text-xs text-ink-soft">
            <div className="flex items-center justify-between">
              <span>所有路径共享节点（无差异内容）</span>
              <span className="font-mono text-pencil">{sharedCount} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <span>路径差异化指数</span>
              <span className={`font-mono font-bold ${differentiationPct >= 40 ? 'text-leaf' : 'text-vermilion'}`}>{differentiationPct}%</span>
            </div>
            <div className="h-1.5 bg-paper-dim overflow-hidden">
              <div className={`h-full transition-all ${differentiationPct >= 40 ? 'bg-leaf' : 'bg-vermilion'}`} style={{ width: `${differentiationPct}%` }} />
            </div>
            <p className="text-pencil italic">{differentiationPct >= 60 ? '优秀：二周目体验高度差异化' : differentiationPct >= 40 ? '良好：路径有明显差别' : '警告：路径同质化严重，二周目体验较差'}</p>
          </div>
        </section>
        )}

        {/* Module 2: Type distribution */}
        <section>
          <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">节点类型分布</h2>
          <div className="paper-sheet border border-line divide-y divide-line-soft overflow-hidden">
            {typeOrder.map(type => {
              const count = typeCounts.get(type) ?? 0
              const style = nodeTypeStyle(type)
              const pct = nodes.length > 0 ? Math.round(count / nodes.length * 100) : 0
              return (
                <div key={type} className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-base w-5 text-center ${style.text}`}>{TYPE_ICON[type]}</span>
                  <span className="text-sm text-ink-soft w-10">{style.label}</span>
                  <div className="flex-1 h-2 bg-paper-dim overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: style.hex }}
                    />
                  </div>
                  <span className="text-sm text-ink w-6 text-right">{count}</span>
                  <span className="text-xs text-pencil w-9 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Module 3: Path analysis */}
        <section>
          <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">路径分析</h2>
          {!startNode ? (
            <p className="text-sm text-pencil">未找到开场节点，无法进行路径分析。</p>
          ) : (
            <div className="paper-sheet border border-line overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft">
                {[
                  { label: '路径总数', value: paths.length },
                  { label: '最短路径', value: `${minSteps} 步` },
                  { label: '最长路径', value: `${maxSteps} 步` },
                ].map(({ label, value }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <div className="text-xl font-bold text-ink">{value}</div>
                    <div className="text-xs text-pencil mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {paths.length === 0 ? (
                <p className="text-sm text-pencil px-4 py-3">没有找到通向结局的路径。</p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {displayPaths.map((path, i) => (
                    <div key={i} className="px-4 py-2.5 text-xs text-ink-soft font-mono leading-relaxed">
                      <span className="text-pencil mr-2 select-none">{i + 1}.</span>
                      {path.map((nid, j) => (
                        <span key={nid}>
                          {j > 0 && <span className="text-pencil mx-1">→</span>}
                          <span className={nodeMap.get(nid)?.type === 'ending' ? `${nodeTypeStyle('ending').text} font-semibold` : ''}>
                            {nodeName(nid)}
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                  {extraPaths > 0 && (
                    <div className="px-4 py-2.5 text-xs text-pencil italic">
                      + {extraPaths} 条更多路径...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Module 4: Branch node detail table */}
        {branchNodes.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">分支节点详情</h2>
            <div className="paper-sheet border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper-dim border-b border-line-soft text-xs text-pencil">
                    <th className="px-4 py-2.5 text-left font-medium">节点标题</th>
                    <th className="px-4 py-2.5 text-center font-medium w-16">选项数</th>
                    <th className="px-4 py-2.5 text-left font-medium">选项预览</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {branchNodes.map(node => {
                    const choices = node.choices ?? []
                    const preview = choices.slice(0, 2)
                    const extra = choices.length - preview.length
                    return (
                      <tr key={node.id} className="hover:bg-paper-dim transition-colors">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/project/${id}/structure`}
                            className="text-vermilion hover:text-vermilion-deep hover:underline font-medium cursor-pointer"
                          >
                            {node.title || '（无标题）'}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-center text-pencil">{choices.length}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {preview.map(c => (
                              <span
                                key={c.id}
                                className={`inline-flex items-center px-2 py-0.5 text-xs border ${
                                  c.choiceWeight === 'critical'
                                    ? 'bg-vermilion/10 text-vermilion border-vermilion/30'
                                    : 'bg-paper-dim text-ink-soft border-line'
                                }`}
                              >
                                {c.choiceWeight === 'critical' && (
                                  <span className="mr-1 font-bold">!</span>
                                )}
                                {c.text.length > 18 ? c.text.slice(0, 18) + '…' : c.text || '（空）'}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="text-xs text-pencil">+{extra}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Module 5: Network health */}
        <section>
          <h2 className="text-xs font-semibold text-pencil uppercase tracking-wider mb-3">网络健康检测</h2>
          {deadEndNodes.length === 0 && unreachableNodes.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-leaf/10 border border-leaf/30 text-sm text-leaf">
              <span>✓</span>
              <span className="font-medium">分支网络健康</span>
            </div>
          ) : (
            <div className="space-y-3">
              {deadEndNodes.length > 0 && (
                <div className="bg-vermilion/10 border border-vermilion/30 px-4 py-3">
                  <div className="text-sm font-medium text-vermilion mb-2">
                    死路节点（{deadEndNodes.length} 个）— 非结局节点但无选项
                  </div>
                  <ul className="space-y-1">
                    {deadEndNodes.map(n => (
                      <li key={n.id} className="text-xs text-vermilion flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-vermilion shrink-0" />
                        {n.title || '（无标题）'}
                        <span className="text-vermilion/70 ml-1">[{nodeTypeStyle(n.type).label}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {unreachableNodes.length > 0 && (
                <div className="bg-amberink/10 border border-amberink/30 px-4 py-3">
                  <div className="text-sm font-medium text-amberink mb-2">
                    无法到达节点（{unreachableNodes.length} 个）— 没有任何选项指向它
                  </div>
                  <ul className="space-y-1">
                    {unreachableNodes.map(n => (
                      <li key={n.id} className="text-xs text-amberink flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amberink shrink-0" />
                        {n.title || '（无标题）'}
                        <span className="text-amberink/70 ml-1">[{nodeTypeStyle(n.type).label}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
