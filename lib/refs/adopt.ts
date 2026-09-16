// 「认领」未绑定引用（期 3，取代字符串级改名级联 lib/store/rename.ts）：
// 改名之前，把所有此刻能按名字唯一解析到某个变量/角色的未绑定引用先绑上 id——之后改名只动名字表，
// 引用经 refLabel / speakerLabel 自动跟随；原文串一个字节不动，因此 id 层仍可从串重建（回滚安全）。
// 顺带也把「变量是绑定之后才登记的」这类历史遗留未绑定引用一并收拢。
import type { Project, Choice, Ending, StoryNode } from '../types/project.ts'
import type { CondNode, EffectItem } from './types.ts'
import { choiceCond, choiceEffects, endingCond } from './access.ts'
import { resolveVariable, resolveCharacter } from './resolve.ts'

type Vars = Project['variables']
type Chars = Project['characters']

function adoptCond(node: CondNode | null, variables: Vars): { node: CondNode | null; changed: boolean } {
  if (!node) return { node, changed: false }
  if (node.k === 'cmp') {
    if (node.ref.varId) return { node, changed: false }
    const r = resolveVariable(variables, node.ref.name)
    return r.kind === 'bound' ? { node: { ...node, ref: { ...node.ref, varId: r.item.id } }, changed: true } : { node, changed: false }
  }
  if (node.k === 'raw') return { node, changed: false }
  let changed = false
  const parts = node.parts.map(p => { const a = adoptCond(p, variables); changed ||= a.changed; return a.node! })
  return { node: changed ? { ...node, parts } : node, changed }
}

function adoptEffects(items: EffectItem[], variables: Vars): { items: EffectItem[]; changed: boolean } {
  let changed = false
  const out = items.map(it => {
    if (it.k !== 'eff' || it.ref.varId) return it
    const r = resolveVariable(variables, it.ref.name)
    if (r.kind !== 'bound') return it
    changed = true
    return { ...it, ref: { ...it.ref, varId: r.item.id } }
  })
  return { items: out, changed }
}

function adoptChoice(c: Choice, variables: Vars): Choice | null {
  const cond = adoptCond(choiceCond(c, variables), variables)
  const eff = adoptEffects(choiceEffects(c, variables), variables)
  const missing = c.cond === undefined || c.effects === undefined
  return cond.changed || eff.changed || missing ? { ...c, cond: cond.node, effects: eff.items } : null
}

function adoptEnding(e: Ending, variables: Vars): Ending | null {
  const cond = adoptCond(endingCond(e, variables), variables)
  let changed = cond.changed || e.cond === undefined
  const variableConditions = (e.variableConditions ?? []).map(vc => {
    if (vc.variableId) return vc
    const r = resolveVariable(variables, vc.variableName)
    if (r.kind !== 'bound') return vc
    changed = true
    return { ...vc, variableId: r.item.id }
  })
  return changed ? { ...e, cond: cond.node, variableConditions } : null
}

/** 变量侧：所有此刻能唯一解析的未绑定引用绑上 varId。无变化返回 null */
export function adoptUnboundVariableRefs(project: Project): Project | null {
  const variables = project.variables ?? []
  let changed = false
  const nodes = project.nodes.map((n): StoryNode => {
    let nodeChanged = false
    const choices = n.choices.map(c => { const a = adoptChoice(c, variables); if (a) nodeChanged = true; return a ?? c })
    if (!nodeChanged) return n
    changed = true
    return { ...n, choices }
  })
  const endings = project.endings.map(e => { const a = adoptEnding(e, variables); if (a) changed = true; return a ?? e })
  return changed ? { ...project, nodes, endings } : null
}

/** 角色侧：speaker 能唯一解析到角色的未绑定对白绑上 speakerId。无变化返回 null */
export function adoptUnboundSpeakers(project: Project): Project | null {
  const characters: Chars = project.characters ?? []
  const ids = new Set(characters.map(c => c.id))
  let changed = false
  const nodes = project.nodes.map(n => {
    let nodeChanged = false
    const dialogue = (n.dialogue ?? []).map(l => {
      if (!l.speaker || (l.speakerId && ids.has(l.speakerId))) return l
      const r = resolveCharacter(characters, l.speaker)
      if (r.kind !== 'bound') return l
      nodeChanged = true
      return { ...l, speakerId: r.item.id }
    })
    if (!nodeChanged) return n
    changed = true
    return { ...n, dialogue }
  })
  return changed ? { ...project, nodes } : null
}
