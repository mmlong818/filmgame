// Ink（Inkle 叙事脚本）导出的纯函数部分：只产出源码字符串，不碰 DOM——persistence.exportInk 负责下载，
// 这样 node:test 能直接断言导出内容。
//
// 变量走引用层（期 2）：Ink 标识符按 refKey（varId / #名）键化并去重——此前按名字缓存，两个同名变量
// 会共享同一个 Ink 标识符、在 Ink 里合并成一个；现在 trust(id=A) → trust、trust(id=B) → trust_2。
// 说话人走 speakerLabel：角色改名后导出自动跟随。
import type { Project, Variable, Choice } from '../types/project.ts'
import type { VarRef, EffectItem } from '../refs/types.ts'
import { choiceCond, choiceEffects, refKey, refLabel, speakerLabel, collectCondRefs } from '../refs/access.ts'
import { printCond } from '../refs/print.ts'

/** 字符串取值里的 " 会提前闭合 Ink 字面量、换行会截断；不依赖 Ink 转义规则，换中文引号 / 折空格 */
const inkStr = (s: string): string => `"${s.replace(/"/g, '”').replace(/\r?\n/g, ' ')}"`

/** 任意名字 → 合法 Ink 标识符（字母/下划线开头，仅字母数字下划线）；全非法字符时退回 var_<hash> */
function sanitizeIdent(name: string): string {
  const direct = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const base = /^[0-9]/.test(direct) ? `var_${direct}` : direct
  if (!base || base.replace(/_/g, '') === '') {
    const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    return `var_${hash}`
  }
  return base
}

/** 按 refKey 缓存 + 已用名去重的 Ink 变量名分配器 */
function makeVarNamer(variables: Variable[]) {
  const byKey = new Map<string, string>()
  const used = new Set<string>()
  return (ref: VarRef): string => {
    const key = refKey(ref, variables)
    const cached = byKey.get(key)
    if (cached) return cached
    const base = sanitizeIdent(refLabel(ref, variables))
    let candidate = base
    for (let i = 2; used.has(candidate); i++) candidate = `${base}_${i}`
    used.add(candidate)
    byKey.set(key, candidate)
    return candidate
  }
}

/** 节点 id（nanoid 含 - 与 _，且可能数字开头）→ 合法 knot 名；声明与所有 divert 目标共用同一份映射 */
function makeKnotNamer() {
  const cache = new Map<string, string>()
  const used = new Set<string>()
  return (id: string): string => {
    const cached = cache.get(id)
    if (cached) return cached
    const base = `n_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
    let candidate = base
    for (let i = 1; used.has(candidate); i++) candidate = `${base}_${i}`
    used.add(candidate)
    cache.set(id, candidate)
    return candidate
  }
}

function effectLines(items: EffectItem[], nameOf: (ref: VarRef) => string): string[] {
  return items.flatMap(it => {
    if (it.k === 'raw') return []
    const name = nameOf(it.ref)
    if (it.kind === 'set') return [`~ ${name} = ${typeof it.value === 'number' ? it.value : inkStr(String(it.value))}`]
    return [`~ ${name} = ${name} ${it.kind === 'inc' ? '+' : '-'} ${it.value}`]
  })
}

/** VAR 声明：登记变量按 id 产出；正文里引用到但未登记的按引用补齐——Ink 引用未声明变量是编译错误 */
function declareVars(project: Project, nameOf: (ref: VarRef) => string): { decls: string[]; mappings: string[] } {
  const variables = project.variables ?? []
  const declared = new Map<string, string>()
  const mappings: string[] = []
  for (const v of variables) {
    const name = nameOf({ varId: v.id, name: v.name })
    if (name !== v.name) mappings.push(`// 变量映射: ${name} = "${v.name}"`)
    declared.set(name, isNaN(Number(v.defaultValue)) ? inkStr(v.defaultValue) : v.defaultValue)
  }
  for (const node of project.nodes ?? []) {
    for (const c of node.choices ?? []) {
      for (const it of choiceEffects(c, variables)) {
        if (it.k !== 'eff') continue
        const name = nameOf(it.ref)
        if (declared.has(name)) continue
        declared.set(name, it.kind === 'set' && typeof it.value === 'string' ? inkStr(it.value) : '0')
        mappings.push(`// 未登记变量，导出时按引用补齐: ${name}`)
      }
      for (const ref of collectCondRefs(choiceCond(c, variables))) {
        const name = nameOf(ref)
        if (declared.has(name)) continue
        declared.set(name, '0')
        mappings.push(`// 未登记变量，导出时按引用补齐: ${name}`)
      }
    }
  }
  return { decls: [...declared].map(([n, v]) => `VAR ${n} = ${v}`), mappings }
}

