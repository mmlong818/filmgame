// 原文串 → AST。切分与比较式口径完全复用 lib/conditions（splitTopLevel / parseComparison /
// splitEffects / parseEffectPart），不另写一套：两处若各自演化，同一条件会在预览与校验里判定不同。
import { splitTopLevel, parseComparison, splitEffects, parseEffectPart } from '../conditions.ts'
import type { CondNode, EffectItem } from './types.ts'

const raw = (text: string): CondNode => ({ k: 'raw', text })

function parseExpr(text: string): CondNode {
  const t = text.trim()
  if (!t) return raw(t)
  const or = splitTopLevel(t, '||')
  if (!or) return raw(t)
  if (or.length > 1) return { k: 'or', parts: or.map(parseExpr) }
  const and = splitTopLevel(t, '&&')
  if (!and) return raw(t)
  if (and.length > 1) return { k: 'and', parts: and.map(parseExpr) }
  // 整体被一对括号包住 → 剥掉；'(a) && (b)' 不会走到这里（已按深度切开）
  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = t.slice(1, -1)
    return splitTopLevel(inner, '&&') !== null ? parseExpr(inner) : raw(t)
  }
  const cmp = parseComparison(t)
  return cmp ? { k: 'cmp', ref: { name: cmp.name }, op: cmp.op, value: cmp.value } : raw(t)
}

/** 空串 → null（无条件）；其余总能得到一棵树，不可解析处落 raw */
export function parseCond(text: string | undefined | null): CondNode | null {
  const t = (text ?? '').trim()
  return t ? parseExpr(t) : null
}

/** 空片段丢弃；两种书写约定（`+name` / `name+1` / `name=v`）都认，认不出的落 raw */
export function parseEffects(text: string | undefined | null): EffectItem[] {
  const out: EffectItem[] = []
  for (const seg of splitEffects(text ?? '')) {
    const t = seg.trim()
    if (!t) continue
    const p = parseEffectPart(t)
    out.push(p ? { k: 'eff', ref: { name: p.name }, kind: p.kind, value: p.value } : { k: 'raw', text: t })
  }
  return out
}
