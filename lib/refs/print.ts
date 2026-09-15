// AST → 原文串投影。供 AI 通道与原文串回写；raw 原样吐回。
// 不变量：parseCond(printCond(parseCond(s))) 与 parseCond(s) 深等（test/refs.test.mjs 断言）。
import type { CondNode, EffectItem, VarRef } from './types.ts'

/** 展示名解析：调用方传入 id→当前名字的查找；未绑定或查不到则退回 ref.name */
export type NameOf = (ref: VarRef) => string
const byRefName: NameOf = ref => ref.name

export function printCond(node: CondNode | null, nameOf: NameOf = byRefName): string {
  if (!node) return ''
  switch (node.k) {
    case 'cmp': return `${nameOf(node.ref)} ${node.op} ${node.value}`
    case 'and': return node.parts.map(p => p.k === 'or' ? `(${printCond(p, nameOf)})` : printCond(p, nameOf)).join(' && ')
    case 'or': return node.parts.map(p => printCond(p, nameOf)).join(' || ')
    case 'raw': return node.text
  }
}

export function printEffects(items: EffectItem[], nameOf: NameOf = byRefName): string {
  return items.map(it => {
    if (it.k === 'raw') return it.text
    const name = nameOf(it.ref)
    if (it.kind === 'set') return `${name}=${it.value}`
    return `${name}${it.kind === 'inc' ? '+' : '-'}${it.value}`
  }).join(', ')
}
