// schemaVersion 迁移链：文档级迁移，与 lib/db/schema.ts 的物理表迁移（drizzle-kit）正交。
// - normalizeLegacy：把早期 localStorage 导出的“形状不全”文档补齐到可被 ProjectSchema 解析的最小形态。
// - MIGRATIONS：按 schemaVersion 顺序注册的纯函数迁移（1→2：变量/角色引用层，见 lib/refs）。
// - migrateProject：normalizeLegacy → 顺序应用 MIGRATIONS → 返回迁移后的文档（未做 zod 校验，
//   调用方应在迁移后自行 ProjectSchema.parse/safeParse）。

import { bindProjectRefs } from '../refs/bind.ts'

export const CURRENT_SCHEMA_VERSION = 2

const EMPTY_PHASE_PROGRESS = {
  world: 'locked',
  scale: 'locked',
  structure: 'locked',
  workshop: 'locked',
  validate: 'locked',
}

/**
 * 把缺字段的旧文档（尤其是早期 localStorage 导出）补齐到 ProjectSchema 能解析的最小形态。
 * 只补默认值，不改变已存在的字段内容。
 */
export function normalizeLegacy(doc: any): any {
  if (doc == null || typeof doc !== 'object') return doc

  const out = { ...doc }

  if (!out.schemaVersion) {
    out.schemaVersion = 1
  }

  if (!out.phaseProgress || typeof out.phaseProgress !== 'object') {
    out.phaseProgress = { ...EMPTY_PHASE_PROGRESS }
  }

  if (out.worldAnchor === undefined) out.worldAnchor = null
  if (out.selectedScalePlanId === undefined) out.selectedScalePlanId = null
  if (out.lastValidation === undefined) out.lastValidation = null
  if (out.directorReview === undefined) out.directorReview = null
  if (out.downstreamStale === undefined) out.downstreamStale = false
  // 缺省/非法值一律按 thinking 处理，保持迁移前（无双模式概念时）的深度生成行为不变。
  if (out.aiMode !== 'fast' && out.aiMode !== 'thinking') out.aiMode = 'thinking'

  for (const key of ['characters', 'scalePlanOptions', 'chapters', 'acts', 'nodes', 'variables', 'endings']) {
    if (!Array.isArray(out[key])) out[key] = []
  }

  return out
}

/**
 * 按 schemaVersion 顺序注册的文档迁移函数。key 是“迁移前”的 schemaVersion，
 * 函数返回“迁移后”的文档（含更新后的 schemaVersion）；注册新版本时同步提升 CURRENT_SCHEMA_VERSION。
 *
 * 1 → 2（docs/plans/2026-09-16-id-refs.md 期 1）：变量/角色引用层。用文档自带的 variables/characters
 * 把 conditions / variableEffects / speaker / variablesRead|Write / variableConditions 解析成 AST 与 id，
 * 纯附加——任何原文串一个字节不动；同名歧义不猜、找不到留未绑定。纯函数、幂等，
 * 惰性跑在既有 migrateProject 调用点上，不做批量写回（saveProject 会给每个节点行 version+1）。
 */
export const MIGRATIONS: Record<number, (doc: any) => any> = {
  1: (doc) => ({ ...bindProjectRefs(doc).project, schemaVersion: 2 }),
}

/**
 * 把任意版本的文档顺序迁移到 CURRENT_SCHEMA_VERSION。
 * 迁移后不做 zod 校验，调用方需自行 ProjectSchema.parse/safeParse。
 */
export function migrateProject(doc: any): any {
  let current = normalizeLegacy(doc)

  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[current.schemaVersion]
    if (!migrate) {
      // 没有对应迁移函数：直接跳到当前版本号，避免死循环。
      current = { ...current, schemaVersion: CURRENT_SCHEMA_VERSION }
      break
    }
    current = migrate(current)
  }

  return current
}
