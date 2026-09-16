// 读侧统一入口（期 2）：预览 / 校验 / Ink 导出 / 覆盖率统计都从这里取引用层，
// 不再各自解析原文串。缺 AST 的条目（未迁移、或 addChoice 刚建的空选项）现场解析绑定兜底。
import type { Project, Variable, Character, Choice, Ending, DialogueLine } from '../types/project.ts'
import type { CondNode, EffectItem, VarRef } from './types.ts'
import { parseCond, parseEffects } from './parse.ts'
import { bindCond, bindEffects, newBindReport } from './bind.ts'
import { resolveVariable, resolveCharacter } from './resolve.ts'
import { normalizeVarName } from './names.ts'

export function choiceCond(choice: Choice, variables: Variable[]): CondNode | null {
  return choice.cond !== undefined ? choice.cond : bindCond(parseCond(choice.conditions), variables, newBindReport())
}

export function choiceEffects(choice: Choice, variables: Variable[]): EffectItem[] {
  return choice.effects ?? bindEffects(parseEffects(choice.variableEffects), variables, newBindReport())
}

/** 条件树里全部变量引用（cmp 节点的 ref），供校验 / 导出 / 覆盖率统计 */
export function collectCondRefs(node: CondNode | null, out: VarRef[] = []): VarRef[] {
  if (!node) return out
  if (node.k === 'cmp') out.push(node.ref)
  else if (node.k === 'and' || node.k === 'or') node.parts.forEach(p => collectCondRefs(p, out))
  return out
}

export function endingCond(ending: Ending, variables: Variable[]): CondNode | null {
  return ending.cond !== undefined ? ending.cond : bindCond(parseCond(ending.conditions), variables, newBindReport())
}

/**
 * 引用在变量状态表里的槽位键：绑定态用 varId；未绑定态先按当前变量表再解析一次（变量可能是绑定之后才登记的），
 * 仍解析不到则退回 `#归一化名`。同一变量的绑定/未绑定引用因此落到同一槽位（计划 V6）。
 */
export function refKey(ref: VarRef, variables: Variable[]): string {
  if (ref.varId) return ref.varId
  const r = resolveVariable(variables, ref.name)
  return r.kind === 'bound' ? r.item.id : `#${normalizeVarName(ref.name)}`
}

/** 展示名：绑定且变量仍在 → 变量当前名字（改名自动跟随）；绑定但变量已删 → 墓碑；未绑定 → 原文名 */
export function refLabel(ref: VarRef, variables: Variable[]): string {
  if (!ref.varId) return ref.name
  const v = variables.find(x => x.id === ref.varId)
  return v ? v.name : `已删除：${ref.name}`
}

/** 对白说话人展示名：speakerId 命中 → 角色当前名字；否则原文 speaker */
export function speakerLabel(line: DialogueLine, characters: Character[]): string {
  if (line.speakerId) {
    const c = characters.find(x => x.id === line.speakerId)
    if (c) return c.name
  }
  return line.speaker
}

/** 说话人是否已绑到现存角色（含「未绑定但现在能唯一解析」） */
export function speakerBound(line: DialogueLine, characters: Character[]): boolean {
  if (line.speakerId && characters.some(c => c.id === line.speakerId)) return true
  return !!line.speaker && resolveCharacter(characters, line.speaker).kind === 'bound'
}

/** 预览初始变量状态：按变量 id 建槽 */
export function initVarState(project: Pick<Project, 'variables'>): Record<string, string | number> {
  const init: Record<string, string | number> = {}
  for (const v of project.variables ?? []) init[v.id] = v.defaultValue ?? 0
  return init
}
