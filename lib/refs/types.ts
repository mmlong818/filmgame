// 变量/角色引用的结构化形态（docs/plans/2026-09-16-id-refs.md D1）。
// AST 是机器真源（求值 / 数值分析 / Ink 导出只读它）；原文串是人机通道与「未解析态」载体。
// 全部字段 optional 挂在 Choice / DialogueLine / Ending / SystemFunction 上，纯附加。
import type { CompareOp } from '../conditions.ts'

export type { CompareOp }

/** 变量引用：绑定态带 varId；name 始终存在——既是未绑定态的值，也是悬空时的墓碑标签 */
export interface VarRef { varId?: string; name: string }

export type CondNode =
  | { k: 'cmp'; ref: VarRef; op: CompareOp; value: string | number }
  | { k: 'and'; parts: CondNode[] }
  | { k: 'or'; parts: CondNode[] }
  /** 子式/整段无法解析，原文保留（承载 `AND`、自然语言等）；求值时不参与判定 */
  | { k: 'raw'; text: string }

export type EffectItem =
  | { k: 'eff'; ref: VarRef; kind: 'inc' | 'dec' | 'set'; value: string | number }
  | { k: 'raw'; text: string }
