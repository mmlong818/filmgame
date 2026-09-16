// 期 3：改名不再字符串级级联——改名前「认领」未绑定引用到 id，原文串一个字节不动。
// V9 同名不串台 / V10 无级联（串不变）/ V11 期 0 事实 8 的四个反例不再被污染。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { adoptUnboundVariableRefs, adoptUnboundSpeakers } from '../lib/refs/adopt.ts'
import { refLabel, speakerLabel, choiceCond, choiceEffects } from '../lib/refs/access.ts'
import { printCond, printEffects } from '../lib/refs/print.ts'
import { migrateProject } from '../lib/schema/migrations.ts'

const V = (id, name) => ({ id, name, type: 'counter', defaultValue: '0', description: '' })
const N = (id, extra = {}) => ({ id, title: id, type: 'normal', actId: 'a', order: 0, position: { x: 0, y: 0 }, emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 0 }, systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' }, sceneDesc: '', dialogue: [], choices: [], durationSeconds: 0, notes: '', ...extra })
const C = (id, extra = {}) => ({ id, nodeId: 'n', text: id, order: 0, targetNodeId: 'e', conditions: '', variableEffects: '', ...extra })
const P = (over) => ({ id: 'p', title: 't', createdAt: 'x', updatedAt: 'x', currentPhase: 'world', schemaVersion: 1, variables: [], characters: [], nodes: [], endings: [], acts: [], chapters: [], scalePlanOptions: [], ...over })

test('adopt：能唯一解析的未绑定引用绑上 varId，解析不到的保持未绑定；无变化返回 null', () => {
  const project = P({
    variables: [V('v1', 'trust')],
    nodes: [N('n', { choices: [C('c1', { conditions: 'trust>=1 && ghost==1', variableEffects: 'trust+1, ghost+1' })] })],
  })
  const adopted = adoptUnboundVariableRefs(project)
  assert.ok(adopted)
  const c = adopted.nodes[0].choices[0]
  assert.equal(c.cond.parts[0].ref.varId, 'v1')
  assert.equal(c.cond.parts[1].ref.varId, undefined)
  assert.equal(c.effects[0].ref.varId, 'v1')
  assert.equal(c.effects[1].ref.varId, undefined)
  assert.equal(c.conditions, 'trust>=1 && ghost==1', '原文串不动')
  assert.equal(adoptUnboundVariableRefs(adopted), null, '已认领完 → 无变化')
})

test('V9 同名不串台：两个同名变量各被引用，改名其一后另一者展示不变、原文串都不变', () => {
  // 同名只能来自期 0 之前的存量数据，这里直接构造已绑定的 AST
  const bound = (varId, name) => ({ k: 'eff', ref: { varId, name }, kind: 'inc', value: 1 })
  const project = P({
    variables: [V('A', 'trust'), V('B', 'trust')],
    nodes: [N('n', { choices: [
      C('c1', { variableEffects: 'trust+1', effects: [bound('A', 'trust')], cond: { k: 'cmp', ref: { varId: 'A', name: 'trust' }, op: '>=', value: 3 } }),
      C('c2', { variableEffects: 'trust+1', effects: [bound('B', 'trust')], cond: null }),
    ] })],
  })
  // 模拟 store.updateVariable(A, { name: 'faith' })：先认领（无未绑定 → null），再只改名字表
  assert.equal(adoptUnboundVariableRefs(project), null)
  const renamed = { ...project, variables: [V('A', 'faith'), V('B', 'trust')] }
  const [c1, c2] = renamed.nodes[0].choices
  const label = (ref) => refLabel(ref, renamed.variables)
  assert.equal(printEffects(choiceEffects(c1, renamed.variables), label), 'faith+1')
  assert.equal(printCond(choiceCond(c1, renamed.variables), label), 'faith >= 3')
  assert.equal(printEffects(choiceEffects(c2, renamed.variables), label), 'trust+1', '另一个同名变量的引用不受影响')
  assert.equal(c1.variableEffects, 'trust+1'); assert.equal(c2.variableEffects, 'trust+1')
})

test('V11 反向回归：期 0 事实 8 的四条串在认领/改名后原文与 AST 均不被污染', () => {
  const strings = ['note==trust', 'mood==calm && calm>=1', 'conviction>=6 AND courage==true', 'flag==1']
  const project = migrateProject(P({
    variables: [V('v1', 'trust'), V('v2', 'calm')],
    nodes: [N('n', { choices: strings.map((s, i) => C(`c${i}`, { conditions: s })) })],
  }))
  const adopted = adoptUnboundVariableRefs(project) ?? project
  const renamed = { ...adopted, variables: [V('v1', 'faith'), V('v2', 'serene')] }
  const label = (ref) => refLabel(ref, renamed.variables)
  const cs = renamed.nodes[0].choices
  assert.deepEqual(cs.map(c => c.conditions), strings, '原文串逐字节不变')
  // 右值是字面量，不是变量引用——改名不会把 note==trust 改成 note==faith
  assert.equal(printCond(choiceCond(cs[0], renamed.variables), label), 'note == trust')
  assert.equal(printCond(choiceCond(cs[1], renamed.variables), label), 'mood == calm && serene >= 1')
  assert.equal(printCond(choiceCond(cs[3], renamed.variables), label), 'flag == 1')
})

test('adopt speakers：按角色名唯一解析的对白绑 speakerId；改名后 speakerLabel 跟随，speaker 原文不变', () => {
  const project = P({
    characters: [{ id: 'c1', name: '林警官', role: 'support', motivation: '', relationship: '' }],
    nodes: [N('n', { dialogue: [{ id: 'd1', speaker: '林警官', text: '', emotion: '' }, { id: 'd2', speaker: '路人', text: '', emotion: '' }] })],
  })
  const adopted = adoptUnboundSpeakers(project)
  assert.equal(adopted.nodes[0].dialogue[0].speakerId, 'c1')
  assert.equal(adopted.nodes[0].dialogue[1].speakerId, undefined)
  const renamed = { ...adopted, characters: [{ ...adopted.characters[0], name: '林队长' }] }
  assert.equal(speakerLabel(renamed.nodes[0].dialogue[0], renamed.characters), '林队长')
  assert.equal(renamed.nodes[0].dialogue[0].speaker, '林警官', '原文不动')
  assert.equal(speakerLabel(renamed.nodes[0].dialogue[1], renamed.characters), '路人')
})
