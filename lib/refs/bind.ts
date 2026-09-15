// 引用层的唯一写入闸口（D1 不变量）：任何地方要产出 cond / effects / speakerId / readIds / writeIds / variableId，
// 都从这里走——原文串解析 + 名字→id 绑定一步完成，禁止调用方单独写其中一边。
// 期 1a 只做「解析 + 绑定」，不自动登记变量（AI 采纳链路的自动登记在期 1b 接入）。
import type { Project, Variable, Character, Choice, DialogueLine, Ending, EndingCondition, SystemFunction, StoryNode } from '../types/project.ts'
import type { CondNode, EffectItem, VarRef } from './types.ts'
import { parseCond, parseEffects } from './parse.ts'
import { resolveVariable, resolveCharacter } from './resolve.ts'

/** 一次绑定里没绑上的名字，供采纳面板 / 校验报告展示（去重后的原文名） */
export interface BindReport { unresolved: Set<string>; ambiguous: Set<string> }
export const newBindReport = (): BindReport => ({ unresolved: new Set(), ambiguous: new Set() })

function bindRef(ref: VarRef, variables: Variable[], report: BindReport): VarRef {
  const r = resolveVariable(variables, ref.name)
  if (r.kind === 'bound') return { varId: r.item.id, name: ref.name }
  ;(r.kind === 'ambiguous' ? report.ambiguous : report.unresolved).add(ref.name)
  return { name: ref.name }
}

export function bindCond(node: CondNode | null, variables: Variable[], report: BindReport): CondNode | null {
  if (!node) return null
  switch (node.k) {
    case 'cmp': return { ...node, ref: bindRef(node.ref, variables, report) }
    case 'and': return { k: 'and', parts: node.parts.map(p => bindCond(p, variables, report)!) }
    case 'or': return { k: 'or', parts: node.parts.map(p => bindCond(p, variables, report)!) }
    case 'raw': return node
  }
}

export function bindEffects(items: EffectItem[], variables: Variable[], report: BindReport): EffectItem[] {
  return items.map(it => it.k === 'raw' ? it : { ...it, ref: bindRef(it.ref, variables, report) })
}

/** 选项：conditions / variableEffects 原文串 → cond / effects */
export function bindChoiceRefs(choice: Choice, variables: Variable[], report: BindReport): Choice {
  return {
    ...choice,
    cond: bindCond(parseCond(choice.conditions), variables, report),
    effects: bindEffects(parseEffects(choice.variableEffects), variables, report),
  }
}

/** 对白：speaker 命中唯一角色才写 speakerId；未命中/歧义保持缺省（绝不自动创建角色，D2） */
export function bindDialogueRefs(line: DialogueLine, characters: Character[]): DialogueLine {
  const r = line.speaker ? resolveCharacter(characters, line.speaker) : null
  const { speakerId: _drop, ...rest } = line
  return r?.kind === 'bound' ? { ...rest, speakerId: r.item.id } : rest
}

/** 系统功能读写表：按名字绑到 id，只保留绑上的 */
export function bindSystemFunctionRefs(sf: SystemFunction, variables: Variable[], report: BindReport): SystemFunction {
  const ids = (names: string[]) => names
    .map(n => bindRef({ name: n }, variables, report).varId)
    .filter((id): id is string => !!id)
  return { ...sf, readIds: ids(sf.variablesRead ?? []), writeIds: ids(sf.variablesWrite ?? []) }
}

export function bindEndingRefs(ending: Ending, variables: Variable[], report: BindReport): Ending {
  const variableConditions = (ending.variableConditions ?? []).map((vc): EndingCondition => {
    const ref = bindRef({ name: vc.variableName }, variables, report)
    const { variableId: _drop, ...rest } = vc
    return ref.varId ? { ...rest, variableId: ref.varId } : rest
  })
  return { ...ending, cond: bindCond(parseCond(ending.conditions), variables, report), variableConditions }
}

export function bindNodeRefs(node: StoryNode, variables: Variable[], characters: Character[], report: BindReport): StoryNode {
  return {
    ...node,
    choices: (node.choices ?? []).map(c => bindChoiceRefs(c, variables, report)),
    dialogue: (node.dialogue ?? []).map(l => bindDialogueRefs(l, characters)),
    systemFunction: node.systemFunction ? bindSystemFunctionRefs(node.systemFunction, variables, report) : node.systemFunction,
  }
}

/** 整档重绑（迁移 1→2 用）：只加/刷新引用层字段，任何原文串一个字节不动 */
export function bindProjectRefs(project: Project): { project: Project; report: BindReport } {
  const report = newBindReport()
  const variables = project.variables ?? []
  const characters = project.characters ?? []
  return {
    project: {
      ...project,
      nodes: (project.nodes ?? []).map(n => bindNodeRefs(n, variables, characters, report)),
      endings: (project.endings ?? []).map(e => bindEndingRefs(e, variables, report)),
    },
    report,
  }
}
