'use client'
import { useMemo, useCallback, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType } from '@xyflow/react'
import type { Node, Edge, NodeProps, NodeMouseHandler, OnNodeDrag } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project, StoryNode } from '@/lib/types/project'

// ── Node type config ────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { border: string; bg: string; label: string; labelColor: string; glow: string; dot: string }> = {
  start:  { border: 'border-emerald-400', bg: 'bg-emerald-50',  label: '开场', labelColor: 'text-emerald-700', glow: '#10b981', dot: 'bg-emerald-500' },
  ending: { border: 'border-amber-400',   bg: 'bg-amber-50',    label: '结局', labelColor: 'text-amber-700',   glow: '#f59e0b', dot: 'bg-amber-500'   },
  branch: { border: 'border-violet-400',  bg: 'bg-violet-50',   label: '分支', labelColor: 'text-violet-700',  glow: '#8b5cf6', dot: 'bg-violet-500'  },
  merge:  { border: 'border-rose-400',    bg: 'bg-rose-50',     label: '汇聚', labelColor: 'text-rose-700',    glow: '#f43f5e', dot: 'bg-rose-500'    },
  normal: { border: 'border-slate-300',   bg: 'bg-white',       label: '推进', labelColor: 'text-slate-500',   glow: '#94a3b8', dot: 'bg-slate-400'   },
  explore:{ border: 'border-cyan-400',    bg: 'bg-cyan-50',     label: '探索', labelColor: 'text-cyan-700',    glow: '#06b6d4', dot: 'bg-cyan-500'    },
}

const MINIMAP_COLORS: Record<string, string> = {
  start: '#10b981', ending: '#f59e0b', branch: '#8b5cf6', merge: '#f43f5e', normal: '#94a3b8', explore: '#06b6d4',
}

// ── Node renderer ───────────────────────────────────────────────────────────

function StoryNodeView({ data }: NodeProps) {
  const d = data as {
    label: string; nodeType: string; highlighted: boolean; dimmed: boolean
    dialogueCount: number; hasChoices: boolean; deadEnd: boolean
    onEdit: () => void
  }
  const s = TYPE_STYLE[d.nodeType] ?? TYPE_STYLE.normal
  const opacity = d.dimmed ? 'opacity-20' : 'opacity-100'

  return (
    <div
      className={`border ${s.border} ${s.bg} rounded-xl shadow-md transition-all duration-150 ${opacity} cursor-grab active:cursor-grabbing hover:shadow-lg`}
      style={{
        minWidth: NODE_W,
        maxWidth: NODE_W,
        boxShadow: d.highlighted ? `0 0 20px ${s.glow}60, 0 0 6px ${s.glow}30` : undefined,
        outline: d.highlighted ? `1.5px solid ${s.glow}80` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left}
        style={{ background: s.glow, width: 8, height: 8, border: '2px solid #f8fafc', left: -5 }} />

      {/* Header */}
      <div className={`flex items-center gap-1.5 px-3 pt-2.5 pb-1`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
        <span className={`text-[10px] font-bold tracking-widest uppercase ${s.labelColor}`}>{s.label}</span>
        {d.deadEnd && (
          <span className="ml-auto text-[9px] text-red-500 font-bold bg-red-100 px-1 rounded">断头</span>
        )}
      </div>

      {/* Title */}
      <div className="px-3 pb-1">
        <div
          className="text-sm font-medium text-slate-800 leading-snug"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={d.label}
        >
          {d.label}
        </div>
        {d.dialogueCount > 0 && (
          <div className="mt-1 text-[10px] text-slate-400">{d.dialogueCount} 行对白</div>
        )}
      </div>

      {/* Edit button */}
      <div className="px-3 pb-2.5 pt-1">
        <button
          onClick={(e) => { e.stopPropagation(); d.onEdit() }}
          className="text-[10px] text-slate-400 hover:text-slate-700 border border-slate-300 hover:border-slate-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
          style={{ lineHeight: '1.6' }}
        >
          编辑
        </button>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: s.glow, width: 8, height: 8, border: '2px solid #f8fafc', right: -5 }} />
    </div>
  )
}

