// 期 0（docs/plans/2026-09-16-id-refs.md）：按名字对账保留 id、名字唯一性、extractConditionVars 分叉收敛。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeVarName, normalizeCharName, uniqueName, reconcileByName } from '../lib/refs/names.ts'
import { extractConditionVars } from '../lib/conditions.ts'

let seq = 0
const newId = () => `id${++seq}`
const V = (name, extra = {}) => ({ name, type: 'counter', defaultValue: '0', description: '', ...extra })

test('reconcileByName：连续两次喂入同名清单，id 逐个不变，内容字段被新清单覆盖', () => {
  const first = reconcileByName([], [V('trust'), V('brave')], normalizeVarName, newId)
  const ids = first.map(v => v.id)
  const second = reconcileByName(first, [V('Trust', { description: '改了' }), V('brave'), V('new')], normalizeVarName, newId)
  assert.deepEqual(second.slice(0, 2).map(v => v.id), ids)
  assert.equal(second[0].description, '改了')
  assert.equal(second[0].name, 'Trust', '名字取新清单的写法（大小写不敏感匹配，但不改用户给的形式）')
  assert.notEqual(second[2].id, undefined)
  assert.ok(!ids.includes(second[2].id), '真正新增的条目拿新 id')
})

test('reconcileByName：旧清单里没出现在新清单的条目被移除（替换语义）', () => {
  const first = reconcileByName([], [V('a'), V('b')], normalizeVarName, newId)
  const second = reconcileByName(first, [V('a')], normalizeVarName, newId)
  assert.deepEqual(second.map(v => v.name), ['a'])
})

test('reconcileByName：清单内重名自动加后缀，且后缀名能对账到既有同名条目', () => {
  const first = reconcileByName([], [V('trust'), V('trust')], normalizeVarName, newId)
  assert.deepEqual(first.map(v => v.name), ['trust', 'trust_2'])
  const second = reconcileByName(first, [V('trust'), V('trust')], normalizeVarName, newId)
  assert.deepEqual(second.map(v => v.id), first.map(v => v.id))
})

test('uniqueName：重名加 _2/_3；角色名用空格分隔', () => {
  const taken = new Set(['trust', 'trust_2'].map(normalizeVarName))
  assert.equal(uniqueName('trust', taken, normalizeVarName), 'trust_3')
  assert.equal(uniqueName('free', taken, normalizeVarName), 'free')
  const chars = new Set(['新角色'].map(normalizeCharName))
  assert.equal(uniqueName('新角色', chars, normalizeCharName, ' '), '新角色 2')
})

test('normalizeCharName：近重名（只差引号/括号/空白）归一到一起', () => {
  assert.equal(normalizeCharName("无名来电者（'M'）"), normalizeCharName('无名来电者（M）'))
  assert.equal(normalizeCharName(' 林  警官 '), normalizeCharName('林 警官'))
})

test('normalizeVarName：ASCII 大小写不敏感、全角折半角', () => {
  assert.equal(normalizeVarName('Trust'), normalizeVarName('trust'))
  assert.equal(normalizeVarName('ｔｒｕｓｔ'), 'trust')
})

test('extractConditionVars（lib/conditions 导出版）支持括号与 &&/|| 混合——旧 engine 本地版做不到', () => {
  assert.deepEqual(extractConditionVars('(a>=1 || b<2) && c==3').sort(), ['a', 'b', 'c'])
  assert.deepEqual(extractConditionVars(''), [])
})
