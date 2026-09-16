// 期 2 V8：Ink 导出走引用层——同名变量分成不同标识符、字符串取值加引号且不含裸双引号、说话人跟随角色名。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildInkSource } from '../lib/export/ink.ts'
import { migrateProject } from '../lib/schema/migrations.ts'

const V = (id, name, defaultValue = '0') => ({ id, name, type: 'counter', defaultValue, description: '' })
const N = (id, extra = {}) => ({ id, title: id, type: 'normal', actId: 'a', order: 0, position: { x: 0, y: 0 }, emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 0 }, systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' }, sceneDesc: '', dialogue: [], choices: [], durationSeconds: 0, notes: '', ...extra })
const C = (id, extra = {}) => ({ id, nodeId: 's', text: id, order: 0, targetNodeId: 'e', conditions: '', variableEffects: '', ...extra })
const P = (over) => ({ id: 'p', title: 't', createdAt: 'x', updatedAt: 'x', currentPhase: 'world', schemaVersion: 1, variables: [], characters: [], nodes: [], endings: [], acts: [], chapters: [], scalePlanOptions: [], ...over })

test('V8 同名变量在 Ink 里分成两个标识符，各自 VAR 声明与效果行正确', () => {
  // 两个同名 trust 变量，各被不同选项按 id 引用（先绑好 AST，再模拟其一改名前的原文串仍是 trust）
  const project = P({
    variables: [V('A', 'trust'), V('B', 'trust', '5')],
    nodes: [N('s', { type: 'start', choices: [
      C('c1', { variableEffects: 'trust+1', effects: [{ k: 'eff', ref: { varId: 'A', name: 'trust' }, kind: 'inc', value: 1 }], cond: null }),
      C('c2', { variableEffects: 'trust+1', effects: [{ k: 'eff', ref: { varId: 'B', name: 'trust' }, kind: 'inc', value: 1 }], cond: null }),
    ] }), N('e', { type: 'ending' })],
  })
  const src = buildInkSource(project)
  assert.match(src, /^VAR trust = 0$/m)
  assert.match(src, /^VAR trust_2 = 5$/m)
  assert.match(src, /~ trust = trust \+ 1/)
  assert.match(src, /~ trust_2 = trust_2 \+ 1/)
})

test('条件里的字符串取值加引号；raw 子式不带进 Ink；说话人用角色当前名字', () => {
  const doc = P({
    variables: [V('A', 'mood', 'calm')],
    characters: [{ id: 'c1', name: '林警官', role: 'support', motivation: '', relationship: '' }],
    nodes: [
      N('s', { type: 'start', dialogue: [{ id: 'd', speaker: '林警官', text: '你好', emotion: '' }], choices: [
        C('c1', { conditions: 'mood=="calm" && weird AND stuff' }),
        C('c2'),
      ] }),
      N('e', { type: 'ending' }),
    ],
  })
  const migrated = migrateProject(doc)
  // 角色改名后（原文 speaker 未变），导出跟随新名字
  migrated.characters[0].name = '林队长'
  const src = buildInkSource(migrated)
  assert.match(src, /\{ mood == "calm":/)
  assert.ok(!src.includes('AND'), 'raw 子式被丢弃')
  assert.match(src, /^林队长: 你好$/m)
})

test('未登记但被引用的变量按引用补齐声明，且映射注释在 VAR 之前', () => {
  const src = buildInkSource(migrateProject(P({
    nodes: [N('s', { type: 'start', choices: [C('c1', { variableEffects: 'courage+1', conditions: 'fear<3' }), C('c2')] }), N('e', { type: 'ending' })],
  })))
  assert.match(src, /^VAR courage = 0$/m)
  assert.match(src, /^VAR fear = 0$/m)
  assert.ok(src.indexOf('未登记变量') < src.indexOf('VAR courage'))
})
