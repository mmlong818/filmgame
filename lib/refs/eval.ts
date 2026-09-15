// 直接对 AST 求值 / 应用效果。语义与 lib/conditions 的串版逐条对齐：
// raw 子式不参与判定（返回 null）；and/or 只对能判定的子式取 every/some；全都判不了 → null → 调用方按恒真。
// state 的键由 keyOf 决定：期 1 沿用变量名，期 2 切到 varId（见计划 2.1）。
import { compareValues } from '../conditions.ts'
import type { CondNode, EffectItem, VarRef } from './types.ts'

type VarState = Record<string, string | number>
export type KeyOf = (ref: VarRef) => string
const byName: KeyOf = ref => ref.name

export function evalCond(node: CondNode | null, state: VarState, keyOf: KeyOf = byName): boolean | null {
  if (!node) return null
  switch (node.k) {
    case 'cmp': return compareValues(state[keyOf(node.ref)], node.op, node.value)
    case 'and': {
      const rs = node.parts.map(p => evalCond(p, state, keyOf)).filter((r): r is boolean => r !== null)
      return rs.length === 0 ? null : rs.every(Boolean)
    }
    case 'or': {
      const rs = node.parts.map(p => evalCond(p, state, keyOf)).filter((r): r is boolean => r !== null)
      return rs.length === 0 ? null : rs.some(Boolean)
    }
    case 'raw': return null
  }
}

/** 与 evalConditions 同语义：空条件或不可判定 → true（不坏档） */
export function evalCondOrTrue(node: CondNode | null, state: VarState, keyOf: KeyOf = byName): boolean {
  const r = evalCond(node, state, keyOf)
  return r === null ? true : r
}

/** 与 applyVariableEffect 同语义；不修改入参 */
export function applyEffects(state: VarState, items: EffectItem[], keyOf: KeyOf = byName): VarState {
  const next = { ...state }
  for (const it of items) {
    if (it.k === 'raw') continue
    const key = keyOf(it.ref)
    if (it.kind === 'set') { next[key] = it.value; continue }
    const cur = typeof next[key] === 'number' ? next[key] as number : (Number(next[key]) || 0)
    next[key] = it.kind === 'inc' ? cur + (it.value as number) : cur - (it.value as number)
  }
  return next
}
