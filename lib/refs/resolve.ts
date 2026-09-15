// 名字 → 条目的解析（D2）：精确命中唯一 → 绑定；归一化后唯一 → 绑定；>1 → 歧义不猜；0 → 未解析。
import type { Variable, Character } from '../types/project.ts'
import { normalizeVarName, normalizeCharName } from './names.ts'

interface Named { id: string; name: string }

export type Resolution<T extends Named> =
  | { kind: 'bound'; item: T }
  | { kind: 'ambiguous'; items: T[] }
  | { kind: 'unresolved' }

export function resolveByName<T extends Named>(items: T[], raw: string, normalize: (s: string) => string): Resolution<T> {
  const exact = items.filter(x => x.name === raw)
  if (exact.length === 1) return { kind: 'bound', item: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', items: exact }
  const key = normalize(raw)
  const near = items.filter(x => normalize(x.name) === key)
  if (near.length === 1) return { kind: 'bound', item: near[0] }
  if (near.length > 1) return { kind: 'ambiguous', items: near }
  return { kind: 'unresolved' }
}

export const resolveVariable = (variables: Variable[], raw: string) => resolveByName(variables, raw, normalizeVarName)
export const resolveCharacter = (characters: Character[], raw: string) => resolveByName(characters, raw, normalizeCharName)
