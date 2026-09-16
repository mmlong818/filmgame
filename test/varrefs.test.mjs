// 期 2：读路径切 AST。V6 混用槽位、V7 通过率回归闸门（对照旧 engine 基线）、三码拆分、UNBOUND_SPEAKER 聚合。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { refKey, choiceEffects, choiceCond } from '../lib/refs/access.ts'
import { applyEffects, evalCondOrTrue } from '../lib/refs/eval.ts'
import { runValidation } from '../lib/validation/engine.ts'
import { migrateProject } from '../lib/schema/migrations.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = (f) => path.join(__dirname, '..', 'data', 'projects', f)
const V = (id, name) => ({ id, name, type: 'counter', defaultValue: '0', description: '' })
const N = (id, extra = {}) => ({ id, title: id, type: 'normal', actId: 'a', order: 0, position: { x: 0, y: 0 }, emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 0 }, systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' }, sceneDesc: '', dialogue: [], choices: [], durationSeconds: 0, notes: '', ...extra })
const C = (id, extra = {}) => ({ id, nodeId: 'n', text: id, order: 0, targetNodeId: 'e', conditions: '', variableEffects: '', ...extra })
const P = (over) => ({ id: 'p', title: 't', createdAt: 'x', updatedAt: 'x', currentPhase: 'world', variables: [], characters: [], nodes: [], endings: [], acts: [], chapters: [], scalePlanOptions: [], ...over })

test('V6 混用槽位：同一变量的绑定引用与未绑定引用落到同一槽位，数值连续累加', () => {
  const vars = [V('v1', 'trust')]
  const bound = { k: 'eff', ref: { varId: 'v1', name: 'trust' }, kind: 'inc', value: 1 }
  const unbound = { k: 'eff', ref: { name: 'trust' }, kind: 'inc', value: 2 }
  const keyOf = (ref) => refKey(ref, vars)
  const state = applyEffects(applyEffects({ v1: 0 }, [bound], keyOf), [unbound], keyOf)
  assert.deepEqual(state, { v1: 3 })
  assert.equal(evalCondOrTrue({ k: 'cmp', ref: { name: 'Trust' }, op: '>=', value: 3 }, state, keyOf), true, '归一化后也命中同一槽位')
  assert.equal(refKey({ name: 'ghost' }, vars), '#ghost', '真正解析不到的退回 #名 槽位')
})

test('三码拆分：UNRESOLVED / AMBIGUOUS / DANGLING 各自触发，且 UNKNOWN_VARIABLE_REF 不再出现', () => {
  const project = P({
    variables: [V('v1', 'trust'), V('v2', 'dup'), V('v3', 'dup')],
    nodes: [
      N('s', { type: 'start', choices: [C('c1', { conditions: 'ghost>=1' }), C('c2', { variableEffects: 'dup+1' }), C('c3', { cond: { k: 'cmp', ref: { varId: 'gone', name: 'old' }, op: '>=', value: 1 }, effects: [] })] }),
      N('e', { type: 'ending' }),
    ],
  })
  const codes = runValidation(project).issues.map(i => i.code)
  assert.ok(codes.includes('UNRESOLVED_VARIABLE_REF'))
  assert.ok(codes.includes('AMBIGUOUS_VARIABLE_REF'))
  assert.ok(codes.includes('DANGLING_VARIABLE_REF'))
  assert.ok(!codes.includes('UNKNOWN_VARIABLE_REF'))
  assert.equal(runValidation(project).issues.find(i => i.code === 'DANGLING_VARIABLE_REF').level, 'error')
})

test('UNSATISFIABLE / CONDITION_SYNTAX / UNPARSEABLE_EFFECT 走 AST，语义与旧实现一致', () => {
  const project = P({
    variables: [V('v1', 'trust')],
    nodes: [N('s', { type: 'start', choices: [
      C('c1', { conditions: 'trust>=99', variableEffects: 'trust+1' }),
      // 注意：`a>=6 AND b==true` 会被比较式正则吃成 a >= "6 AND b==true"，不算语法错误（旧引擎同样如此）；用括号不平衡触发
      C('c2', { conditions: '(a>=1' }),
      C('c3', { variableEffects: 'trust+1, oops' }),
      C('c4'),
    ] }), N('e', { type: 'ending' })],
  })
  const codes = runValidation(project).issues.map(i => i.code)
  assert.ok(codes.includes('UNSATISFIABLE_CONDITION'), 'trust 上界 0+1=1 < 99')
  assert.ok(codes.includes('CONDITION_SYNTAX'))
  assert.ok(codes.includes('UNPARSEABLE_EFFECT'))
  assert.ok(!codes.includes('ALL_CHOICES_GATED'), 'c4 是无条件保底出口')
})

test('UNBOUND_SPEAKER：按项目聚合成一条 info；全部绑上则不报', () => {
  const chars = [{ id: 'c1', name: '林警官', role: 'support', motivation: '', relationship: '' }]
  const dialogue = [
    { id: 'd1', speaker: '林警官', text: 'a', emotion: '' },
    { id: 'd2', speaker: '路人甲', text: 'b', emotion: '' },
    { id: 'd3', speaker: '路人乙', text: 'c', emotion: '' },
  ]
  const r = runValidation(P({ characters: chars, nodes: [N('s', { type: 'start', dialogue, choices: [C('c1')] }), N('e', { type: 'ending' })] }))
  const sp = r.issues.filter(i => i.code === 'UNBOUND_SPEAKER')
  assert.equal(sp.length, 1)
  assert.equal(sp[0].level, 'info')
  assert.match(sp[0].message, /^2 行对白/)
  const ok = runValidation(P({ characters: chars, nodes: [N('s', { type: 'start', dialogue: [dialogue[0]], choices: [C('c1')] }), N('e', { type: 'ending' })] }))
  assert.equal(ok.issues.filter(i => i.code === 'UNBOUND_SPEAKER').length, 0)
})

// 旧 engine（切 AST 之前）在同一 fixture 上的实测基线，见 docs/plans/2026-09-16-id-refs.md V7
const BASELINE = {
  'g120MnzS.json': { passRate: 0, total: 33, UNKNOWN_VARIABLE_REF: 23 },
  'x-TZT55r.json': { passRate: 0, total: 135, UNKNOWN_VARIABLE_REF: 0 },
}
for (const [file, old] of Object.entries(BASELINE)) {
  test(`V7 通过率回归闸门：${file}`, { skip: !existsSync(fixture(file)) && 'fixture 不在本机' }, () => {
    const r = runValidation(migrateProject(JSON.parse(readFileSync(fixture(file), 'utf8'))))
    const count = (code) => r.issues.filter(i => i.code === code).length
    const varCodes = count('UNRESOLVED_VARIABLE_REF') + count('AMBIGUOUS_VARIABLE_REF') + count('DANGLING_VARIABLE_REF')
    assert.ok(varCodes <= old.UNKNOWN_VARIABLE_REF, `三个变量码总数 ${varCodes} 应 ≤ 旧 UNKNOWN ${old.UNKNOWN_VARIABLE_REF}`)
    assert.ok(count('UNBOUND_SPEAKER') <= 1, 'UNBOUND_SPEAKER 最多 1 条聚合项')
    assert.ok(Math.abs(r.passRate - old.passRate) <= 5, `passRate ${r.passRate} vs 旧 ${old.passRate}`)
    assert.ok(Math.abs(r.issues.length - old.total) <= 1, `issue 总数 ${r.issues.length} vs 旧 ${old.total}（只允许 +1 聚合项）`)
  })
}
