/**
 * conditions.ts — 选项条件求值器
 * 格式：`varName op value` 用 && 或 || 连接
 * op: >= <= > < == !=
 * 若条件为空或无法解析，返回 true（始终显示）
 */

type VarState = Record<string, string | number>

function evalSingle(expr: string, state: VarState): boolean | null {
  const m = expr.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/)
  if (!m) return null
  const [, name, op, raw] = m
  const lhs = state[name] ?? 0
  const rhs = isNaN(Number(raw)) ? raw.replace(/^["']|["']$/g, '') : Number(raw)
  const l = typeof lhs === 'number' ? lhs : (isNaN(Number(lhs)) ? lhs : Number(lhs))
  const r = rhs
  switch (op) {
    case '>=': return (l as number) >= (r as number)
    case '<=': return (l as number) <= (r as number)
    case '>':  return (l as number) > (r as number)
    case '<':  return (l as number) < (r as number)
    case '==': return String(l) === String(r)
    case '!=': return String(l) !== String(r)
  }
  return null
}

export function evalConditions(conditions: string, state: VarState): boolean {
  if (!conditions || !conditions.trim()) return true
  // Try && (AND) first, then || (OR)
  if (conditions.includes('&&')) {
    return conditions.split('&&').every(part => {
      const r = evalSingle(part, state)
      return r === null ? true : r
    })
  }
  if (conditions.includes('||')) {
    return conditions.split('||').some(part => {
      const r = evalSingle(part, state)
      return r === null ? true : r
    })
  }
  const r = evalSingle(conditions, state)
  return r === null ? true : r  // unparseable → always show
}

export function conditionsToInk(conditions: string): string {
  if (!conditions || !conditions.trim()) return ''
  // Convert varName op value to ink syntax
  // Ink uses: { varName >= value: -> target | -> other }
  // We return the condition expression part only
  const inkVarName = (n: string) => n.replace(/[^a-zA-Z0-9_]/g, '_')
  if (conditions.includes('&&')) {
    return conditions.split('&&').map(p => {
      const m = p.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/)
      if (!m) return ''
      return `${inkVarName(m[1])} ${m[2]} ${m[3].trim()}`
    }).filter(Boolean).join(' && ')
  }
  const m = conditions.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/)
  if (!m) return ''
  return `${inkVarName(m[1])} ${m[2]} ${m[3].trim()}`
}
