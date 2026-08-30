// 定向重构（FR-19）补丁应用层：把 AI 返回的 TargetedFixResult.ops 解析为项目结构的增量修改。
// 契约定义在 lib/ai/targetedFixTypes.ts，本文件只负责消费，不扩展字段。
import { nanoid } from 'nanoid'
import type { Chapter, Act, StoryNode, Ending, Choice, Project } from '@/lib/types/project'
import type { NodeRef, TargetedFixOp, TargetedFixResult } from '@/lib/ai/targetedFixTypes'

/** 操作类型 → 中文标签，供预览 UI 的 Tag 使用 */
export const FIX_OP_LABELS: Record<TargetedFixOp['op'], string> = {
  add_node: '新增节点',
  update_node: '修改节点',
  add_choice: '新增选项',
  update_choice: '修改选项',
  set_explore_return: '设置探索返回',
  bind_ending: '绑定结局',
}

function refLabel(ref?: NodeRef): string {
  if (!ref) return '未指定'
  return ref.nodeTitle ?? ref.nodeId ?? '未指定'
}

/**
 * 选项文本宽容匹配：LLM 偶尔会把结构摘要的整行（「文本 → 目标 效果:xx」）当成 choiceText，
 * 先截掉「 →」及之后的标注再按 精确 → 前缀 → 包含 匹配，避免可救的 op 被误判失败。
 */
export function matchChoice(choices: { text: string }[], rawText: string): number {
  const wanted = rawText.split('→')[0].replace(/效果:.*$/, '').trim()
  let idx = choices.findIndex(c => c.text === rawText)
  if (idx === -1) idx = choices.findIndex(c => c.text === wanted)
  if (idx === -1) idx = choices.findIndex(c => c.text.startsWith(wanted) || wanted.startsWith(c.text))
  if (idx === -1) idx = choices.findIndex(c => wanted.includes(c.text) || c.text.includes(wanted))
  return idx
}

/**
 * 展示用引用标签：LLM 常以 nodeId 引用（结构摘要提供的是 id），
 * 直接显示裸 id 不可读——优先解析为节点标题，其次补丁内新增节点的标题，最后才落回原始引用。
 */
function displayLabel(ref: NodeRef | undefined, nodes: StoryNode[], pendingTitles: Map<string, string>): string {
  if (!ref) return '未指定'
  if (ref.nodeId) {
    const byId = nodes.find(n => n.id === ref.nodeId)
    if (byId) return byId.title || ref.nodeId
    const pending = pendingTitles.get(ref.nodeId)
    if (pending) return pending
  }
  return refLabel(ref)
}

/**
 * 按 nodeId → 精确标题 → 包含匹配 解析节点引用为 id。
 * pendingNewNodes：本次补丁中尚未落库的新节点（标题 → 占位/真实 id），
 * 供后续 op 引用同一批补丁里刚新增的节点。
 */
export function resolveRef(ref: NodeRef | undefined, nodes: StoryNode[], pendingNewNodes: Map<string, string>): string | null {
  if (!ref) return null
  if (ref.nodeId) {
    const byId = nodes.find(n => n.id === ref.nodeId)
    if (byId) return byId.id
    const pendingById = pendingNewNodes.get(ref.nodeId)
    if (pendingById) return pendingById
  }
  if (ref.nodeTitle) {
    const exact = nodes.find(n => n.title === ref.nodeTitle)
    if (exact) return exact.id
    const pendingExact = pendingNewNodes.get(ref.nodeTitle)
    if (pendingExact) return pendingExact
    const fuzzy = nodes.find(n => n.title.includes(ref.nodeTitle!) || ref.nodeTitle!.includes(n.title))
    if (fuzzy) return fuzzy.id
    for (const [title, id] of pendingNewNodes) {
      if (title.includes(ref.nodeTitle) || ref.nodeTitle.includes(title)) return id
    }
  }
  return null
}

export interface FixOpPreview {
  index: number
  op: TargetedFixOp
  label: string
  valid: boolean
  reason?: string
}

