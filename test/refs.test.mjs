// 期 1a（docs/plans/2026-09-16-id-refs.md）：引用层 parse/print/eval/resolve/bind 与 1→2 迁移。
// V1 往返、V2 与串版求值语义等价、V3 迁移幂等且 schema 可解析、V4 同名不猜、V5 存量主流场景（全部未绑定）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { parseCond, parseEffects } from '../lib/refs/parse.ts'
import { printCond, printEffects } from '../lib/refs/print.ts'
import { evalCondOrTrue, applyEffects } from '../lib/refs/eval.ts'
import { resolveVariable, resolveCharacter } from '../lib/refs/resolve.ts'
import { bindProjectRefs, bindChoiceRefs, newBindReport } from '../lib/refs/bind.ts'
import { evalConditions, applyVariableEffect } from '../lib/conditions.ts'
import { migrateProject } from '../lib/schema/migrations.ts'
import { ProjectSchema } from '../lib/schema/project.ts'
import { mergeWindowEdits } from '../lib/store/merge.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'data', 'projects', 'g120MnzS.json')

const CONDS = [
  'trust>=3', 'trust >= 3 && flag==1', 'a>=1 || b<2', '(a>=1 || b<2) && c==3', 'a>=1 || (b<2 && c!=x)',
  '((a>=1))', 'mood=="calm"', "note == 'x y'", 'conviction>=6 AND courage==true', 'trust>=3 &&', '(a>=1', 'a>=1 && (b<2 || c==3) && d>0',
]
const EFFECTS = ['trust+1', '+trust', '-brave', 'trust+1, respect+1', 'control+1,trust-1', 'mood=calm', 'line=好的, 走吧, trust+1', 'trust+0', 'oops', 'trust+1, oops']

test('V1 parseCond 往返：parse(print(parse(s))) 与 parse(s) 深等（含 raw 分支）', () => {
  for (const s of CONDS) {
    const a = parseCond(s)
    assert.deepEqual(parseCond(printCond(a)), a, s)
  }
})

test('V1 parseEffects 往返', () => {
  for (const s of EFFECTS) {
    const a = parseEffects(s)
    assert.deepEqual(parseEffects(printEffects(a)), a, s)
  }
})

test('V2 条件求值：AST 版与串版在随机变量状态上逐一相等', () => {
  let seed = 7
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const names = ['trust', 'flag', 'a', 'b', 'c', 'd', 'mood', 'note', 'conviction', 'courage']
  for (const s of CONDS) {
    const ast = parseCond(s)
    for (let i = 0; i < 100; i++) {
      const state = {}
      for (const n of names) state[n] = rnd() < 0.3 ? ['calm', 'x y', 'true', 'x'][Math.floor(rnd() * 4)] : Math.floor(rnd() * 8) - 2
      assert.equal(evalCondOrTrue(ast, state), evalConditions(s, state), `${s} @ ${JSON.stringify(state)}`)
    }
  }
})

test('V2 效果应用：AST 版与串版结果深等', () => {
  for (const s of EFFECTS) {
    const state = { trust: 2, respect: '1', brave: 0 }
    assert.deepEqual(applyEffects(state, parseEffects(s)), applyVariableEffect(state, s), s)
  }
})

test('resolve：精确唯一 → 绑定；归一化唯一 → 绑定；>1 → 歧义；0 → 未解析', () => {
  const vars = [{ id: 'v1', name: 'trust' }, { id: 'v2', name: 'Brave' }, { id: 'v3', name: 'dup' }, { id: 'v4', name: 'DUP' }]
  assert.equal(resolveVariable(vars, 'trust').item.id, 'v1')
  assert.equal(resolveVariable(vars, 'brave').item.id, 'v2')
  assert.equal(resolveVariable(vars, 'dup').kind, 'bound', '精确命中优先于归一化歧义')
  assert.equal(resolveVariable(vars, 'Dup').kind, 'ambiguous')
  assert.equal(resolveVariable(vars, 'nope').kind, 'unresolved')
  const chars = [{ id: 'c1', name: "无名来电者（'M'）" }]
  assert.equal(resolveCharacter(chars, '无名来电者（M）').item.id, 'c1')
})

test('V4 bind：两个同名变量 → 引用留未绑定并记入 ambiguous，不绑到第一个', () => {
  const vars = [{ id: 'v1', name: 'trust', type: 'counter', defaultValue: '0', description: '' }, { id: 'v2', name: 'trust', type: 'counter', defaultValue: '0', description: '' }]
  const report = newBindReport()
  const c = bindChoiceRefs({ id: 'c', nodeId: 'n', text: '', order: 0, targetNodeId: '', conditions: 'trust>=1', variableEffects: 'trust+1, brave+1' }, vars, report)
  assert.equal(c.cond.ref.varId, undefined)
  assert.equal(c.effects[0].ref.varId, undefined)
  assert.deepEqual([...report.ambiguous], ['trust'])
  assert.deepEqual([...report.unresolved], ['brave'])
  assert.equal(c.conditions, 'trust>=1', '原文串不动')
})

