'use client'
import { useMemo, useCallback, useState, useRef } from 'react'
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
      {/* 多方位连接点：连线按两端几何关系自动选边（右出左进为默认；跨泳道底出顶进；
          回绕边左出右进），避免固定左进右出产生的绕线。非默认位手柄不可见。 */}
      <Handle id="tl" type="target" position={Position.Left}
        style={{ background: s.hex, width: 8, height: 8, border: '2px solid var(--color-paper)', left: -5 }} />
      <Handle id="tt" type="target" position={Position.Top}
        style={{ opacity: 0, width: 6, height: 6, top: -3, pointerEvents: 'none' }} />
      <Handle id="tr" type="target" position={Position.Right}
        style={{ opacity: 0, width: 6, height: 6, right: -3, pointerEvents: 'none' }} />

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

      <Handle id="sr" type="source" position={Position.Right}
        style={{ background: s.hex, width: 8, height: 8, border: '2px solid var(--color-paper)', right: -5 }} />
      <Handle id="sb" type="source" position={Position.Bottom}
        style={{ opacity: 0, width: 6, height: 6, bottom: -3, pointerEvents: 'none' }} />
      <Handle id="sl" type="source" position={Position.Left}
        style={{ opacity: 0, width: 6, height: 6, left: -3, pointerEvents: 'none' }} />
    </div>
  )
}

/** 按两端坐标选择连线的出入边：默认右出左进；目标明显在下方（跨泳道/同列下方）底出顶进；
    目标在左侧（回绕边，如探索返回）左出右进——消除固定手柄造成的长距离绕线。 */
function pickHandles(sx: number, sy: number, tx: number, ty: number): { sourceHandle: string; targetHandle: string } {
  const dx = tx - sx
  const dy = ty - sy
  if (dx >= COL_W / 2) return { sourceHandle: 'sr', targetHandle: 'tl' }
  if (dy > ROW_H) return { sourceHandle: 'sb', targetHandle: 'tt' }
  if (dx < 0) return { sourceHandle: 'sl', targetHandle: 'tr' }
  return { sourceHandle: 'sr', targetHandle: 'tl' }
}

const nodeTypes = { storyNode: StoryNodeView }

// ── Path highlight (linear reachability) ────────────────────────────────────

/** 选中节点的可达路径 = 前向可达集 ∩ 能到达结局的节点集。两遍 BFS，O(V+E)。
    此前的递归 DFS 每个分支复制 visited 并重扫子树，路径数随分支×汇合组合爆炸，
    在 58 节点图上点击靠前节点直接卡死主线程（锁死事故的根因）。 */
function getPathNodeIds(startId: string, nodeMap: Map<string, { choices: { targetNodeId: string }[]; type: string }>): Set<string> {
  // 前向：从选中节点沿 choices 可达的所有节点
  const forward = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (forward.has(id)) continue
    const node = nodeMap.get(id)
    if (!node) continue
    forward.add(id)
    if (node.type === 'ending') continue
    for (const c of node.choices) if (c.targetNodeId) queue.push(c.targetNodeId)
  }
  // 反向：只保留能通向某个结局的节点（剪掉断头支线，与旧语义一致）
  const parentsOf = new Map<string, string[]>()
  const endings: string[] = []
  for (const id of forward) {
    const node = nodeMap.get(id)!
    if (node.type === 'ending') { endings.push(id); continue }
    for (const c of node.choices) {
      if (!c.targetNodeId || !forward.has(c.targetNodeId)) continue
      const list = parentsOf.get(c.targetNodeId)
      if (list) list.push(id)
      else parentsOf.set(c.targetNodeId, [id])
    }
  }
  const result = new Set<string>()
  const back = [...endings]
  while (back.length > 0) {
    const id = back.pop()!
    if (result.has(id)) continue
    result.add(id)
    for (const p of parentsOf.get(id) ?? []) back.push(p)
  }
  return result
}

// ── Auto-layout: BFS depth columns within each act ──────────────────────────