/** 预览态校验：不修改任何数据，只判断每条 op 的引用能否解析，供 UI 把解析失败的 op 置灰不可选 */
export function previewFixOps(nodes: StoryNode[], ops: TargetedFixOp[]): FixOpPreview[] {
  const pendingNewNodes = new Map<string, string>()
  const pendingTitles = new Map<string, string>() // 占位 id → 新节点标题（供展示回读）
  // 预扫描：LLM 的 op 顺序不保证拓扑序，先把全部 add_node 的标题登记为待建节点，
  // 使排在前面的 add_choice/update_choice 也能解析到它们（applyOps 侧对应地先应用 add_node）
  ops.forEach((op, index) => {
    if (op.op === 'add_node') {
      pendingNewNodes.set(op.node.title, `__pending_${index}__`)
      pendingTitles.set(`__pending_${index}__`, op.node.title)
    }
  })
  return ops.map((op, index) => {
    let valid = true
    let reason: string | undefined
    let label = ''
    const show = (ref?: NodeRef) => displayLabel(ref, nodes, pendingTitles)

    function need(ref: NodeRef | undefined, what: string): string | null {
      const id = resolveRef(ref, nodes, pendingNewNodes)
      if (!id) { valid = false; reason = `找不到${what}「${show(ref)}」` }
      return id
    }

    switch (op.op) {
      case 'add_node':
        need(op.after, '插入位置节点')
        label = `新增「${op.node.title}」→ 置于「${show(op.after)}」之后`
        if (valid) {
          pendingNewNodes.set(op.node.title, `__pending_${index}__`)
          pendingTitles.set(`__pending_${index}__`, op.node.title)
        }
        break
      case 'update_node':
        need(op.target, '目标节点')
        label = `修改「${show(op.target)}」`
        break
      case 'add_choice':
        need(op.target, '目标节点')
        need(op.choice.target, '选项跳转目标')
        label = `「${show(op.target)}」新增选项「${op.choice.text}」→「${show(op.choice.target)}」`
        break
      case 'update_choice': {
        const targetId = need(op.target, '目标节点')
        if (targetId) {
          const node = nodes.find(n => n.id === targetId)
          if (!node || matchChoice(node.choices, op.choiceText) === -1) {
            valid = false
            reason = `节点「${show(op.target)}」上找不到选项「${op.choiceText}」`
          }
        }
        if (op.patch.targetRef) need(op.patch.targetRef, '新跳转目标')
        label = `「${show(op.target)}」修改选项「${op.choiceText}」`
        break
      }
      case 'set_explore_return':
        need(op.target, '探索节点')
        need(op.returnTo, '返回目标')
        label = `「${show(op.target)}」设置探索返回 →「${show(op.returnTo)}」`
        break
      case 'bind_ending':
        need(op.target, '结局节点')
        label = `「${show(op.target)}」绑定结局「${op.ending.title}」`
        break
    }
    return { index, op, label, valid, reason }
  })
}

export interface ApplyOpsResult {
  chapters: Chapter[]
  acts: Act[]
  nodes: StoryNode[]
  endings: Ending[]
  appliedCount: number
  skippedCount: number
}

/** applyOps 内部工作态：各 op 处理函数按需读取/重写这几个字段，减少参数传递 */
interface ApplyCtx {
  nodes: StoryNode[]
  acts: Act[]
  endings: Ending[]
  pendingNewNodes: Map<string, string>
}

function resolveIn(ctx: ApplyCtx, ref?: NodeRef): string | null {
  return resolveRef(ref, ctx.nodes, ctx.pendingNewNodes)
}

