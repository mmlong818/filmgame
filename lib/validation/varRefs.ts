// 校验引擎的「变量/角色引用」分册（期 2）：全部读 AST（lib/refs/access），不再正则切原文串。
// 原 UNKNOWN_VARIABLE_REF 一码拆三：UNRESOLVED（只有名字、从未绑上）/ AMBIGUOUS（同名 >1）/ DANGLING（有 id 但变量已删，error）；
// 说话人未绑定按项目聚合成一条 info（存量数据里 261 行 / 20 个说话人全未绑是常态，逐行报会把通过率砸到 0）。
import { nanoid } from 'nanoid'
import type { Project, StoryNode, Ending, Variable, ValidationIssue, IssueLevel } from '../types/project.ts'
import type { CondNode, VarRef } from '../refs/types.ts'
import { choiceCond, choiceEffects, endingCond, refKey, speakerBound, collectCondRefs } from '../refs/access.ts'
import { resolveVariable } from '../refs/resolve.ts'

const issue = (level: IssueLevel, code: string, message: string, relatedIds: string[] = []): ValidationIssue =>
  ({ id: nanoid(4), level, code, message, relatedIds })

function collectRaw(node: CondNode | null, out: string[] = []): string[] {
  if (!node) return out
  if (node.k === 'raw') out.push(node.text)
  else if (node.k === 'and' || node.k === 'or') node.parts.forEach(p => collectRaw(p, out))
  return out
}

interface RefClasses { unresolved: string[]; ambiguous: string[]; dangling: string[] }
function classifyRefs(refs: VarRef[], variables: Variable[]): RefClasses {
  const ids = new Set(variables.map(v => v.id))
  const out: RefClasses = { unresolved: [], ambiguous: [], dangling: [] }
  const seen = new Set<string>()
  for (const ref of refs) {
    const key = `${ref.varId ?? ''}|${ref.name}`
    if (seen.has(key)) continue
    seen.add(key)
    if (ref.varId) { if (!ids.has(ref.varId)) out.dangling.push(ref.name); continue }
    const r = resolveVariable(variables, ref.name)
    if (r.kind === 'ambiguous') out.ambiguous.push(ref.name)
    else if (r.kind === 'unresolved') out.unresolved.push(ref.name)
  }
  return out
}

/** 数值上下界（键 = refKey）：max(默认值, 最大赋值) + 全部正向增量；下界对称。过近似只会高估，报出的永假都确凿 */
function numericBounds(safeNodes: StoryNode[], variables: Variable[]): Map<string, { max: number; min: number }> {
  const bounds = new Map<string, { max: number; min: number }>()
  for (const v of variables) { const d = Number(v.defaultValue); if (!isNaN(d)) bounds.set(v.id, { max: d, min: d }) }
  const inc = new Map<string, number>(), dec = new Map<string, number>(), setMax = new Map<string, number>(), setMin = new Map<string, number>()
  for (const n of safeNodes) for (const c of n.choices) for (const e of choiceEffects(c, variables)) {
    if (e.k !== 'eff') continue
    const key = refKey(e.ref, variables)
    const val = Number(e.value)
    if (!bounds.has(key) || isNaN(val)) continue
    if (e.kind === 'inc') inc.set(key, (inc.get(key) ?? 0) + val)
    else if (e.kind === 'dec') dec.set(key, (dec.get(key) ?? 0) + val)
    else { setMax.set(key, Math.max(setMax.get(key) ?? -Infinity, val)); setMin.set(key, Math.min(setMin.get(key) ?? Infinity, val)) }
  }
  for (const [key, b] of bounds) {
    b.max = Math.max(b.max, setMax.get(key) ?? -Infinity) + (inc.get(key) ?? 0)
    b.min = Math.min(b.min, setMin.get(key) ?? Infinity) - (dec.get(key) ?? 0)
  }
  return bounds
}

type Bounds = ReturnType<typeof numericBounds>
/** @returns null = 无法判定；否则永假子式列表（空 = 可满足）。|| 全部可判定子式都永假才判死；&& 任一永假即判死 */
function findUnsat(node: CondNode | null, bounds: Bounds, variables: Variable[]): string[] | null {
  if (!node || node.k === 'raw') return null
  if (node.k === 'or') {
    const sub = node.parts.map(p => findUnsat(p, bounds, variables)).filter((r): r is string[] => r !== null)
    if (sub.length === 0) return null
    return sub.some(r => r.length === 0) ? [] : sub.flat()
  }
  if (node.k === 'and') {
    const sub = node.parts.map(p => findUnsat(p, bounds, variables)).filter((r): r is string[] => r !== null)
    return sub.length === 0 ? null : sub.flat()
  }
  const b = bounds.get(refKey(node.ref, variables))
  const rhs = Number(node.value)
  if (!b || isNaN(rhs)) return null
  const impossible =
    (node.op === '>=' && rhs > b.max) || (node.op === '>' && rhs >= b.max) ||
    (node.op === '<=' && rhs < b.min) || (node.op === '<' && rhs <= b.min) ||
    (node.op === '==' && (rhs > b.max || rhs < b.min))
  return impossible ? [`${node.ref.name} ${node.op} ${node.value}`] : []
}