function choiceBlock(choice: Choice, project: Project, nameOf: (ref: VarRef) => string, knot: (id: string) => string, nodeIds: Set<string>): string[] {
  const variables = project.variables ?? []
  const target = nodeIds.has(choice.targetNodeId) ? knot(choice.targetNodeId) : 'END'
  const cond = printCond(choiceCond(choice, variables), nameOf, { quoteStrings: true, dropRaw: true })
  const effects = effectLines(choiceEffects(choice, variables), nameOf)
  if (cond) return [`{ ${cond}:`, `  + [${choice.text}]`, ...effects.map(l => `    ${l}`), `    -> ${target}`, `}`]
  return [`+ [${choice.text}]`, ...effects.map(l => `  ${l}`), `  -> ${target}`]
}

export function buildInkSource(project: Project): string {
  const lines: string[] = [`// ${project.title}`, `// 由 filmgame 导出 · ${new Date().toLocaleDateString('zh-CN')}`, '']
  const variables = project.variables ?? []
  const characters = project.characters ?? []
  const nameOf = makeVarNamer(variables)
  const knot = makeKnotNamer()
  const nodeIds = new Set((project.nodes ?? []).map(n => n.id))

  const { decls, mappings } = declareVars(project, nameOf)
  if (mappings.length) lines.push(...mappings, '')
  if (decls.length) lines.push(...decls, '')

  const startNode = project.nodes.find(n => n.type === 'start') ?? project.nodes[0]
  if (startNode) lines.push(`-> ${knot(startNode.id)}`)
  lines.push('')

  for (const node of project.nodes) {
    lines.push(`=== ${knot(node.id)} ===`)
    if (node.title) lines.push(`// ${node.title}`)
    if (node.sceneDesc) lines.push(`// [场景] ${node.sceneDesc}`)
    for (const line of node.dialogue ?? []) {
      const who = speakerLabel(line, characters)
      if (who && line.text) lines.push(`${who}: ${line.text}`)
      else if (line.text) lines.push(line.text)
    }
    if (node.type === 'ending') {
      const ending = project.endings.find(e => e.nodeId === node.id)
      if (ending) lines.push(`// [结局: ${ending.title}] ${ending.description}`)
      lines.push('-> END')
    } else if (node.choices.length === 0) {
      // 探索节点没有自己的选项，靠 exploreReturnNodeId 回主线；与预览「返回故事主线」一致
      const back = node.exploreReturnNodeId && nodeIds.has(node.exploreReturnNodeId) ? knot(node.exploreReturnNodeId) : 'END'
      lines.push(`-> ${back}`)
    } else if (node.choices.length === 1 && node.type !== 'branch') {
      const c = node.choices[0]
      lines.push(...effectLines(choiceEffects(c, variables), nameOf))
      lines.push(`-> ${nodeIds.has(c.targetNodeId) ? knot(c.targetNodeId) : 'END'}`)
    } else {
      for (const c of node.choices) lines.push(...choiceBlock(c, project, nameOf, knot, nodeIds))
    }
    lines.push('')
  }
  return lines.join('\n')
}
