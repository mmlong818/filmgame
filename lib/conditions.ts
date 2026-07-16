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

// ─── 选项变量效果（variableEffects）解析 ──────────────────────────────────
// 两种并存的书写约定：
//   1) 前缀简写 "+name" / "-name"：来自工坊「节点选择」区变量快捷按钮（固定 ±1）
//   2) 后缀写法 "name+N" / "name-N" / "name=value"：来自 AI 分支生成（见
//      lib/ai/prompts.ts 'branches:generate' 的提示词，明确要求"trust+1""betrayed=true"）
// 此前 preview 的 applyVariableEffect 与 persistence 的 applyInkEffects 只认前缀简写，
// 对占实际数据绝大多数的后缀写法（AI 生成的全部 89 个选项）完全不识别、静默丢弃——
// 玩家在预览里选完分支，变量数值原地不动，门控条件永远无法达成。这里统一解析两种约定，
// 供 preview 与 ink 导出共用，避免逻辑分叉再次漂移。
export interface ParsedEffect {
  name: string
  kind: 'inc' | 'dec' | 'set'
  value: number | string
}

export function parseEffectPart(part: string): ParsedEffect | null {
  const p = part.trim()
  if (!p) return null
  if (p.startsWith('+')) return { name: p.slice(1).trim(), kind: 'inc', value: 1 }
  if (p.startsWith('-') && !p.includes('=')) return { name: p.slice(1).trim(), kind: 'dec', value: 1 }
  const suffixMatch = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([+-])\s*(\d+)$/)
  if (suffixMatch) {
    const [, name, sign, num] = suffixMatch
    return { name, kind: sign === '+' ? 'inc' : 'dec', value: Number(num) }
  }
  if (p.includes('=')) {
    const eq = p.indexOf('=')
    const name = p.slice(0, eq).trim()
    const val = p.slice(eq + 1).trim()
    return { name, kind: 'set', value: isNaN(Number(val)) ? val : Number(val) }
  }
  return null
}

/** 预览播放时把一次选项的 variableEffects 应用到当前变量状态，返回新状态（不修改入参）。 */
export function applyVariableEffect(state: Record<string, string | number>, effect: string): Record<string, string | number> {
  if (!effect || !effect.trim()) return state
  const next = { ...state }
  for (const part of effect.split(',')) {
    const parsed = parseEffectPart(part)
    if (!parsed) continue
    const { name, kind, value } = parsed
    if (kind === 'set') {
      next[name] = value
    } else {
      const current = typeof next[name] === 'number' ? next[name] as number : (Number(next[name]) || 0)
      next[name] = kind === 'inc' ? current + (value as number) : current - (value as number)
    }
  }
  return next
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