function applyAddNode(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'add_node' }>): boolean {
  const afterId = resolveIn(ctx, op.after)
  const afterNode = afterId ? ctx.nodes.find(n => n.id === afterId) : undefined
  const act = afterNode ? ctx.acts.find(a => a.id === afterNode.actId) : undefined
  if (!afterNode || !act) return false
  const newId = nanoid(8)
  const newNode: StoryNode = {
    id: newId, actId: act.id, title: op.node.title, type: op.node.type,
    order: afterNode.order + 0.5,
    position: { x: afterNode.position.x + 160, y: afterNode.position.y },
    emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: op.node.type === 'explore' ? 2 : 5 },
    systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
    sceneDesc: '', dialogue: [], choices: [], durationSeconds: 120, notes: op.node.notes ?? '',
  }
  ctx.nodes = [...ctx.nodes, newNode]
  const idx = act.nodeIds.indexOf(afterNode.id)
  const insertAt = idx === -1 ? act.nodeIds.length : idx + 1
  act.nodeIds.splice(insertAt, 0, newId)
  ctx.pendingNewNodes.set(op.node.title, newId)
  return true
}

function applyUpdateNode(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'update_node' }>): boolean {
  const targetId = resolveIn(ctx, op.target)
  if (!targetId) return false
  ctx.nodes = ctx.nodes.map(n => n.id !== targetId ? n : {
    ...n,
    ...(op.patch.title !== undefined ? { title: op.patch.title } : {}),
    ...(op.patch.type !== undefined ? { type: op.patch.type } : {}),
    ...(op.patch.notes !== undefined ? { notes: op.patch.notes } : {}),
  })
  return true
}

function applyAddChoice(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'add_choice' }>): boolean {
  const targetId = resolveIn(ctx, op.target)
  const choiceTargetId = resolveIn(ctx, op.choice.target)
  if (!targetId || !choiceTargetId) return false
  ctx.nodes = ctx.nodes.map(n => {
    if (n.id !== targetId) return n
    const choice: Choice = {
      id: nanoid(8), nodeId: targetId, text: op.choice.text, order: n.choices.length,
      targetNodeId: choiceTargetId,
      conditions: op.choice.conditions ?? '',
      variableEffects: op.choice.variableEffects ?? '',
      consequence: op.choice.consequence,
    }
    return { ...n, choices: [...n.choices, choice] }
  })
  return true
}

function applyUpdateChoice(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'update_choice' }>): boolean {
  const targetId = resolveIn(ctx, op.target)
  const node = targetId ? ctx.nodes.find(n => n.id === targetId) : undefined
  const choiceIdx = node ? matchChoice(node.choices, op.choiceText) : -1
  if (!node || choiceIdx === -1) return false
  const newTargetId = op.patch.targetRef ? resolveIn(ctx, op.patch.targetRef) : undefined
  ctx.nodes = ctx.nodes.map(n => {
    if (n.id !== node.id) return n
    const choices = n.choices.map((c, i) => i !== choiceIdx ? c : {
      ...c,
      ...(op.patch.text !== undefined ? { text: op.patch.text } : {}),
      ...(op.patch.conditions !== undefined ? { conditions: op.patch.conditions } : {}),
      ...(op.patch.variableEffects !== undefined ? { variableEffects: op.patch.variableEffects } : {}),
      ...(op.patch.consequence !== undefined ? { consequence: op.patch.consequence } : {}),
      ...(newTargetId ? { targetNodeId: newTargetId } : {}),
    })
    return { ...n, choices }
  })
  return true
}

function applySetExploreReturn(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'set_explore_return' }>): boolean {
  const targetId = resolveIn(ctx, op.target)
  const returnId = resolveIn(ctx, op.returnTo)
  if (!targetId || !returnId) return false
  ctx.nodes = ctx.nodes.map(n => n.id === targetId ? { ...n, exploreReturnNodeId: returnId } : n)
  return true
}

function applyBindEnding(ctx: ApplyCtx, op: Extract<TargetedFixOp, { op: 'bind_ending' }>): boolean {
  const targetId = resolveIn(ctx, op.target)
  if (!targetId) return false
  const existing = ctx.endings.find(e => e.nodeId === targetId)
  ctx.endings = existing
    ? ctx.endings.map(e => e.id === existing.id ? {
        ...e, title: op.ending.title, type: op.ending.type,
        description: op.ending.description ?? e.description,
        conditions: op.ending.conditions ?? e.conditions,
      } : e)
    : [...ctx.endings, {
        id: nanoid(8), nodeId: targetId, title: op.ending.title, type: op.ending.type,
        description: op.ending.description ?? '', conditions: op.ending.conditions ?? '',
        variableConditions: [], requiredChoiceIds: [], reachPath: '',
      }]
  return true
}

