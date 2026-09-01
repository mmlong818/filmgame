'use client'
import { useMemo, useCallback, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType } from '@xyflow/react'
import type { Node, Edge, NodeProps, NodeMouseHandler, OnNodeDrag } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project, StoryNode, NodeType } from '@/lib/types/project'
import { useProjectStore } from '@/lib/store/projectStore'
import { nodeTypeStyle } from '@/lib/ui/nodeTypes'

// ── Node renderer ───────────────────────────────────────────────────────────

function StoryNodeView({ data }: NodeProps) {
  const d = data as {
    label: string; nodeType: NodeType; highlighted: boolean; dimmed: boolean
    dialogueCount: number; hasChoices: boolean; deadEnd: boolean
    onEdit: () => void
  }
  const s = nodeTypeStyle(d.nodeType)
  const opacity = d.dimmed ? 'opacity-20' : 'opacity-100'

  return (
    <div
      className={`bg-paper border ${s.border} transition-[opacity,box-shadow] duration-150 ${opacity} cursor-grab active:cursor-grabbing`}
      style={{
        minWidth: NODE_W,
        maxWidth: NODE_W,
        borderLeftWidth: 3,
        borderLeftColor: s.hex,
        boxShadow: d.highlighted ? `0 0 0 1.5px ${s.hex}, var(--shadow-card-lift)` : 'var(--shadow-card)',
      }}
    >
      <Handle type="target" position={Position.Left}
        style={{ background: s.hex, width: 8, height: 8, border: '2px solid var(--color-paper)', left: -5 }} />

      {/* Header */}
      <div className={`flex items-center gap-1.5 px-3 pt-2.5 pb-1`}>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${s.text}`}>{s.label}</span>
        {d.deadEnd && (
          <span className="ml-auto text-[9px] text-vermilion font-bold bg-vermilion/10 border border-vermilion/40 px-1">断头</span>
        )}
      </div>

      {/* Title */}
      <div className="px-3 pb-1">
        <div
          className="text-sm font-medium text-ink leading-snug"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={d.label}
        >
          {d.label}
        </div>
        {d.dialogueCount > 0 && (
          <div className="mt-1 text-[10px] text-pencil">{d.dialogueCount} 行对白</div>
        )}
      </div>

      {/* Edit button */}
      <div className="px-3 pb-2.5 pt-1">
        <button
          onClick={(e) => { e.stopPropagation(); d.onEdit() }}
          className="text-[10px] text-pencil hover:text-ink border border-line hover:border-ink-soft px-2 py-0.5 transition-colors cursor-pointer"
          style={{ lineHeight: '1.6' }}
        >
          编辑
        </button>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: s.hex, width: 8, height: 8, border: '2px solid var(--color-paper)', right: -5 }} />
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
// 章级泳道高度：大项目（40+ 节点）所有章横向接龙会得到 1 万像素宽、两行高的"一条线"，
// 分支在视觉上被纵横比压扁。按章折行成泳道后，宽度缩到 1/章数，分支扇出肉眼可辨。
const LANE_H = 5 * ROW_H

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

  // Sort acts: chapter order → act order within chapter；每章一条泳道（章索引决定 y 基线）
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order)
  const sortedActs: (typeof acts[number] & { laneIdx: number })[] = []
  sortedChapters.forEach((ch, laneIdx) => {
    const chActs = acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order)
    sortedActs.push(...chActs.map(a => ({ ...a, laneIdx })))
  })

  const assigned = new Set<string>()
  let xOffset = 0  // running x position across acts within current lane
  let currentLane = -1

  for (const act of sortedActs) {
    if (act.laneIdx !== currentLane) { currentLane = act.laneIdx; xOffset = 0 } // 换章：x 从头累计，落入下一条泳道
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
          y: act.laneIdx * LANE_H + rowIdx * ROW_H - colH / 2,
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

function buildFlowData(project: Project, hoveredNodeId: string | null, manualPos: Map<string, { x: number; y: number }>, autoPos: Map<string, { x: number; y: number }>, onEditNode?: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = []
  const edges: Edge[] = []

  const pNodes = project.nodes ?? []
  const nodeMap = new Map(pNodes.map(n => [n.id, n]))
  const endingNodeIds = new Set(pNodes.filter(n => n.type === 'ending').map(n => n.id))
  const endingHex = nodeTypeStyle('ending').hex
  const normalHex = nodeTypeStyle('normal').hex

  // Highlight path
  let highlightedIds = new Set<string>()
  if (hoveredNodeId) {
    highlightedIds = getPathNodeIds(hoveredNodeId, nodeMap as Map<string, { choices: { targetNodeId: string }[]; type: string }>)
    if (highlightedIds.size === 0) highlightedIds.add(hoveredNodeId)
  }

  // Manual drag overrides auto-layout; persisted manual positions (positionManual) take
  // precedence over auto-layout too, so a reload still honors the user's dragged layout.
  function getPos(node: StoryNode): { x: number; y: number } {
    return manualPos.get(node.id) ?? (node.positionManual ? node.position : undefined) ?? autoPos.get(node.id) ?? { x: 0, y: 0 }
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
      // 初始尺寸：受控 nodes（无 onNodesChange 回写）下 MiniMap 依赖节点尺寸，
      // 缺失时 MiniMap 过滤掉全部节点渲染为空白；initialWidth/Height 只在测量前生效，不裁切卡片
      initialWidth: NODE_W,
      initialHeight: 74,
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

    // Edges from this node's choices。
    // v2 起推进节点常有 2-3 个选项指向同一后继（对话真选择），平行边在图上完全重叠、
    // 标签互相覆盖成乱码——同 (source,target) 合并为一条边并标注选项数。
    const grouped = new Map<string, typeof node.choices>()
    for (const choice of (node.choices ?? [])) {
      if (!choice.targetNodeId || !nodeMap.has(choice.targetNodeId)) continue
      const list = grouped.get(choice.targetNodeId)
      if (list) list.push(choice)
      else grouped.set(choice.targetNodeId, [choice])
    }
    for (const [targetId, choiceGroup] of grouped) {
      const choice = choiceGroup[0]
      const toEnding = endingNodeIds.has(targetId)
      const onPath = hoveredNodeId ? (highlightedIds.has(node.id) && highlightedIds.has(targetId)) : false
      const edgeDimmed = !!hoveredNodeId && !onPath

      const stroke = edgeDimmed ? 'var(--color-line)' : toEnding ? endingHex : onPath ? 'var(--color-vermilion)' : normalHex
      const baseLabel = choice.text.length > 14 ? choice.text.slice(0, 14) + '…' : choice.text

      edges.push({
        id: `e-${choice.id}`,
        source: node.id,
        target: targetId,
        label: choiceGroup.length > 1 ? `${baseLabel} 等 ${choiceGroup.length} 个选择` : baseLabel,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: onPath ? 2.5 : toEnding ? 2 : 1.5,
          opacity: edgeDimmed ? 0.12 : 1,
        },
        labelStyle: {
          fontSize: 10,
          fill: edgeDimmed ? 'var(--color-line)' : toEnding ? endingHex : onPath ? 'var(--color-vermilion)' : 'var(--color-pencil)',
          fontWeight: onPath ? 600 : 400,
        },
        labelBgStyle: { fill: 'var(--color-paper)', fillOpacity: 0.9 },
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
  const updateNode = useProjectStore(s => s.updateNode)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  // Manual positions: user-dragged overrides that take precedence over auto-layout.
  // Seeded from any previously persisted positionManual nodes so a reload keeps the layout.
  const [manualPos, setManualPos] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(project.nodes.filter(n => n.positionManual).map(n => [n.id, n.position]))
  )

  // 布局只随结构变化重算，绝不随 hover 重算（NFR-1：hover 不触发全图重排——
  // 曾回归为每次悬停全量重排，59 节点图上单次悬停卡 5 秒且节点位置抖动）
  const autoPos = useMemo(
    () => autoLayout(project.nodes ?? [], project.acts ?? [], project.chapters ?? []),
    [project.nodes, project.acts, project.chapters]
  )
  const { nodes, edges } = useMemo(
    () => buildFlowData(project, hoveredNodeId, manualPos, autoPos, onEditNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.nodes, project.acts, project.chapters, hoveredNodeId, manualPos, autoPos]
  )

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    setHoveredNodeId(node.id)
  }, [])

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  const handleNodeDragStop: OnNodeDrag = useCallback((_evt, node) => {
    const position = { x: node.position.x, y: node.position.y }
    setManualPos(prev => new Map(prev).set(node.id, position))
    updateNode(node.id, { position, positionManual: true })
  }, [updateNode])

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-pencil text-sm bg-paper-dim">
        暂无节点，请先在列表视图中创建节点结构
      </div>
    )
  }

  const endingCount = project.nodes.filter(n => n.type === 'ending').length
  const branchCount = project.nodes.filter(n => n.type === 'branch').length
  const deadEndCount = nodes.filter(n => (n.data as { deadEnd: boolean }).deadEnd).length
  const branchStyle = nodeTypeStyle('branch')
  const endingStyle = nodeTypeStyle('ending')
  const normalStyle = nodeTypeStyle('normal')

  return (
    <div className="h-full w-full relative" style={{ background: 'var(--color-kraft)' }}>
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
        style={{ background: 'var(--color-kraft)' }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="color-mix(in srgb, var(--color-ink) 15%, transparent)" gap={32} size={1} variant={'dots' as never} />
        <Controls
          showInteractive={false}
          style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 2 }}
        />
        <MiniMap
          nodeColor={n => nodeTypeStyle((n.data as { nodeType: NodeType }).nodeType).hex}
          nodeStrokeColor={n => nodeTypeStyle((n.data as { nodeType: NodeType }).nodeType).hex}
          maskColor="color-mix(in srgb, var(--color-paper) 60%, transparent)"
          style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 2 }}
          nodeStrokeWidth={6}
        />
      </ReactFlow>

      {/* Stats bar */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <div className="bg-paper/95 border border-line px-3 py-2 flex items-center gap-3 text-xs" style={{ boxShadow: 'var(--shadow-card)' }}>
          <span className="text-pencil">{project.nodes.length} 节点</span>
          <span className="text-line">·</span>
          <span className={branchStyle.text}>{branchCount} 分支</span>
          <span className="text-line">·</span>
          <span className={endingStyle.text}>{endingCount} 结局</span>
          {deadEndCount > 0 && (
            <>
              <span className="text-line">·</span>
              <span className="text-vermilion font-medium">{deadEndCount} 断头</span>
            </>
          )}
        </div>
        {hoveredNodeId && (
          <div className="bg-paper/95 border border-vermilion/50 px-3 py-2 text-xs text-vermilion" style={{ boxShadow: 'var(--shadow-card)' }}>
            悬停高亮路径 · 点击前往工坊
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-24 left-3 bg-paper/95 border border-line px-3 py-2.5 pointer-events-none" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex flex-col gap-1.5">
          {[
            { color: endingStyle.hex, label: '通向结局' },
            { color: 'var(--color-vermilion)', label: '当前悬停路径' },
            { color: normalStyle.hex, label: '普通连接' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <div className="w-6 rounded-none" style={{ background: item.color, height: 2 }} />
              <span className="text-pencil">{item.label}</span>
            </div>
          ))}
          <div className="border-t border-line mt-1 pt-1.5 flex items-center gap-2 text-xs">
            <span className="text-vermilion font-bold text-[10px] bg-vermilion/10 border border-vermilion/40 px-1">断头</span>
            <span className="text-pencil">无有效出口</span>
          </div>
        </div>
      </div>
    </div>
  )
}
