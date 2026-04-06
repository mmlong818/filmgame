'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import type { StoryNode, NodeType } from '@/lib/types/project'

// ── DFS path finder ────────────────────────────────────────────────────────

function findAllPaths(startId: string, nodeMap: Map<string, StoryNode>): string[][] {
  const paths: string[][] = []
  function dfs(nodeId: string, path: string[], visited: Set<string>) {
    if (visited.has(nodeId)) return
    const node = nodeMap.get(nodeId)
    if (!node) return
    const newPath = [...path, nodeId]
    if (node.type === 'ending') { paths.push(newPath); return }
    if (paths.length > 50) return
    visited.add(nodeId)
    for (const choice of (node.choices ?? [])) {
      if (choice.targetNodeId) dfs(choice.targetNodeId, newPath, new Set(visited))
    }
  }
  dfs(startId, [], new Set())
  return paths
}

// ── Type config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NodeType, { icon: string; label: string; color: string }> = {
  start:   { icon: '○', label: '开场',   color: 'text-emerald-600' },
  normal:  { icon: '▷', label: '普通',   color: 'text-zinc-500' },
  branch:  { icon: '◇', label: '分支',   color: 'text-violet-600' },
  merge:   { icon: '◁', label: '汇聚',   color: 'text-rose-500' },
  ending:  { icon: '★', label: '结局',   color: 'text-amber-500' },
  explore: { icon: '◎', label: '探索',   color: 'text-cyan-600' },
}