function applyOne(ctx: ApplyCtx, op: TargetedFixOp): boolean {
  switch (op.op) {
    case 'add_node': return applyAddNode(ctx, op)
    case 'update_node': return applyUpdateNode(ctx, op)
    case 'add_choice': return applyAddChoice(ctx, op)
    case 'update_choice': return applyUpdateChoice(ctx, op)
    case 'set_explore_return': return applySetExploreReturn(ctx, op)
    case 'bind_ending': return applyBindEnding(ctx, op)
  }
}

/**
 * 纯函数：把已勾选的补丁 op 应用到项目上，返回新的 { chapters, acts, nodes, endings }。
 * 不触碰任何节点的 dialogue/sceneDesc。调用方负责把结果落到 store
 * （bulkSetStructure 写 chapters/acts/nodes；endings 走 addEnding/updateEnding 逐条 diff）。
 */
export function applyOps(project: Project, selectedOps: TargetedFixOp[]): ApplyOpsResult {
  const ctx: ApplyCtx = {
    nodes: project.nodes.map(n => ({ ...n, choices: n.choices.map(c => ({ ...c })) })),
    acts: project.acts.map(a => ({ ...a, nodeIds: [...a.nodeIds] })),
    endings: [...project.endings],
    pendingNewNodes: new Map(),
  }
  let appliedCount = 0
  let skippedCount = 0
  // LLM 的 op 顺序不保证拓扑序（add_choice 可能排在其指向的 add_node 之前），
  // 先应用全部 add_node（组内保持相对顺序），其余 op 随后——引用解析才能命中新节点。
  const ordered = [...selectedOps.filter(o => o.op === 'add_node'), ...selectedOps.filter(o => o.op !== 'add_node')]
  for (const op of ordered) {
    if (applyOne(ctx, op)) appliedCount++
    else skippedCount++
  }
  return { chapters: [...project.chapters], acts: ctx.acts, nodes: ctx.nodes, endings: ctx.endings, appliedCount, skippedCount }
}

/** 组装喂给 structure:targeted_fix 的结构摘要文本：章/幕/节点/选项（含条件与效果）+ 变量表 */
export function buildStructureSummary(project: Project): string {
  const lines: string[] = []
  const nodeById = new Map(project.nodes.map(n => [n.id, n]))
  const sortedChapters = [...project.chapters].sort((a, b) => a.order - b.order)
  for (const ch of sortedChapters) {
    lines.push(`# ${ch.title}`)
    const acts = project.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order)
    for (const act of acts) {
      lines.push(`## ${act.title}`)
      for (const nodeId of act.nodeIds) {
        const node = nodeById.get(nodeId)
        if (!node) continue
        lines.push(`- [${node.id}] ${node.title}（${node.type}）${node.notes ? '// ' + node.notes : ''}`)
        for (const c of node.choices) {
          const cond = c.conditions ? ` 条件:${c.conditions}` : ''
          const eff = c.variableEffects ? ` 效果:${c.variableEffects}` : ''
          const target = nodeById.get(c.targetNodeId)?.title ?? c.targetNodeId ?? '（未连接）'
          lines.push(`  · ${c.text} → ${target}${cond}${eff}`)
        }
        if (node.exploreReturnNodeId) {
          lines.push(`  · [探索返回] → ${nodeById.get(node.exploreReturnNodeId)?.title ?? node.exploreReturnNodeId}`)
        }
      }
    }
  }
  lines.push('# 变量')
  for (const v of project.variables) {
    lines.push(`- ${v.name}（${v.type}，默认 ${v.defaultValue}）${v.description ? '// ' + v.description : ''}`)
  }
  return lines.join('\n')
}

export type { TargetedFixOp, TargetedFixResult }