const nodeTypes = { storyNode: StoryNodeView }

// ── Path highlight DFS ──────────────────────────────────────────────────────

function getPathNodeIds(startId: string, nodeMap: Map<string, { choices: { targetNodeId: string }[]; type: string }>, visited = new Set<string>()): Set<string> {
  if (visited.has(startId)) return new Set()
  const node = nodeMap.get(startId)
  if (!node) return new Set()
  if (node.type === 'ending') return new Set([startId])
  visited.add(startId)
  const result = new Set<string>()
  for (const c of node.choices) {
    if (!c.targetNodeId) continue
    const sub = getPathNodeIds(c.targetNodeId, nodeMap, new Set(visited))
    if (sub.size > 0) {
      result.add(startId)
      sub.forEach(id => result.add(id))
    }
  }
  return result
}

// ── Auto-layout: BFS depth columns within each act ──────────────────────────

const NODE_W = 200
const NODE_H = 90
const COL_W = 260       // horizontal spacing per depth column
const ROW_H = NODE_H + 50  // vertical spacing between nodes in same column
const ACT_GAP = 60      // extra horizontal gap between acts

function autoLayout(
  nodes: StoryNode[],
  acts: { id: string; chapterId: string; order: number; nodeIds: string[] }[],
  chapters: { id: string; order: number }[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Global choice adjacency
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    childrenOf.set(n.id, (n.choices ?? []).map(c => c.targetNodeId).filter(Boolean) as string[])
  }

  // Sort acts: chapter order → act order within chapter
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order)
  const sortedActs: typeof acts = []
  for (const ch of sortedChapters) {
    const chActs = acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order)
    sortedActs.push(...chActs)
  }

  const assigned = new Set<string>()
  let xOffset = 0  // running x position across all act sub-columns

  for (const act of sortedActs) {
    const actSet = new Set(act.nodeIds.filter(id => nodeMap.has(id)))
    if (actSet.size === 0) continue

    // Edges within this act only
    const actChildren = new Map<string, string[]>()
    for (const id of actSet) {
      actChildren.set(id, (childrenOf.get(id) ?? []).filter(cid => actSet.has(cid)))
    }

    // Nodes that are NOT targeted by any intra-act edge → entry nodes
    const intraTargets = new Set<string>()
    for (const children of actChildren.values()) children.forEach(c => intraTargets.add(c))
    const entries = [...actSet].filter(id => !intraTargets.has(id))
    const startId = entries[0] ?? act.nodeIds.find(id => actSet.has(id))!

    // BFS: depth = max(parent depths) + 1  → merge nodes land after all their parents
    const depthMap = new Map<string, number>()
    const queue: string[] = [startId]
    depthMap.set(startId, 0)
    const visited = new Set<string>([startId])

    while (queue.length > 0) {
      const curr = queue.shift()!
      const d = depthMap.get(curr)!
      for (const child of (actChildren.get(curr) ?? [])) {
        const newD = d + 1
        if (!depthMap.has(child) || depthMap.get(child)! < newD) {
          depthMap.set(child, newD)
        }
        if (!visited.has(child)) {
          visited.add(child)
          queue.push(child)
        }
      }
    }
    // Any unreached nodes within this act get depth 0
    for (const id of actSet) if (!depthMap.has(id)) depthMap.set(id, 0)

    // Group nodes by depth
    const maxDepth = Math.max(...depthMap.values())
    const groups = new Map<number, string[]>()
    for (let d = 0; d <= maxDepth; d++) groups.set(d, [])
    for (const [id, d] of depthMap) groups.get(d)!.push(id)

    // Place nodes: each depth → one sub-column
    for (let d = 0; d <= maxDepth; d++) {
      const col = groups.get(d)!
      const colH = col.length * ROW_H
      col.forEach((id, rowIdx) => {
        positions.set(id, {
          x: xOffset + d * COL_W,
          y: rowIdx * ROW_H - colH / 2,
        })
        assigned.add(id)
      })
    }

    // Advance x cursor: this act consumed (maxDepth+1) sub-columns + gap
    xOffset += (maxDepth + 1) * COL_W + ACT_GAP
  }

  // Fallback: nodes not assigned to any act
  const unassigned = nodes.filter(n => !assigned.has(n.id))
  unassigned.forEach((n, i) => {
    positions.set(n.id, { x: xOffset + 50, y: i * ROW_H })
  })

  return positions
}

