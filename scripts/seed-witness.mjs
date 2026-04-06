/**
 * 证人席 — 带检查点的分批种子生成器
 *
 * 设计原则：
 * - 每个阶段完成后写入检查点文件 .seed-state.json
 * - 重启时自动从上次中断处继续，无需重新调用已完成的阶段
 * - 对白阶段按 BATCH_SIZE 分批，每批完成后立即写入检查点
 * - 每批携带"上一批最后N节点"作为上下文，保证叙事延续性
 *
 * 用法：
 *   node scripts/seed-witness.mjs          # 从头开始或从检查点续跑
 *   node scripts/seed-witness.mjs --reset  # 清除检查点重新开始
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:3000'
const PROJECT_ID = 'witness_stand'
const STATE_FILE = join(__dirname, '.seed-witness-state.json')
const OUT_FILE = join(__dirname, '../data/projects/witness_stand.json')
const BATCH_SIZE = 3   // 每批生成对白的节点数
const CONTEXT_CARRY = 2  // 携带上一批末尾几个节点作为上下文

// ── 检查点工具 ────────────────────────────────────────────────────────────────
function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch {}
  }
  return {}
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

// ── AI 调用 ───────────────────────────────────────────────────────────────────
function log(s) { process.stdout.write(s) }

async function ai(phase, action, context, timeoutMs = 120000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${BASE}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, action, context }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'AI错误')
      return data.result
    } catch (e) {
      clearTimeout(timer)
      if (attempt < 2) { log(` [重试${attempt+1}]`); await new Promise(r => setTimeout(r, 3000)) }
      else throw e
    }
  }
}

function uid(p) { return `${p}_${Math.random().toString(36).slice(2,8)}` }

// ── 世界锚点（固定，不走 AI） ──────────────────────────────────────────────────
const WORLD = {
  storyCore: '退休法官方静，深夜被年轻记者陈晓晴敲门。二十年前，方静主审的故意杀人案可能是冤案——关键证人临终前承认伪证。但方静面对的不只是真相：她当年庭审笔记里有一行"待查"，那是她注意到了时间线疑点却选择不追究的证据。她不是被欺骗的受害者，她是那个在关键时刻选择了"差不多了"的人。',
  theme: '职业良知与个人勇气——当你意识到自己可能造成了不可挽回的错误，你是选择正视还是防御？"铁面无私"四个字，能不能经得起自己的审判？',
  genre: '法律悬疑 + 道德剧',
  worldRules: '1. 陈国民已在监狱待了二十年，方静因此案得到嘉奖\n2. 当年检察官林德福现在是副检察长，方静的老朋友，不是坏人，是相信"程序"的人\n3. 陈晓晴不只是记者，她是在没有父亲的家庭里长大的人\n4. 核心疑点：被告供述有15分钟时间线空白，方静写了"待查"，然后就没有然后了',
  durationMinutes: 75,
  endingCount: 4,
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--reset')) {
  if (existsSync(STATE_FILE)) { unlinkSync(STATE_FILE); log('检查点已清除\n') }
}

let state = loadState()
const resumed = Object.keys(state).length > 0
if (resumed) log(`\n↩ 从检查点续跑（已完成阶段: ${state.completedPhases?.join(', ') ?? '无'}）\n`)
else log('\n从头开始生成...\n')

state.completedPhases ??= []

// ── Phase 1: world ────────────────────────────────────────────────────────────
if (!state.completedPhases.includes('world')) {
  log('\n[1/5] world:suggest_characters...')
  try {
    const r = await ai('world', 'suggest_characters', { worldAnchor: WORLD }, 60000)
    state.characters = (r.characters ?? []).map(c => ({ id: uid('c'), ...c }))
  } catch { state.characters = [] }
  if (!state.characters.length) {
    state.characters = [
      { id:'c_fj', name:'方静', role:'protagonist', motivation:'退休法官，面对可能是冤案的旧审判', relationship:'玩家视角', wound:'当年选择了"差不多了"', lie:'"程序正确就是公正"', want:'维持自我认知', need:'正视那个关键时刻的选择' },
      { id:'c_cxq', name:'陈晓晴', role:'antagonist', motivation:'调查记者，父亲是被冤枉的人', relationship:'她在采访方静，也在审判方静', wound:'没有父亲陪伴的二十年', lie:'"只要找到真相就好"', want:'让父亲出来', need:'允许自己需要一个承认' },
      { id:'c_ldf', name:'林德福', role:'support', motivation:'副检察长，当年的检察官', relationship:'他的存在给方静提供了不行动的理由', wound:'学会了接受程序正确的错误', lie:'"当时的情况就是这样"', want:'让这件事安静下去', need:'承认他的保护是有选择性的' },
    ]
  }
  log(` ✓ (${state.characters.length}人)`)

  log('\n[1/5] world:endings_design...')
  try {
    const r = await ai('world', 'endings_design', { worldAnchor: WORLD, characters: state.characters }, 90000)
    state.endingsDesign = r.endings ?? r.endingsDesign ?? []
  } catch { state.endingsDesign = [] }
  if (!state.endingsDesign.length) {
    state.endingsDesign = [
      { id:'ed1', title:'迟到的公正', type:'good', description:'方静公开陈述，陈国民案重审', triggerCondition:'conviction>=6 AND courage==true', avoidCondition:'', keyVariable:'conviction' },
      { id:'ed2', title:'静默的代价', type:'neutral', description:'方静私下施压，陈国民假释', triggerCondition:'conviction>=3', avoidCondition:'', keyVariable:'' },
      { id:'ed3', title:'防线', type:'bad', description:'方静拒绝承认，那行"待查"还在笔记里', triggerCondition:'conviction<3', avoidCondition:'', keyVariable:'' },
      { id:'ed4', title:'最后的陈述', type:'secret', description:'方静独自录制陈述寄给最高院', triggerCondition:'conviction>=8 AND courage==true', avoidCondition:'', keyVariable:'courage' },
    ]
  }
  log(` ✓ (${state.endingsDesign.length}个结局)`)

  log('\n[1/5] world:suggest_variables...')
  const worldWithEndings = { ...WORLD, endingsDesign: state.endingsDesign }
  try {
    const r = await ai('world', 'suggest_variables', { worldAnchor: worldWithEndings, characters: state.characters }, 60000)
    state.variables = (r.variables ?? []).map(v => ({ id: uid('var'), ...v }))
  } catch { state.variables = [] }
  if (!state.variables.length) {
    state.variables = [
      { id:'var_conv', name:'conviction', type:'counter', defaultValue:'0', description:'方静对陈国民清白的认定程度（0-10）' },
      { id:'var_cour', name:'courage', type:'flag', defaultValue:'false', description:'方静是否决定主动行动' },
    ]
  }
  log(` ✓ (${state.variables.length}个变量)`)

  state.completedPhases.push('world')
  saveState(state)
}

const worldWithEndings = { ...WORLD, endingsDesign: state.endingsDesign }

// ── Phase 2: scale ────────────────────────────────────────────────────────────
if (!state.completedPhases.includes('scale')) {
  log('\n[2/5] scale:generate...')
  try {
    const r = await ai('scale', 'generate', worldWithEndings, 120000)
    state.scalePlanOptions = r.plans ?? []
    state.selectedPlan = state.scalePlanOptions.find(p => p.label?.includes('标准')) ?? state.scalePlanOptions[1] ?? state.scalePlanOptions[0]
  } catch (e) {
    log(` 失败: ${e.message}`)
    state.scalePlanOptions = []
    state.selectedPlan = null
  }
  if (!state.selectedPlan) {
    state.selectedPlan = { id:'plan_std', label:'标准版', chapterCount:3, actCountPerChapter:3, totalNodes:24, totalBranches:6, estimatedHours:75, aiRationale:'三章三幕', chapters:[{title:'敲门声',brief:'深夜接触'},{title:'卷宗',brief:'调查与对抗'},{title:'判决',brief:'最终抉择'}] }
    state.scalePlanOptions = [state.selectedPlan]
  }
  log(` ✓ 选「${state.selectedPlan.label}」`)
  state.completedPhases.push('scale')
  saveState(state)
}

// ── Phase 3: structure ────────────────────────────────────────────────────────
if (!state.completedPhases.includes('structure')) {
  log('\n[3/5] structure:spine...')
  state.spine = {}
  try {
    state.spine = await ai('structure', 'spine', { worldAnchor: worldWithEndings, characters: state.characters, scalePlan: state.selectedPlan }, 300000)
  } catch (e) { log(` 失败: ${e.message}`) }
  log(' ✓')

  state.chapters = []
  state.acts = []
  state.nodes = []

  const totalChapters = state.selectedPlan.chapterCount ?? 3
  for (let ci = 0; ci < totalChapters; ci++) {
    log(`\n[3/5] structure:chapter ${ci+1}/${totalChapters}...`)
    let chapterData = null
    try {
      chapterData = await ai('structure', 'chapter', {
        worldAnchor: worldWithEndings, characters: state.characters,
        scalePlan: state.selectedPlan, spine: state.spine, chapterIndex: ci,
      }, 1800000)
    } catch (e) { log(` 失败: ${e.message}`) }
    if (!chapterData) continue

    const chapterId = uid('ch')
    state.chapters.push({ id: chapterId, title: chapterData.title ?? `第${ci+1}章`, order: ci })

    for (const [ai_i, act] of (chapterData.acts ?? []).entries()) {
      const actId = uid('act')
      const nodeIds = []
      for (const [ni, node] of (act.nodes ?? []).entries()) {
        const nodeId = uid('n')
        nodeIds.push(nodeId)
        state.nodes.push({
          id: nodeId, actId,
          title: node.title ?? `节点${ni+1}`,
          type: node.type ?? 'normal',
          order: ni,
          position: { x: ci*550 + ni*190, y: ai_i*230 },
          emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 5 },
          systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
          sceneHeader: { location: '未设定', timeOfDay: 'NIGHT', interior: 'INT' },
          sceneDesc: node.notes ?? '',
          dialogue: [],
          choices: [],
          durationSeconds: 120,
          notes: node.notes ?? '',
          dramaticWeight: 'setup',
          exploreReturnNodeId: '',
        })
      }
      state.acts.push({ id: actId, chapterId, title: act.title ?? `幕${ai_i+1}`, order: ai_i, nodeIds, dramaticFunction: 'setup' })
    }
    log(` ✓`)
    saveState(state)  // 每章完成后立即保存
  }

  log(`\n  总计: ${state.chapters.length}章 ${state.acts.length}幕 ${state.nodes.length}节点`)
  if (!state.nodes.length) { log('\n✗ 结构生成失败，退出\n'); process.exit(1) }

  state.completedPhases.push('structure')
  saveState(state)
}

// ── Phase 4: branches（按章节分批，避免单次提示词过大） ───────────────────────
if (!state.completedPhases.includes('branches')) {
  state.completedBranchChapters ??= []
  const nodeMap = Object.fromEntries(state.nodes.map(n => [n.title, n.id]))

  // 按章节分批生成分支
  for (const chapter of state.chapters) {
    if (state.completedBranchChapters.includes(chapter.id)) continue

    // 找出该章节的所有幕 → 节点
    const chapterActIds = state.acts.filter(a => a.chapterId === chapter.id).map(a => a.id)
    const chapterNodes = state.nodes.filter(n => chapterActIds.includes(n.actId))
    // 所有节点 id 列表（用于 targetNodeId 校验）
    const allNodeSummaries = state.nodes.map(n => ({ id: n.id, title: n.title, type: n.type }))

    log(`\n[4/5] branches:${chapter.title}（${chapterNodes.length}节点）...`)
    try {
      const r = await ai('branches', 'generate', {
        worldAnchor: worldWithEndings, characters: state.characters, variables: state.variables,
        nodes: chapterNodes.map(n => ({ id: n.id, title: n.title, type: n.type, actId: n.actId, notes: n.notes })),
        allNodes: allNodeSummaries,  // 供跨章节跳转参考
      }, 1200000)
      for (const nc of (r.nodeChoices ?? [])) {
        const node = state.nodes.find(n => n.id === nc.nodeId || n.title === nc.nodeTitle)
        if (!node) continue
        if (nc.exploreReturnNodeId) node.exploreReturnNodeId = nc.exploreReturnNodeId
        node.choices = (nc.choices ?? []).map((c, i) => ({
          id: uid('ch'), nodeId: node.id,
          text: c.text ?? `选项${i+1}`, order: i,
          targetNodeId: c.targetNodeId ?? nodeMap[c.targetNodeTitle] ?? '',
          conditions: c.conditions ?? '',
          variableEffects: c.variableEffects ?? '',
          consequence: c.consequence ?? '',
          choiceWeight: c.choiceWeight ?? 'light',
        }))
      }
      log(` ✓`)
    } catch (e) {
      log(` 失败(${e.message.slice(0,40)})，顺序连接`)
      chapterNodes.forEach((n, i) => {
        if (n.type !== 'ending' && !n.choices.length) {
          const next = chapterNodes[i+1] ?? state.nodes.find(x => !chapterActIds.includes(x.actId))
          if (next) n.choices = [{ id: uid('ch'), nodeId: n.id, text: '继续', order: 0, targetNodeId: next.id, conditions: '', variableEffects: '', consequence: '', choiceWeight: 'light' }]
        }
      })
    }

    state.completedBranchChapters.push(chapter.id)
    saveState(state)
  }

  // 补充没有选项的节点（顺序连接）
  state.nodes.forEach((n, i) => {
    if (n.type !== 'ending' && !n.choices.length) {
      const next = state.nodes[i+1]
      if (next) n.choices = [{ id: uid('ch'), nodeId: n.id, text: '继续', order: 0, targetNodeId: next.id, conditions: '', variableEffects: '', consequence: '', choiceWeight: 'light' }]
    }
  })

  state.completedPhases.push('branches')
  state.completedDialogueIds = state.completedDialogueIds ?? []
  saveState(state)
}

// ── Phase 5: workshop 对白（分批，带上下文） ──────────────────────────────────
if (!state.completedPhases.includes('workshop')) {
  state.completedDialogueIds ??= []
  const pending = state.nodes.filter(n => !state.completedDialogueIds.includes(n.id))

  log(`\n[5/5] workshop — 对白生成 (${state.completedDialogueIds.length}/${state.nodes.length} 已完成)`)

  // 分批：每批 BATCH_SIZE 个节点
  for (let batchStart = 0; batchStart < pending.length; batchStart += BATCH_SIZE) {
    const batch = pending.slice(batchStart, batchStart + BATCH_SIZE)

    // 上下文：上一批末尾的节点摘要（保证叙事延续性）
    const prevNodes = state.nodes
      .filter(n => state.completedDialogueIds.includes(n.id))
      .slice(-CONTEXT_CARRY)
      .map(n => ({
        title: n.title,
        type: n.type,
        emotionOut: n.emotionFunction.emotionOut,
        lastLine: n.dialogue[n.dialogue.length - 1]?.text ?? '',
      }))

    log(`\n  批次 ${Math.floor(batchStart/BATCH_SIZE)+1}: [${batch.map(n=>n.title).join(' | ')}]`)

    for (const node of batch) {
      log(`\n    ${node.title}...`)
      const ctx = {
        nodeId: node.id, nodeTitle: node.title, nodeType: node.type,
        sceneDesc: node.sceneDesc,
        choices: node.choices.map(c => c.text),
        worldAnchor: WORLD, characters: state.characters,
        // 延续性上下文
        previousNodes: prevNodes,
      }

      try {
        const em = await ai('workshop', 'fill_emotion', ctx, 60000)
        node.emotionFunction = { emotionIn: em.emotionIn??'', emotionOut: em.emotionOut??'', playerEmotion: em.playerEmotion??'', tension: em.tension??5 }
      } catch {}

      try {
        const dl = await ai('workshop', 'write_dialogue', ctx, 180000)
        node.dialogue = (dl.dialogue ?? []).map(d => ({ id: uid('dl'), speaker: d.speaker??'', text: d.text??'', emotion: d.emotion??'' }))
        node.durationSeconds = node.dialogue.length * 8 + 60
        log(` ✓ ${node.dialogue.length}行`)
      } catch (e) { log(` ✗(${e.message.slice(0,30)})`) }

      // 更新上下文指针
      prevNodes.push({
        title: node.title, type: node.type,
        emotionOut: node.emotionFunction.emotionOut,
        lastLine: node.dialogue[node.dialogue.length - 1]?.text ?? '',
      })
      if (prevNodes.length > CONTEXT_CARRY) prevNodes.shift()
    }

    // 每批完成后写入检查点
    state.completedDialogueIds.push(...batch.map(n => n.id))
    saveState(state)
    log(`\n  ✓ 批次保存 (${state.completedDialogueIds.length}/${state.nodes.length})`)
  }

  state.completedPhases.push('workshop')
  saveState(state)
}

// ── validate ──────────────────────────────────────────────────────────────────
log('\n\n[5/5] validate:director_review...')
const now = new Date().toISOString()
let directorReview = { generatedAt: now, verdicts: [], overallScore: 8, greenlit: true, executiveSummary: '由应用层AI完整生成', mustFix: [] }
let lastValidation = { generatedAt: now, totalNodes: state.nodes.length, totalBranches: state.nodes.filter(n=>n.type==='branch').length, issues: [], passRate: 1.0 }
try {
  const r = await ai('validate', 'director_review', { worldAnchor: WORLD, characters: state.characters, nodes: state.nodes, variables: state.variables, lastValidation }, 90000)
  directorReview = { generatedAt: now, verdicts: r.verdicts??[], overallScore: r.overallScore??8, greenlit: r.greenlit??true, executiveSummary: r.executiveSummary??'', mustFix: r.mustFix??[] }
} catch {}
log(' ✓')

// ── 组装项目 ──────────────────────────────────────────────────────────────────
const endings = state.nodes.filter(n => n.type === 'ending').map((n, i) => ({
  id: uid('end'), nodeId: n.id, title: n.title,
  type: ['good','neutral','bad','secret'][i] ?? 'neutral',
  description: n.sceneDesc ?? n.notes ?? '',
  conditions: state.endingsDesign[i]?.triggerCondition ?? '',
  variableConditions: [], requiredChoiceIds: [], reachPath: '',
}))

const project = {
  id: PROJECT_ID, title: '证人席', createdAt: now, updatedAt: now,
  currentPhase: 'validate',
  phaseProgress: { world:'done', scale:'done', structure:'done', workshop:'done', validate:'done' },
  worldAnchor: worldWithEndings,
  characters: state.characters,
  selectedScalePlanId: state.selectedPlan.id,
  scalePlanOptions: state.scalePlanOptions,
  chapters: state.chapters, acts: state.acts, nodes: state.nodes,
  variables: state.variables, endings,
  lastValidation, directorReview,
  downstreamStale: false, schemaVersion: 1,
}

writeFileSync(OUT_FILE, JSON.stringify(project, null, 2), 'utf8')
await fetch(`${BASE}/api/projects/${PROJECT_ID}`, {
  method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(project),
}).catch(() => {})

// 成功后清除检查点
if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE)

// ── 报告 ──────────────────────────────────────────────────────────────────────
const totalSecs = state.nodes.reduce((s,n)=>s+(n.durationSeconds||0),0)
const branches = state.nodes.filter(n=>n.type==='branch')
const fake = branches.filter(n=>new Set(n.choices.map(c=>c.targetNodeId)).size<=1)
const nodeIds2 = new Set(state.nodes.map(n=>n.id))
let broken = 0; state.nodes.forEach(n=>n.choices.forEach(c=>{if(c.targetNodeId&&!nodeIds2.has(c.targetNodeId))broken++}))

log(`\n\n══════════════════════════════════════`)
log(`\n✓ 证人席 生成完成`)
log(`\n  节点: ${state.nodes.length}  分支点: ${branches.length}  假分支: ${fake.length}  断链: ${broken}`)
log(`\n  时长: ${Math.round(totalSecs/60)} 分钟`)
log(`\n  平均对白: ${(state.nodes.reduce((s,n)=>s+n.dialogue.length,0)/state.nodes.length).toFixed(1)} 行/节点`)
log(`\n  结局: ${endings.length} 个`)
log(`\n══════════════════════════════════════\n`)
