// 迁移链单测：喂一个 schemaVersion 缺失/形状不全的最小文档，
// migrateProject 后应可被 ProjectSchema 成功解析。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ProjectSchema } from '../lib/schema/project.ts'
import { CURRENT_SCHEMA_VERSION, migrateProject, normalizeLegacy, MIGRATIONS } from '../lib/schema/migrations.ts'

function minimalDoc(overrides = {}) {
  return {
    id: 'p1',
    title: '测试项目',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentPhase: 'world',
    ...overrides,
  }
}

test('CURRENT_SCHEMA_VERSION 为 1', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1)
})

test('MIGRATIONS 注册表当前为空（框架就位，无历史版本需要迁移）', () => {
  assert.deepEqual(MIGRATIONS, {})
})

test('normalizeLegacy: 缺失 schemaVersion 的文档补齐为 1，并补齐缺失数组/默认值', () => {
  const doc = minimalDoc()
  const normalized = normalizeLegacy(doc)

  assert.equal(normalized.schemaVersion, 1)
  assert.deepEqual(normalized.characters, [])
  assert.deepEqual(normalized.scalePlanOptions, [])
  assert.deepEqual(normalized.chapters, [])
  assert.deepEqual(normalized.acts, [])
  assert.deepEqual(normalized.nodes, [])
  assert.deepEqual(normalized.variables, [])
  assert.deepEqual(normalized.endings, [])
  assert.equal(normalized.worldAnchor, null)
  assert.equal(normalized.selectedScalePlanId, null)
  assert.equal(normalized.lastValidation, null)
  assert.equal(normalized.directorReview, null)
  assert.equal(normalized.downstreamStale, false)
  assert.deepEqual(normalized.phaseProgress, {
    world: 'locked',
    scale: 'locked',
    structure: 'locked',
    workshop: 'locked',
    validate: 'locked',
  })
})

test('normalizeLegacy: schemaVersion 为 0 时也补齐为 1', () => {
  const doc = minimalDoc({ schemaVersion: 0 })
  const normalized = normalizeLegacy(doc)
  assert.equal(normalized.schemaVersion, 1)
})

test('normalizeLegacy: 不覆盖已存在的字段内容', () => {
  const doc = minimalDoc({ characters: [{ id: 'c1', name: '主角' }], downstreamStale: true })
  const normalized = normalizeLegacy(doc)
  assert.deepEqual(normalized.characters, [{ id: 'c1', name: '主角' }])
  assert.equal(normalized.downstreamStale, true)
})

test('migrateProject: 最小文档迁移后 schemaVersion===CURRENT_SCHEMA_VERSION 且可被 ProjectSchema 成功解析', () => {
  const doc = minimalDoc()
  const migrated = migrateProject(doc)

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION)

  const result = ProjectSchema.safeParse(migrated)
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error?.issues))
})

test('migrateProject: 完全空对象（无 id/title 等）迁移后仍无法通过 ProjectSchema（不静默放宽必填字段）', () => {
  const migrated = migrateProject({})
  const result = ProjectSchema.safeParse(migrated)
  assert.equal(result.success, false)
})