test('bind：绑定态带 varId，speaker 命中写 speakerId，systemFunction 只保留绑上的 id', () => {
  const project = {
    variables: [{ id: 'v1', name: 'trust', type: 'counter', defaultValue: '0', description: '' }],
    characters: [{ id: 'c1', name: '林警官', role: 'support', motivation: '', relationship: '' }],
    nodes: [{ id: 'n', choices: [{ id: 'c', conditions: 'trust>=1 && ghost==1', variableEffects: '+trust' }],
      dialogue: [{ id: 'd1', speaker: '林警官', text: '', emotion: '' }, { id: 'd2', speaker: '路人', text: '', emotion: '' }],
      systemFunction: { variablesRead: ['trust', 'ghost'], variablesWrite: ['trust'], requirements: '' } }],
    endings: [{ id: 'e', conditions: 'trust > 5', variableConditions: [{ variableName: 'trust', operator: '>=', value: 3 }] }],
  }
  const { project: p, report } = bindProjectRefs(project)
  const ch = p.nodes[0].choices[0]
  assert.equal(ch.cond.k, 'and')
  assert.equal(ch.cond.parts[0].ref.varId, 'v1')
  assert.equal(ch.cond.parts[1].ref.varId, undefined)
  assert.equal(ch.effects[0].ref.varId, 'v1')
  assert.equal(p.nodes[0].dialogue[0].speakerId, 'c1')
  assert.equal(p.nodes[0].dialogue[1].speakerId, undefined)
  assert.deepEqual(p.nodes[0].systemFunction.readIds, ['v1'])
  assert.equal(p.endings[0].cond.ref.varId, 'v1')
  assert.equal(p.endings[0].variableConditions[0].variableId, 'v1')
  assert.deepEqual([...report.unresolved], ['ghost'])
})

test('V3 迁移与对账合并的版本顺序：v1 文档经迁移后再进 mergeWindowEdits，结果无 v1 残留（每个选项都带引用层）', () => {
  const v1 = () => ({
    id: 'p', title: 't', createdAt: 'x', updatedAt: 'x', currentPhase: 'world', schemaVersion: 1,
    variables: [{ id: 'v1', name: 'trust', type: 'counter', defaultValue: '0', description: '' }],
    nodes: [{ id: 'n1', choices: [{ id: 'c1', conditions: 'trust>=1', variableEffects: 'trust+1' }], dialogue: [] }],
  })
  const db = migrateProject(v1())
  const base = migrateProject(v1())
  const current = migrateProject(v1())
  current.nodes[0].choices[0].variableEffects = 'trust+2' // 本地窗口内编辑
  const { project: merged, changed } = mergeWindowEdits(db, base, current)
  assert.equal(changed, true)
  assert.equal(merged.schemaVersion, 2)
  for (const n of merged.nodes) for (const c of n.choices) {
    assert.ok('cond' in c && 'effects' in c, '合并结果每个选项都带引用层字段')
  }
  assert.equal(merged.nodes[0].choices[0].variableEffects, 'trust+2')
  assert.equal(merged.nodes[0].choices[0].cond.ref.varId, 'v1')
})

test('V3/V5 迁移 1→2：真实 fixture 不抛错、原文串逐字节不变、schema 可解析、幂等、全部引用为未绑定态', { skip: !existsSync(fixturePath) && 'fixture 不在本机' }, () => {
  const doc = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const v2 = migrateProject(doc)
  assert.equal(v2.schemaVersion, 2)
  assert.deepEqual(migrateProject(v2), v2, '幂等')
  const parsed = ProjectSchema.parse(v2)
  assert.equal(parsed.nodes.length, doc.nodes.length)
  let effects = 0, bound = 0, speakers = 0
  for (let i = 0; i < doc.nodes.length; i++) {
    const a = doc.nodes[i], b = v2.nodes[i]
    for (let j = 0; j < (a.choices ?? []).length; j++) {
      assert.equal(b.choices[j].conditions, a.choices[j].conditions)
      assert.equal(b.choices[j].variableEffects, a.choices[j].variableEffects)
      for (const it of b.choices[j].effects ?? []) if (it.k === 'eff') { effects++; if (it.ref.varId) bound++ }
    }
    for (let j = 0; j < (a.dialogue ?? []).length; j++) {
      assert.equal(b.dialogue[j].speaker, a.dialogue[j].speaker)
      if (b.dialogue[j].speakerId) speakers++
    }
  }
  assert.ok(effects > 0, '该 fixture 有效果引用')
  assert.equal(bound, 0, 'variables 为空 → 全部未绑定（存量主流场景）')
  assert.equal(speakers, 0, 'characters 为空 → 无 speakerId')
})