const TYPE_BAR_COLOR: Record<NodeType, string> = {
  start:   'bg-emerald-400',
  normal:  'bg-zinc-300',
  branch:  'bg-violet-400',
  merge:   'bg-rose-400',
  ending:  'bg-amber-400',
  explore: 'bg-cyan-400',
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent: string
}) {
  return (
    <div className="bg-white border border-zinc-100 rounded-xl overflow-hidden flex">
      <div className={`w-1 shrink-0 ${accent}`} />
      <div className="px-4 py-4 flex-1">
        <div className="text-2xl font-bold text-zinc-800 leading-tight">{value}</div>
        {sub && <div className="text-xs text-zinc-400 mt-0.5">{sub}</div>}
        <div className="text-xs text-zinc-500 mt-1">{label}</div>
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
    <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">加载中...</div>
  )

  const nodes = project.nodes ?? []

  if (nodes.length === 0) return (
    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <div className="text-5xl mb-4">◇</div>
      <p className="text-zinc-500 text-sm mb-6">还没有节点，请先在结构编辑中创建节点。</p>
      <Link
        href={`/project/${id}/structure`}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-sm hover:bg-violet-100 transition-colors"
      >
        ← 前往结构编辑
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
  const paths = startNode ? findAllPaths(startNode.id, nodeMap) : []
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
  const usedVarNames = new Set(
    nodes.flatMap(n => n.choices ?? []).flatMap(c => {
      const effects = (c.variableEffects ?? '').split(',').map(p => p.trim().replace(/^[+-]/, '').split('=')[0])
      return effects.filter(v => allVarNames.has(v))
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
    <div className="bg-white min-h-full">
      {/* Breadcrumb */}
      <div className="border-b border-zinc-100 px-6 py-3 flex items-center gap-3 text-xs text-zinc-400">
        <Link href={`/project/${id}/structure`} className="hover:text-zinc-700 transition-colors">
          ← 结构编辑
        </Link>
        <span className="text-zinc-200">|</span>
        <span className="text-zinc-700 font-medium">分支分析</span>
        <span className="text-zinc-200">|</span>
        <Link href={`/project/${id}/preview`} className="hover:text-zinc-700 transition-colors">
          ▶ 预览
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Module 1: Stat cards */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">总览</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总节点数"   value={nodes.length}        accent="bg-zinc-300" />
            <StatCard label="分支节点"   value={branchNodes.length}  sub={`占 ${branchPct}%`} accent="bg-violet-400" />
            <StatCard label="总选项数"   value={totalChoices}        accent="bg-blue-300" />
            <StatCard label="结局数"     value={endingNodes.length}  accent="bg-amber-400" />
            <StatCard label="路径差异化" value={`${differentiationPct}%`} sub="路径独占节点比例" accent={differentiationPct >= 40 ? 'bg-emerald-400' : 'bg-red-300'} />
            <StatCard label="变量覆盖率" value={allVarNames.size === 0 ? '—' : `${varCoverage}%`} sub={allVarNames.size > 0 ? `${usedVarNames.size}/${allVarNames.size} 变量在选项中使用` : '暂无变量'} accent={varCoverage >= 80 || allVarNames.size === 0 ? 'bg-emerald-400' : 'bg-orange-300'} />
            {fakeBranchNodes.length > 0 && (
              <StatCard label="假分支数" value={fakeBranchNodes.length} sub="所有选项指向同一节点" accent="bg-red-400" />
            )}
          </div>
          {fakeBranchNodes.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
              <span className="font-semibold">⚠ 发现假分支：</span> {fakeBranchNodes.map(n => `「${n.title}」`).join('、')}——玩家的选择没有实际效果，请在工坊中修复。
            </div>
          )}
        </section>

        {/* Replay differentiation breakdown */}
        {paths.length >= 2 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">重玩差异化分析</h2>
          <div className="bg-white border border-zinc-100 rounded-xl p-4 space-y-3 text-xs text-zinc-600">
            <div className="flex items-center justify-between">
              <span>所有路径共享节点（无差异内容）</span>
              <span className="font-mono text-zinc-400">{sharedCount} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <span>路径差异化指数</span>
              <span className={`font-mono font-bold ${differentiationPct >= 40 ? 'text-emerald-600' : 'text-red-500'}`}>{differentiationPct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${differentiationPct >= 40 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${differentiationPct}%` }} />
            </div>
            <p className="text-zinc-400 italic">{differentiationPct >= 60 ? '优秀：二周目体验高度差异化' : differentiationPct >= 40 ? '良好：路径有明显差别' : '警告：路径同质化严重，二周目体验较差'}</p>
          </div>
        </section>
        )}

        {/* Module 2: Type distribution */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">节点类型分布</h2>
          <div className="bg-white border border-zinc-100 rounded-xl divide-y divide-zinc-50 overflow-hidden">
            {typeOrder.map(type => {
              const count = typeCounts.get(type) ?? 0
              const cfg = TYPE_CONFIG[type]
              const pct = nodes.length > 0 ? Math.round(count / nodes.length * 100) : 0
              return (
                <div key={type} className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-base w-5 text-center ${cfg.color}`}>{cfg.icon}</span>
                  <span className="text-sm text-zinc-600 w-10">{cfg.label}</span>
                  <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${TYPE_BAR_COLOR[type]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-zinc-700 w-6 text-right">{count}</span>
                  <span className="text-xs text-zinc-400 w-9 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Module 3: Path analysis */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">路径分析</h2>
          {!startNode ? (
            <p className="text-sm text-zinc-400">未找到开场节点，无法进行路径分析。</p>
          ) : (
            <div className="bg-white border border-zinc-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100">
                {[
                  { label: '路径总数', value: paths.length },
                  { label: '最短路径', value: `${minSteps} 步` },
                  { label: '最长路径', value: `${maxSteps} 步` },
                ].map(({ label, value }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <div className="text-xl font-bold text-zinc-800">{value}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {paths.length === 0 ? (
                <p className="text-sm text-zinc-400 px-4 py-3">没有找到通向结局的路径。</p>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {displayPaths.map((path, i) => (
                    <div key={i} className="px-4 py-2.5 text-xs text-zinc-600 font-mono leading-relaxed">
                      <span className="text-zinc-300 mr-2 select-none">{i + 1}.</span>
                      {path.map((nid, j) => (
                        <span key={nid}>
                          {j > 0 && <span className="text-zinc-300 mx-1">→</span>}
                          <span className={nodeMap.get(nid)?.type === 'ending' ? 'text-amber-600 font-semibold' : ''}>
                            {nodeName(nid)}
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                  {extraPaths > 0 && (
                    <div className="px-4 py-2.5 text-xs text-zinc-400 italic">
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
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">分支节点详情</h2>
            <div className="bg-white border border-zinc-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100 text-xs text-zinc-400">
                    <th className="px-4 py-2.5 text-left font-medium">节点标题</th>
                    <th className="px-4 py-2.5 text-center font-medium w-16">选项数</th>
                    <th className="px-4 py-2.5 text-left font-medium">选项预览</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {branchNodes.map(node => {
                    const choices = node.choices ?? []
                    const preview = choices.slice(0, 2)
                    const extra = choices.length - preview.length
                    return (
                      <tr key={node.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/project/${id}/structure`}
                            className="text-violet-700 hover:text-violet-900 hover:underline font-medium"
                          >
                            {node.title || '（无标题）'}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-center text-zinc-500">{choices.length}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {preview.map(c => (
                              <span
                                key={c.id}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${
                                  c.choiceWeight === 'critical'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                }`}
                              >
                                {c.choiceWeight === 'critical' && (
                                  <span className="mr-1 font-bold">!</span>
                                )}
                                {c.text.length > 18 ? c.text.slice(0, 18) + '…' : c.text || '（空）'}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="text-xs text-zinc-400">+{extra}</span>
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
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">网络健康检测</h2>
          {deadEndNodes.length === 0 && unreachableNodes.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
              <span>✓</span>
              <span className="font-medium">分支网络健康</span>
            </div>
          ) : (
            <div className="space-y-3">
              {deadEndNodes.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <div className="text-sm font-medium text-red-700 mb-2">
                    死路节点（{deadEndNodes.length} 个）— 非结局节点但无选项
                  </div>
                  <ul className="space-y-1">
                    {deadEndNodes.map(n => (
                      <li key={n.id} className="text-xs text-red-600 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        {n.title || '（无标题）'}
                        <span className="text-red-400 ml-1">[{TYPE_CONFIG[n.type].label}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {unreachableNodes.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <div className="text-sm font-medium text-amber-700 mb-2">
                    无法到达节点（{unreachableNodes.length} 个）— 没有任何选项指向它
                  </div>
                  <ul className="space-y-1">
                    {unreachableNodes.map(n => (
                      <li key={n.id} className="text-xs text-amber-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        {n.title || '（无标题）'}
                        <span className="text-amber-500 ml-1">[{TYPE_CONFIG[n.type].label}]</span>
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
