/**
 * conditions.ts — 选项条件求值器
 * 格式：`varName op value`，可用 && / || 连接并用括号分组（&& 优先级高于 ||）
 * op: >= <= > < == !=
 * 若条件为空或无法解析，运行时返回 true（始终显示，兼容旧数据不坏档）；
 * 语法问题由 lintConditions 暴露给校验引擎报 WARNING，不再静默。
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

/** 在括号深度 0 处按 op 切分；括号不平衡返回 null（交给调用方判定为语法错误）。 */
function splitTopLevel(expr: string, op: '&&' | '||'): string[] | null {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth < 0) return null }
    else if (depth === 0 && expr.startsWith(op, i)) {
      parts.push(expr.slice(start, i))
      i += 1
      start = i + 1
    }
  }
  if (depth !== 0) return null
  parts.push(expr.slice(start))
  return parts
}

/** 递归下降求值：|| 最低优先级 → && → 括号/比较式。无法解析的子式返回 null（不参与判定）。 */
function evalExpr(expr: string, state: VarState): boolean | null {
  const trimmed = expr.trim()
  if (!trimmed) return null

  const orParts = splitTopLevel(trimmed, '||')
  if (!orParts) return null
  if (orParts.length > 1) {
    const results = orParts.map(p => evalExpr(p, state)).filter((r): r is boolean => r !== null)
    return results.length === 0 ? null : results.some(Boolean)
  }

  const andParts = splitTopLevel(trimmed, '&&')
  if (!andParts) return null
  if (andParts.length > 1) {
    const results = andParts.map(p => evalExpr(p, state)).filter((r): r is boolean => r !== null)
    return results.length === 0 ? null : results.every(Boolean)
  }

  // 整体被一对括号包住 → 剥掉再求值（'(a) && (b)' 不会走到这里，已在上面按深度切开）
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1)
    if (splitTopLevel(inner, '&&') !== null) return evalExpr(inner, state)
    return null
  }
  return evalSingle(trimmed, state)
}

export function evalConditions(conditions: string, state: VarState): boolean {
  if (!conditions || !conditions.trim()) return true
  const r = evalExpr(conditions, state)
  return r === null ? true : r  // unparseable → always show
}

/**
 * 静态检查条件表达式，供校验引擎使用。返回问题描述，无问题返回 null。
 * 求值器对无法解析的式子按"恒真"处理以免坏档，作者因此看不到自己写错——
 * 这里把语法错误显式暴露出来（括号不平衡、子式不符合 `varName op value`）。
 */
export function lintConditions(conditions: string): string | null {
  const expr = (conditions ?? '').trim()
  if (!expr) return null
  let depth = 0
  for (const c of expr) {
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth < 0) return '括号不匹配' }
  }
  if (depth !== 0) return '括号不匹配'

  const bad: string[] = []
  function walk(part: string) {
    const t = part.trim()
    if (!t) { bad.push('（空子式）'); return }
    const or = splitTopLevel(t, '||')!
    if (or.length > 1) { or.forEach(walk); return }
    const and = splitTopLevel(t, '&&')!
    if (and.length > 1) { and.forEach(walk); return }
    if (t.startsWith('(') && t.endsWith(')')) { walk(t.slice(1, -1)); return }
    if (evalSingle(t, {}) === null) bad.push(t)
  }
  walk(expr)
  return bad.length > 0 ? `无法解析的子式：${bad.join('、')}` : null
}

/** 提取条件表达式里引用的全部变量名（供校验引擎检查未定义变量）。 */
export function extractConditionVars(conditions: string): string[] {
  const expr = (conditions ?? '').trim()
  if (!expr) return []
  const names = new Set<string>()
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:>=|<=|>|<|==|!=)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(expr)) !== null) names.add(m[1])
  return [...names]
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

// Ink 用法：{ varName >= value: -> target | -> other }，这里只产出条件表达式部分。
// 与 evalConditions 同构地递归下降，保留括号与 &&/|| 的原有结构——此前只切单层 &&，
// 带括号或 || 的条件在导出时被整体丢成空串，Ink 里退化成无条件选项。
export function conditionsToInk(conditions: string): string {
  const expr = (conditions ?? '').trim()
  if (!expr) return ''
  const inkVarName = (n: string) => n.replace(/[^a-zA-Z0-9_]/g, '_')

  function build(part: string): string {
    const t = part.trim()
    if (!t) return ''
    const or = splitTopLevel(t, '||')
    if (!or) return ''
    if (or.length > 1) {
      const seg = or.map(build).filter(Boolean)
      return seg.length > 1 ? `(${seg.join(' || ')})` : (seg[0] ?? '')
    }
    const and = splitTopLevel(t, '&&')!
    if (and.length > 1) {
      const seg = and.map(build).filter(Boolean)
      return seg.length > 1 ? seg.join(' && ') : (seg[0] ?? '')
    }
    if (t.startsWith('(') && t.endsWith(')')) {
      // 内层若已是 || 组（自带括号）则不再套一层，避免 ((a || b))
      const inner = build(t.slice(1, -1))
      if (!inner) return ''
      return inner.startsWith('(') && inner.endsWith(')') ? inner : `(${inner})`
    }
    const m = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/)
    return m ? `${inkVarName(m[1])} ${m[2]} ${m[3].trim()}` : ''
  }
  return build(expr)
}
