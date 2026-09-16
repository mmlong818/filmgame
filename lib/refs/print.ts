// AST → 原文串投影。供 AI 通道与原文串回写；raw 原样吐回。
// 不变量：parseCond(printCond(parseCond(s))) 与 parseCond(s) 深等（test/refs.test.mjs 断言）。
import type { CondNode, EffectItem, VarRef } from './types.ts'

/** 展示名解析：调用方传入 id→当前名字的查找；未绑定或查不到则退回 ref.name */
export type NameOf = (ref: VarRef) => string
const byRefName: NameOf = ref => ref.name

interface PrintOpts {
  /** 字符串取值加双引号（Ink 需要 `mood == "calm"`；项目内原文约定不加） */
  quoteStrings?: boolean
  /** raw 子式的处理：原样吐回（默认）或丢弃（导出到 Ink 时无法编译的残片不能带出去） */
  dropRaw?: boolean
}

// 只有 dropRaw 时才丢空片段：默认模式必须保住空 raw，否则 `trust>=3 &&` 往返后会变成单个比较式
const keep = (parts: string[], opts: PrintOpts) => (opts.dropRaw ? parts.filter(Boolean) : parts)

export function printCond(node: CondNode | null, nameOf: NameOf = byRefName, opts: PrintOpts = {}): string {
  if (!node) return ''
  const rec = (p: CondNode) => printCond(p, nameOf, opts)
  switch (node.k) {
    case 'cmp': {
      const v = opts.quoteStrings && typeof node.value === 'string' ? `"${node.value.replace(/"/g, '”')}"` : node.value
      return `${nameOf(node.ref)} ${node.op} ${v}`
    }
    case 'and': return keep(node.parts.map(p => p.k === 'or' ? `(${rec(p)})` : rec(p)), opts).join(' && ')
    case 'or': return keep(node.parts.map(rec), opts).join(' || ')
    case 'raw': return opts.dropRaw ? '' : node.text
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