const NODE_W = 200
const NODE_H = 90
const COL_W = 260       // horizontal spacing per depth column
const ROW_H = NODE_H + 50  // vertical spacing between nodes in same column
const ACT_GAP = 60      // extra horizontal gap between acts
// 泳道折行：大项目（40+ 节点）所有章横向接龙会得到 1 万像素宽、两行高的"一条线"。
// 按章折行（每章一条）之后仍是 4900×1800 的扁条，宽高比 2.7 远宽于画布的 1.6——
// fitView 按宽度贴合，上下各空 190px、只填满 52% 高度，缩放被压到 0.22（节点字全糊）。
// 所以行宽不能等于"一章"，要按内容总量与目标宽高比动态折行：章内摆不下就换行，
// 章与章之间必定换行（保持章的视觉分组）。
const LANE_GAP = 140    // 相邻泳道之间的垂直留白
// 目标宽高比：略宽于常见画布（16:9 去掉右侧协作栏后约 1.6），留一点余量避免竖向溢出
const TARGET_ASPECT = 1.7

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
  const sortedActs: (typeof acts[number] & { chapterIdx: number })[] = []
  sortedChapters.forEach((ch, chapterIdx) => {
    const chActs = acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order)
    sortedActs.push(...chActs.map(a => ({ ...a, chapterIdx })))
  })

  const assigned = new Set<string>()

  // ── 阶段一：算出每一幕的内部布局与占位尺寸（此时不定 x/y）──────────────
  // 折行宽度依赖全局总宽，必须先量完所有幕才能决定，所以摆放推迟到阶段二。
  type ActLayout = {
    chapterIdx: number
    columns: string[][]   // 每个深度一列，列内为节点 id
    width: number         // 本幕横向占位（含幕间距）
    maxColLen: number     // 最高一列的节点数，决定行高
  }
  const actLayouts: ActLayout[] = []

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
    const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
    for (const [id, d] of depthMap) columns[d].push(id)

    actLayouts.push({
      chapterIdx: act.chapterIdx,
      columns,
      width: (maxDepth + 1) * COL_W + ACT_GAP,
      maxColLen: Math.max(1, ...columns.map(c => c.length)),
    })
  }

  // ── 折行宽度：让整图宽高比贴近画布 ───────────────────────────────────
  // 设总宽 W、每行高 H、行数 R，则宽高比 ≈ (W/R)/(R·H)。令其等于 TARGET_ASPECT
  // 解出 R = √(W / (ASPECT·H))，行宽即 W/R。行宽不得小于最宽的一幕（一幕不拆）。
  const totalWidth = actLayouts.reduce((sum, a) => sum + a.width, 0)
  const widestAct = Math.max(COL_W, ...actLayouts.map(a => a.width))
  const rowHeightEst = Math.max(...actLayouts.map(a => a.maxColLen)) * ROW_H + LANE_GAP
  const rowCount = Math.max(1, Math.round(Math.sqrt(totalWidth / (TARGET_ASPECT * rowHeightEst))))
  const rowWidth = Math.max(widestAct, totalWidth / rowCount)

  // ── 阶段二：按行摆放（章必换行，行内摆不下也换行）──────────────────────
  // y 仍留到第三遍：行基线要等所有行的实际最大列高确定后再累加，保证行间不侵入。
  type Cell = { id: string; lane: number; x: number; rowIdx: number; colLen: number }
  const cells: Cell[] = []
  const laneMaxRows = new Map<number, number>()

  let lane = -1
  let xOffset = 0
  let currentChapter = -1

  for (const layout of actLayouts) {
    const isNewChapter = layout.chapterIdx !== currentChapter
    const overflows = xOffset > 0 && xOffset + layout.width > rowWidth
    if (isNewChapter || overflows) {
      lane++
      xOffset = 0
      currentChapter = layout.chapterIdx
    }

    layout.columns.forEach((col, d) => {
      col.forEach((id, rowIdx) => {
        cells.push({ id, lane, x: xOffset + d * COL_W, rowIdx, colLen: col.length })
        assigned.add(id)
      })
      laneMaxRows.set(lane, Math.max(laneMaxRows.get(lane) ?? 1, col.length))
    })

    xOffset += layout.width
  }

  // 第二遍：泳道基线按实际高度累加；列在泳道内垂直居中。
  // colH ≤ laneH 恒成立（laneH 取自本泳道最大列高），节点必落在本泳道范围内。
  const laneTop = new Map<number, number>()
  let yCursor = 0
  for (const lane of [...laneMaxRows.keys()].sort((a, b) => a - b)) {
    laneTop.set(lane, yCursor)
    yCursor += laneMaxRows.get(lane)! * ROW_H + LANE_GAP
  }
  for (const c of cells) {
    const laneH = laneMaxRows.get(c.lane)! * ROW_H
    const colH = c.colLen * ROW_H
    positions.set(c.id, { x: c.x, y: laneTop.get(c.lane)! + (laneH - colH) / 2 + c.rowIdx * ROW_H })
  }

  // Fallback: nodes not assigned to any act——垫到所有泳道下方，不与任何泳道内容重叠
  const unassigned = nodes.filter(n => !assigned.has(n.id))
  unassigned.forEach((n, i) => {
    positions.set(n.id, { x: 0, y: yCursor + i * ROW_H })
  })

  return positions
}

// ── Build React Flow data ───────────────────────────────────────────────────

