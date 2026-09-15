// hydrateProject 对账窗口内（乐观 paint 之后、GET 返回之前）、离线兜底期间以及二次对账
// （409 后「加载最新」）时，store 里可能存在未落库的本地编辑——不能让 DB 副本无条件覆盖，
// 否则这些输入会无声消失且无处可恢复。这里做字段级合并：以最后一次服务端对齐快照
// （paintBase）为基线，找出 current 相对基线真正被用户改过的顶层字段（带 id 的数组精确到
// 单个条目的改/增/删），只把这些字段叠加到 DB 副本上；其余字段一律以 DB 为准。
// 相对导入带 .ts：纯函数，node:test 直接加载（别名 @/ 在 Node ESM 下不可解析）
import { PROJECT_ID_ARRAY_KEYS } from '../types/project.ts'
import type { Project } from '../types/project.ts'

const MERGE_SKIP_KEYS = new Set<string>(['id', 'createdAt', 'updatedAt', 'schemaVersion'])
// 逐条目合并的数组字段（PROJECT_ID_ARRAY_KEYS）。此前只有 nodes 这样做，其余数组只要本地与
// 基线不同就整表覆盖 DB——多标签页下 A 新增的角色会被 B 的整表覆盖静默丢掉。
const ID_ARRAY_KEYS = PROJECT_ID_ARRAY_KEYS

interface WithId { id: string }

/** 三方按 id 合并：DB 为主干，叠加本地相对基线的改/增，剔除本地相对基线的删。返回 null 表示本地无改动。 */
function mergeById<T extends WithId>(db: T[], base: T[], current: T[]): T[] | null {
  const baseById = new Map(base.map(x => [x.id, x]))
  const currentIds = new Set(current.map(x => x.id))
  const edited = new Map<string, T>()
  for (const item of current) {
    const b = baseById.get(item.id)
    if (!b || JSON.stringify(item) !== JSON.stringify(b)) edited.set(item.id, item)
  }
  const locallyDeleted = new Set([...baseById.keys()].filter(id => !currentIds.has(id)))
  if (edited.size === 0 && locallyDeleted.size === 0) return null
  const dbIds = new Set(db.map(x => x.id))
  return [
    ...db.filter(x => !locallyDeleted.has(x.id)).map(x => edited.get(x.id) ?? x),
    // 只有「基线里也没有」的才是本地新增；基线有、DB 没有 = 远端已删，本地编辑不得把它复活成孤儿
    ...[...edited.values()].filter(x => !dbIds.has(x.id) && !baseById.has(x.id)),
  ]
}

export function mergeWindowEdits(
  dbProject: Project,
  base: Project | null,
  current: Project | null,
): { project: Project; changed: boolean } {
  if (!base || !current || current === base || current.id !== dbProject.id || base.id !== dbProject.id) {
    return { project: dbProject, changed: false }
  }
  const merged: Project = { ...dbProject }
  const out = merged as unknown as Record<string, unknown>
  let changed = false
  for (const key of Object.keys(current) as (keyof Project)[]) {
    if (MERGE_SKIP_KEYS.has(key) || (ID_ARRAY_KEYS as readonly string[]).includes(key)) continue
    if (JSON.stringify(current[key]) !== JSON.stringify(base[key])) {
      out[key] = current[key]
      changed = true
    }
  }
  for (const key of ID_ARRAY_KEYS) {
    const result = mergeById<WithId>(dbProject[key] ?? [], base[key] ?? [], current[key] ?? [])
    if (result) { out[key] = result; changed = true }
  }
  return { project: merged, changed }
}
