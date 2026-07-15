// 用两个真实项目文件校验 ProjectSchema：解析必须成功，且节点数与实际文件一致。
// 运行：node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ProjectSchema } from '../lib/schema/project.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectsDir = path.join(__dirname, '..', 'data', 'projects')

function loadFixture(filename) {
  const raw = readFileSync(path.join(projectsDir, filename), 'utf8')
  return JSON.parse(raw)
}

test('g120MnzS.json: ProjectSchema.parse 成功，节点数为 41', () => {
  const doc = loadFixture('g120MnzS.json')
  const result = ProjectSchema.parse(doc)
  assert.equal(result.nodes.length, 41)
  assert.equal(result.id, 'g120MnzS')
})

test('x-TZT55r.json: ProjectSchema.parse 成功，节点数为 65', () => {
  const doc = loadFixture('x-TZT55r.json')
  const result = ProjectSchema.parse(doc)
  assert.equal(result.nodes.length, 65)
  assert.equal(result.id, 'x-TZT55r')
})

test('g120MnzS.json: 缺失的 EmotionFunction.playerEmotion 不阻断解析（真实数据存在此偏差）', () => {
  const doc = loadFixture('g120MnzS.json')
  const missingCount = doc.nodes.filter((n) => !('playerEmotion' in n.emotionFunction)).length
  assert.ok(missingCount > 0, '预期该真实文件确实存在缺失 playerEmotion 的节点')

  const result = ProjectSchema.parse(doc)
  assert.equal(result.nodes.length, doc.nodes.length)
})

test('g120MnzS.json: 缺失的 ScalePlan.actCountPerChapter/totalBranches/aiRationale 不阻断解析', () => {
  const doc = loadFixture('g120MnzS.json')
  for (const plan of doc.scalePlanOptions) {
    assert.ok(!('actCountPerChapter' in plan))
  }
  const result = ProjectSchema.parse(doc)
  assert.equal(result.scalePlanOptions.length, doc.scalePlanOptions.length)
})

test('safeParse 对结构错误的文档返回 success:false（不静默通过垃圾数据）', () => {
  const bad = { id: 'x', title: 'x' } // 缺失几乎所有必填字段
  const result = ProjectSchema.safeParse(bad)
  assert.equal(result.success, false)
})