function buildFlowData(project: Project, focusNodeId: string | null, manualPos: Map<string, { x: number; y: number }>, autoPos: Map<string, { x: number; y: number }>, onEditNode?: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = []
  const edges: Edge[] = []

  const pNodes = project.nodes ?? []
  const nodeMap = new Map(pNodes.map(n => [n.id, n]))
  const endingNodeIds = new Set(pNodes.filter(n => n.type === 'ending').map(n => n.id))
  const endingHex = nodeTypeStyle('ending').hex
  const normalHex = nodeTypeStyle('normal').hex

  // Highlight path
  let highlightedIds = new Set<string>()
  if (focusNodeId) {
    highlightedIds = getPathNodeIds(focusNodeId, nodeMap as Map<string, { choices: { targetNodeId: string }[]; type: string }>)
    if (highlightedIds.size === 0) highlightedIds.add(focusNodeId)
  }

  // Manual drag overrides auto-layout; persisted manual positions (positionManual) take
  // precedence over auto-layout too, so a reload still honors the user's dragged layout.
  function getPos(node: StoryNode): { x: number; y: number } {
    return manualPos.get(node.id) ?? (node.positionManual ? node.position : undefined) ?? autoPos.get(node.id) ?? { x: 0, y: 0 }
  }

  // Render ALL project nodes
  for (const node of pNodes) {
    const highlighted = focusNodeId ? highlightedIds.has(node.id) : false
    const dimmed = focusNodeId ? !highlightedIds.has(node.id) : false

    // Dead end: not an ending, has no choices or no valid choices, and nothing points to it as an explore
    const validChoices = (node.choices ?? []).filter(c => c.targetNodeId && nodeMap.has(c.targetNodeId))
    // 必须校验返回目标仍存在：目标被删后仅凭 exploreReturnNodeId 非空会漏判断头
    const isAutoReturn = node.type === 'explore' && !!node.exploreReturnNodeId && nodeMap.has(node.exploreReturnNodeId)
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
      const onPath = focusNodeId ? (highlightedIds.has(node.id) && highlightedIds.has(targetId)) : false
      const edgeDimmed = !!focusNodeId && !onPath

      const stroke = edgeDimmed ? 'var(--color-line)' : toEnding ? endingHex : onPath ? 'var(--color-vermilion)' : normalHex
      const baseLabel = choice.text.length > 14 ? choice.text.slice(0, 14) + '…' : choice.text
      const sPos = getPos(node)
      const tPos = getPos(nodeMap.get(targetId)!)
      const handles = pickHandles(sPos.x, sPos.y, tPos.x, tPos.y)

      edges.push({
        id: `e-${choice.id}`,
        source: node.id,
        target: targetId,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
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
        // 不用 animated：高亮路径可能覆盖上百条边，虚线动画会让整图持续逐帧重绘，
        // 点击一次后平移/缩放永久掉帧。加粗+朱红静态样式已足够区分。
      })
    }
  }

  return { nodes: flowNodes, edges }
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FlowView({ project, toolbar }: { project: Project; toolbar?: React.ReactNode }) {
  const router = useRouter()
  const params = useParams()
  const onEditNode = (nodeId: string) => router.push(`/project/${params.id}/workshop?node=${nodeId}`)
  const updateNode = useProjectStore(s => s.updateNode)
  // 路径高亮改为「点击选中」而非悬停：平移画布时光标扫过节点会形成 enter/leave 风暴，
  // 每次都重建全部节点/边对象（大图上一次拖动触发几十次重建），表现为画布锁死无法移动。
  // 悬停反馈只保留纯 CSS（零 React 状态）。
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
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
    () => buildFlowData(project, focusNodeId, manualPos, autoPos, onEditNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.nodes, project.acts, project.chapters, focusNodeId, manualPos, autoPos]
  )

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setFocusNodeId(prev => (prev === node.id ? null : node.id))
  }, [])

  const handlePaneClick = useCallback(() => setFocusNodeId(null), [])

  // 拖拽起点：React Flow 对「单击」也会走 dragStart→dragStop（位移为 0）。
  // 不做位移判断的话，点一下节点看高亮路径就把它标成「手动定位」并把当前坐标烘焙进数据——
  // 该节点从此不再参与自动布局（实测 58 个节点里 50 个因点击被钉死，布局算法改了也不生效）。
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const handleNodeDragStart: OnNodeDrag = useCallback((_evt, node) => {
    dragStartRef.current = { x: node.position.x, y: node.position.y }
  }, [])

  const handleNodeDragStop: OnNodeDrag = useCallback((_evt, node) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    const position = { x: node.position.x, y: node.position.y }
    // 位移不足 4px 视为点击而非拖拽，不落库
    if (start && Math.hypot(position.x - start.x, position.y - start.y) < 4) return
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
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStart={handleNodeDragStart}
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
      {/* 顶部浮层：视图切换 + 统计。做成画布内浮层而不是画布上方的独立行——
          流程图是看图模式，那条 50px 的空带纯属浪费纵向像素 */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        {toolbar && <div className="pointer-events-auto">{toolbar}</div>}
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
        {focusNodeId && (
          <div className="bg-paper/95 border border-vermilion/50 px-3 py-2 text-xs text-vermilion" style={{ boxShadow: 'var(--shadow-card)' }}>
            已高亮该节点可达路径 · 点空白处取消 · 用卡上「编辑」进工坊
          </div>
        )}
      </div>

      {/* Legend：放右上角——左下会压住折行后最后一行的节点，右下是缩略图、左下是缩放控件 */}
      <div className="absolute top-3 right-3 bg-paper/95 border border-line px-3 py-2.5 pointer-events-none" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex flex-col gap-1.5">
          {[
            { color: endingStyle.hex, label: '通向结局' },
            { color: 'var(--color-vermilion)', label: '选中节点的路径' },
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
