// 改名级联：变量与角色在全系统按**名字字符串**被引用（条件表达式、变量效果、结局条件、
// 系统功能读写表、对白说话人），schema 里没有 id 引用。此前改名只 patch 自身，所有旧引用
// 悬空——条件按未知变量 =0 静默求值、对白脱离角色，且无任何提示。
// 这里在 store 改名时把引用同步重写（字符串级止血）；根治要给引用加 id + 迁移，另立项。
import { splitEffects } from '@/lib/conditions'
import type { Project, StoryNode, Ending } from '@/lib/types/project'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 条件表达式里按标识符边界替换变量名（`trust>=3 && trusted==1` 只改 trust，不碰 trusted） */
function renameInExpr(expr: string, from: string, to: string): string {
  if (!expr) return expr
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(from)}(?=$|[^A-Za-z0-9_])`, 'g')
  return expr.replace(re, `$1${to}`)
}

/** variableEffects 逐段只改运算符前的名字：`+trust` / `trust+1` / `trust=x`，取值部分（`line=trust me`）不动 */
function renameInEffects(effects: string, from: string, to: string): string {
  if (!effects) return effects
  const re = new RegExp(`^(\\s*[+-]?\\s*)${escapeRe(from)}(?=\\s*(?:[+\\-=]|$))`)
  return splitEffects(effects).map(seg => seg.replace(re, `$1${to}`)).join(',')
}

/** 变量改名：返回引用被重写后的项目；没有任何引用被触碰时返回 null */
export function renameVariableRefs(project: Project, from: string, to: string): Project | null {
  if (!from || !to || from === to) return null
  let touched = false
  const mark = <T,>(before: T, after: T): T => { if (JSON.stringify(before) !== JSON.stringify(after)) touched = true; return after }

  const nodes: StoryNode[] = project.nodes.map(n => {
    const choices = n.choices.map(c => ({
      ...c,
      conditions: mark(c.conditions, renameInExpr(c.conditions ?? '', from, to)),
      variableEffects: mark(c.variableEffects, renameInEffects(c.variableEffects ?? '', from, to)),
    }))
    const sf = n.systemFunction
    const systemFunction = sf ? {
      ...sf,
      variablesRead: mark(sf.variablesRead, (sf.variablesRead ?? []).map(v => v === from ? to : v)),
      variablesWrite: mark(sf.variablesWrite, (sf.variablesWrite ?? []).map(v => v === from ? to : v)),
    } : sf
    return { ...n, choices, systemFunction }
  })
  const endings: Ending[] = project.endings.map(e => ({
    ...e,
    conditions: mark(e.conditions, renameInExpr(e.conditions ?? '', from, to)),
    variableConditions: mark(e.variableConditions, (e.variableConditions ?? []).map(vc => vc.variableName === from ? { ...vc, variableName: to } : vc)),
  }))
  return touched ? { ...project, nodes, endings } : null
}

/** 角色改名：dialogue.speaker 精确匹配的全部改写；没有任何对白被触碰时返回 null */
export function renameSpeakerRefs(project: Project, from: string, to: string): Project | null {
  if (!from || !to || from === to) return null
  let touched = false
  const nodes = project.nodes.map(n => {
    if (!(n.dialogue ?? []).some(l => l.speaker === from)) return n
    touched = true
    return { ...n, dialogue: n.dialogue.map(l => l.speaker === from ? { ...l, speaker: to } : l) }
  })
  return touched ? { ...project, nodes } : null
}