function refIssues(cls: RefClasses, where: string, related: string[]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  if (cls.unresolved.length) out.push({ ...issue('warning', 'UNRESOLVED_VARIABLE_REF', `${where}引用了未登记的变量：${cls.unresolved.join('、')}，运行时按 0 处理`, related), fix: { kind: 'register_variables', names: cls.unresolved } })
  if (cls.ambiguous.length) out.push({ ...issue('warning', 'AMBIGUOUS_VARIABLE_REF', `${where}引用的变量名对应多个同名变量：${cls.ambiguous.join('、')}，无法确定指向哪一个，请在结构页变量表重命名其一`, related), fixHref: 'structure' })
  if (cls.dangling.length) out.push(issue('error', 'DANGLING_VARIABLE_REF', `${where}绑定的变量已被删除：${cls.dangling.join('、')}，条件/效果将静默失效，请重新绑定或清除该引用`, related))
  return out
}

function checkChoices(safeNodes: StoryNode[], variables: Variable[], bounds: Bounds): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const node of safeNodes) {
    for (const c of node.choices) {
      const where = `节点「${node.title}」的选项「${c.text}」`
      const cond = choiceCond(c, variables)
      const effects = choiceEffects(c, variables)
      const refs = [...collectCondRefs(cond), ...effects.flatMap(e => e.k === 'eff' ? [e.ref] : [])]
      out.push(...refIssues(classifyRefs(refs, variables), where, [node.id]))
      const badEffects = effects.flatMap(e => e.k === 'raw' ? [e.text] : [])
      if (badEffects.length) out.push(issue('warning', 'UNPARSEABLE_EFFECT', `${where}含无法解析的变量效果：${badEffects.join('、')}，该效果在预览和导出中不会执行。支持的写法：+名称 / -名称 / 名称+1 / 名称=值（变量名仅限英文字母、数字、下划线）`, [node.id]))
      const rawCond = collectRaw(cond)
      if (rawCond.length) out.push(issue('warning', 'CONDITION_SYNTAX', `${where}条件写法无法识别（无法解析的子式：${rawCond.join('、')}），运行时会被当作无条件显示：${c.conditions}`, [node.id]))
      const unsat = findUnsat(cond, bounds, variables) ?? []
      if (unsat.length) out.push(issue('error', 'UNSATISFIABLE_CONDITION', `${where}条件永不可满足：${unsat.join('、')}（即使集齐全图所有变量效果也达不到该阈值），该选项在预览中永远不可见`, [node.id]))
    }
    // 无保底出口：全部选项都带条件时，一旦到达时机不对，玩家会被封死在该节点
    const autoReturn = node.type === 'explore' && !!node.exploreReturnNodeId
    if (node.type !== 'ending' && !autoReturn && node.choices.length > 0 && node.choices.every(c => (c.conditions ?? '').trim() !== '')) {
      out.push(issue('warning', 'ALL_CHOICES_GATED', `节点「${node.title}」的所有选项都设有条件、没有无条件的保底出口：玩家到达时若全部条件不满足会卡死在该节点。建议保留至少一个无条件选项，或确保条件组合覆盖所有可能状态`, [node.id]))
    }
  }
  return out
}

function checkEndings(endings: Ending[], variables: Variable[], bounds: Bounds): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const e of endings) {
    const cond = endingCond(e, variables)
    const where = `结局「${e.title}」的触发条件`
    out.push(...refIssues(classifyRefs(collectCondRefs(cond), variables), where, []))
    const unsat = findUnsat(cond, bounds, variables) ?? []
    if (unsat.length) out.push(issue('error', 'UNSATISFIABLE_CONDITION', `${where}永不可满足：${unsat.join('、')}（即使集齐全图所有变量效果也达不到该阈值），该结局永远无法触发`, []))
  }
  return out
}

/** 说话人未绑定到角色：按项目聚合成一条 info——是提示作者补角色表，不是结构缺陷 */
function checkSpeakers(safeNodes: StoryNode[], characters: Project['characters']): ValidationIssue[] {
  let lines = 0
  const names = new Set<string>()
  for (const n of safeNodes) for (const l of n.dialogue ?? []) {
    if (!l.speaker || speakerBound(l, characters ?? [])) continue
    lines++
    names.add(l.speaker)
  }
  if (lines === 0) return []
  const sample = [...names].slice(0, 5).join('、') + (names.size > 5 ? ` 等 ${names.size} 个` : '')
  return [issue('info', 'UNBOUND_SPEAKER', `${lines} 行对白的说话人未绑定到角色表（${sample}）：角色改名时这些对白不会跟随，声纹卡也无法约束其台词。可在世界锚点页补建角色，或在工坊里把说话人绑定到现有角色`, [])]
}

export function checkVariableRefs(project: Project, safeNodes: StoryNode[], endings: Ending[]): ValidationIssue[] {
  const variables = project.variables ?? []
  const bounds = numericBounds(safeNodes, variables)
  return [
    ...checkChoices(safeNodes, variables, bounds),
    ...checkEndings(endings, variables, bounds),
    ...checkSpeakers(safeNodes, project.characters),
  ]
}