// ── Build React Flow data ───────────────────────────────────────────────────

function buildFlowData(project: Project, hoveredNodeId: string | null, manualPos: Map<string, { x: number; y: number }>, onEditNode?: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = []
  const edges: Edge[] = []

  const pNodes = project.nodes ?? []
  const nodeMap = new Map(pNodes.map(n => [n.id, n]))
  const endingNodeIds = new Set(pNodes.filter(n => n.type === 'ending').map(n => n.id))

  // All target node IDs that are referenced by choices
  const referencedTargets = new Set(pNodes.flatMap(n => (n.choices ?? []).map(c => c.targetNodeId).filter(Boolean)))

  // Highlight path
  let highlightedIds = new Set<string>()
  if (hoveredNodeId) {
    highlightedIds = getPathNodeIds(hoveredNodeId, nodeMap as Map<string, { choices: { targetNodeId: string }[]; type: string }>)
    if (highlightedIds.size === 0) highlightedIds.add(hoveredNodeId)
  }

  // Compute auto-layout positions using act structure
  const autoPos = autoLayout(pNodes, project.acts ?? [], project.chapters ?? [])

  // Manual drag overrides auto-layout; auto-layout ignores stale saved positions from old code
  function getPos(node: StoryNode): { x: number; y: number } {
    return manualPos.get(node.id) ?? autoPos.get(node.id) ?? { x: 0, y: 0 }
  }

  // Render ALL project nodes
  for (const node of pNodes) {
    const highlighted = hoveredNodeId ? highlightedIds.has(node.id) : false
    const dimmed = hoveredNodeId ? !highlightedIds.has(node.id) : false

    // Dead end: not an ending, has no choices or no valid choices, and nothing points to it as an explore
    const validChoices = (node.choices ?? []).filter(c => c.targetNodeId && nodeMap.has(c.targetNodeId))
    const isAutoReturn = node.type === 'explore' && !!node.exploreReturnNodeId
    const deadEnd = node.type !== 'ending' && !isAutoReturn && validChoices.length === 0

    flowNodes.push({
      id: node.id,
      type: 'storyNode',
      position: getPos(node),
      data: {
        label: node.title || '（无标题）',
        nodeType: node.type,
        highlighted,
        dimmed,
        dialogueCount: (node.dialogue ?? []).length,
        hasChoices: validChoices.length > 0,
        deadEnd,
        onEdit: onEditNode ? () => onEditNode(node.id) : undefined,
      },
    })

    // Edges from this node's choices
    for (const choice of (node.choices ?? [])) {
      if (!choice.targetNodeId || !nodeMap.has(choice.targetNodeId)) continue
      const toEnding = endingNodeIds.has(choice.targetNodeId)
      const onPath = hoveredNodeId ? (highlightedIds.has(node.id) && highlightedIds.has(choice.targetNodeId)) : false
      const edgeDimmed = !!hoveredNodeId && !onPath

      const stroke = edgeDimmed ? '#e2e8f0' : toEnding ? '#f59e0b' : onPath ? '#a78bfa' : '#94a3b8'

      edges.push({
        id: `e-${choice.id}`,
        source: node.id,
        target: choice.targetNodeId,
        label: choice.text.length > 14 ? choice.text.slice(0, 14) + '…' : choice.text,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: onPath ? 2.5 : toEnding ? 2 : 1.5,
          opacity: edgeDimmed ? 0.12 : 1,
        },
        labelStyle: {
          fontSize: 10,
          fill: edgeDimmed ? '#cbd5e1' : toEnding ? '#d97706' : onPath ? '#7c3aed' : '#64748b',
          fontWeight: onPath ? 600 : 400,
        },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
        labelBgPadding: [3, 5],
        animated: onPath,
      })
    }
  }

  return { nodes: flowNodes, edges }
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FlowView({ project }: { project: Project }) {
  const router = useRouter()
  const params = useParams()
  const onEditNode = (nodeId: string) => router.push(`/project/${params.id}/workshop?node=${nodeId}`)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  // Manual positions: user-dragged overrides that take precedence over auto-layout
  const [manualPos, setManualPos] = useState<Map<string, { x: number; y: number }>>(new Map())

  const { nodes, edges } = useMemo(
    () => buildFlowData(project, hoveredNodeId, manualPos, onEditNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, hoveredNodeId, manualPos]
  )

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    setHoveredNodeId(node.id)
  }, [])

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  const handleNodeDragStop: OnNodeDrag = useCallback((_evt, node) => {
    setManualPos(prev => new Map(prev).set(node.id, { x: node.position.x, y: node.position.y }))
  }, [])

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm bg-slate-50">
        暂无节点，请先在列表视图中创建节点结构
      </div>
    )
  }

  const endingCount = project.nodes.filter(n => n.type === 'ending').length
  const branchCount = project.nodes.filter(n => n.type === 'branch').length
  const deadEndCount = nodes.filter(n => (n.data as { deadEnd: boolean }).deadEnd).length

  return (
    <div className="h-full w-full relative bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 0.8 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeDragStop={handleNodeDragStop}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#f8fafc' }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#cbd5e1" gap={32} size={1} variant={'dots' as never} />
        <Controls
          showInteractive={false}
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
        <MiniMap
          nodeColor={n => MINIMAP_COLORS[(n.data as { nodeType: string }).nodeType] ?? '#94a3b8'}
          maskColor="rgba(248,250,252,0.75)"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
          nodeStrokeWidth={0}
        />
      </ReactFlow>

      {/* Stats bar */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <div className="bg-white/95 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-3 text-xs shadow-sm">
          <span className="text-slate-500">{project.nodes.length} 节点</span>
          <span className="text-slate-300">·</span>
          <span className="text-violet-600">{branchCount} 分支</span>
          <span className="text-slate-300">·</span>
          <span className="text-amber-600">{endingCount} 结局</span>
          {deadEndCount > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-red-500 font-medium">{deadEndCount} 断头</span>
            </>
          )}
        </div>
        {hoveredNodeId && (
          <div className="bg-white/95 border border-violet-400/50 rounded-lg px-3 py-2 text-xs text-violet-600 shadow-sm">
            悬停高亮路径 · 点击前往工坊
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-24 left-3 bg-white/95 border border-slate-200 rounded-lg px-3 py-2.5 pointer-events-none shadow-sm">
        <div className="flex flex-col gap-1.5">
          {[
            { color: '#f59e0b', label: '通向结局' },
            { color: '#a78bfa', label: '当前悬停路径' },
            { color: '#94a3b8', label: '普通连接' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <div className="w-6 h-px rounded" style={{ background: item.color, height: 2 }} />
              <span className="text-slate-500">{item.label}</span>
            </div>
          ))}
          <div className="border-t border-slate-200 mt-1 pt-1.5 flex items-center gap-2 text-xs">
            <span className="text-red-500 font-bold text-[10px] bg-red-100 px-1 rounded">断头</span>
            <span className="text-slate-500">无有效出口</span>
          </div>
        </div>
      </div>
    </div>
  )
}
