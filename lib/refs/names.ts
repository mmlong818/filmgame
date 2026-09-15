// 变量名 / 角色名的归一化、去重与「按名字对账保留 id」。
// 这是引用 id 化（docs/plans/2026-09-16-id-refs.md）的期 0 基础件：
// 1) 名字在项目内唯一，迁移时名字→id 的解析才是确定的；
// 2) AI 批量覆盖（setVariables / setCharacters）不再整表换新 id，否则全项目引用一次性悬空。
// 只用相对导入、不依赖 store，保证 node:test 可直接加载。

/** 变量名：NFKC、trim、折叠空白、ASCII 大小写不敏感（条件表达式的标识符正则本就限 ASCII） */
export function normalizeVarName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 角色名：NFKC、trim、折叠空白、去标点符号（「无名来电者（'M'）」与「无名来电者（M）」归一到一起） */
export function normalizeCharName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '')
}

/**
 * 在 taken（已归一化的名字集合）里找一个不冲突的名字：`name` → `name_2` → `name_3` …
 * 不硬拒绝、不静默允许重名；调用方负责把返回值的归一化形式加进 taken。
 */
export function uniqueName(name: string, taken: Set<string>, normalize: (s: string) => string, sep = '_'): string {
  if (!taken.has(normalize(name))) return name
  for (let i = 2; ; i++) {
    const candidate = `${name}${sep}${i}`
    if (!taken.has(normalize(candidate))) return candidate
  }
}

interface Named { id: string; name: string }
type Incoming<T extends Named> = Omit<T, 'id'> & { id?: string }

/**
 * 用一份新清单整体替换旧清单，但按归一化名字对账：同名者沿用旧 id（只覆盖内容字段），
 * 真正新增的才分配新 id，清单内重名按 uniqueName 加后缀。旧清单里未出现在新清单的条目被移除（替换语义）。
 */
export function reconcileByName<T extends Named>(
  existing: T[],
  incoming: Incoming<T>[],
  normalize: (s: string) => string,
  newId: () => string,
  sep = '_',
): T[] {
  const existingByName = new Map(existing.map(x => [normalize(x.name), x]))
  const used = new Set<string>()
  return incoming.map(item => {
    const name = uniqueName(item.name, used, normalize, sep)
    used.add(normalize(name))
    const id = existingByName.get(normalize(name))?.id ?? item.id ?? newId()
    return { ...item, id, name } as T
  })
}
