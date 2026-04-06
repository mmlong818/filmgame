/**
 * 种子项目生成器
 * 正确流程：world:review → scale:generate → structure:spine → structure:chapter×N
 *           → branches:generate → workshop:fill_emotion + write_dialogue（所有节点）
 *           → 直接写入 data/projects/
 */

import { writeFileSync } from 'fs'
import http from 'http'

const BASE = 'http://localhost:3000'

const WORLD = {
  storyCore: '一名失忆的量子物理学家在平行宇宙间穿梭，试图找回记忆，却发现每个自己都做出了截然不同的选择。',
  theme: '身份与选择——如果你能看到所有可能的自己，你还知道自己是谁吗？',
  genre: '科幻悬疑 + 心理惊悚',
  worldRules: '1. 量子跳跃每次消耗记忆片段，跳跃越多遗忘越多\n2. 同一宇宙中不能有两个自己同时存在超过72小时\n3. 死亡在当前宇宙永久，但其他宇宙的分身仍存活',
  durationMinutes: 90,
  endingCount: 3,
}

const CHARACTERS = [
  { id: 'c1', name: '林宇', role: 'protagonist', motivation: '找回被量子跳跃抹去的记忆', relationship: '主线驱动者，每次跳跃都失去一部分自己' },
  { id: 'c2', name: '阿尔法', role: 'antagonist', motivation: '利用林宇收集量子数据实现全宇宙意识统一', relationship: '真实身份是林宇在某宇宙的未来自己' },
  { id: 'c3', name: '陈晓', role: 'support', motivation: '保护林宇，因为她知道真相', relationship: '不同宇宙中关系各异（同事/情人/陌生人）' },
]

const PROJECT_ID = 'quantum-detective-seed'
const VALID_TYPES = new Set(['start', 'normal', 'branch', 'ending', 'explore', 'merge'])

function aiRequest(body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/api/ai', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('parse: ' + raw.slice(0, 200))) } })
    })
    req.setTimeout(1800000, () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function ai(phase, action, context) {
  const data = await aiRequest(JSON.stringify({ phase, action, context }))
  if (!data.ok) throw new Error(`[${phase}:${action}] ${data.error}`)
  return data.result
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

// ── 1. world:review ──────────────────────────────────────────────
process.stdout.write('1/6 世界锚点审查...')
let review
try { review = await ai('world', 'review', WORLD) } catch { review = {} }
console.log(' ✓')

// ── 2. scale:generate ────────────────────────────────────────────
process.stdout.write('2/6 生成规模方案...')
const scaleResult = await ai('scale', 'generate', WORLD)
const plans = scaleResult.plans
const selected = plans.find(p => p.id === 'plan_b') ?? plans[1]
console.log(` ✓ 选择：${selected.label}（${selected.chapterCount}章 ${selected.totalNodes}节点）`)

// ── 3. structure:spine ───────────────────────────────────────────
process.stdout.write('3/6 生成叙事骨干...')
const spine = await ai('structure', 'spine', {
  worldAnchor: WORLD, characters: CHARACTERS, scalePlan: selected,
})
console.log(` ✓ 叙事线：${(spine.throughlines ?? []).join(' / ')}`)

// ── 4. structure:chapter × N ─────────────────────────────────────
const chapters = []
const acts = []
const nodes = []

for (let ci = 0; ci < selected.chapterCount; ci++) {
  process.stdout.write(`4/6 生成第${ci + 1}章结构...`)
  const chData = await ai('structure', 'chapter', {
    worldAnchor: WORLD, characters: CHARACTERS,
    scalePlan: selected, chapterIndex: ci, spine,
  })

  const chapterId = uid('ch')
  chapters.push({ id: chapterId, title: chData.title ?? `第${ci + 1}章`, order: ci })

  for (const [ai_, act] of (chData.acts ?? []).entries()) {
    const actId = uid('act')
    const nodeIds = []

    for (const [ni, node] of (act.nodes ?? []).entries()) {
      const rawType = node.type ?? 'normal'
      const type = VALID_TYPES.has(rawType) ? rawType : 'normal'
      const nodeId = uid('n')
      nodeIds.push(nodeId)
      nodes.push({
        id: nodeId,
        actId,
        title: node.title ?? '节点',
        type,
        order: ni,
        position: { x: ci * 500 + ni * 180, y: ai_ * 220 },
        sceneHeader: { location: '', timeOfDay: 'CONTINUOUS', interior: 'INT' },
        sceneDesc: '',
        emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 5 },
        systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
        dialogue: [],
        choices: [],
        durationSeconds: 120,
        notes: node.notes ?? '',
      })
    }

    acts.push({ id: actId, chapterId, title: act.title ?? `第${ai_ + 1}幕`, order: ai_, nodeIds })
  }

  console.log(` ✓（${chData.acts?.length ?? 0}幕）`)
}
console.log(`   共 ${nodes.length} 个节点`)

// ── 5. branches:generate ─────────────────────────────────────────
process.stdout.write(`5/6 生成分支连接（${nodes.length} 节点）...`)
const branches = await ai('branches', 'generate', {
  worldAnchor: WORLD, characters: CHARACTERS, variables: [],
  nodes: nodes.map(n => ({ id: n.id, title: n.title, type: n.type, notes: n.notes })),
})
const nodeChoices = branches.nodeChoices ?? []

for (const nc of nodeChoices) {
  const node = nodes.find(n => n.id === nc.nodeId)
  if (!node) continue
  node.choices = (nc.choices ?? []).map((c, i) => ({
    id: uid('c'),
    nodeId: node.id,
    text: c.text ?? '继续',
    order: i,
    targetNodeId: c.targetNodeId ?? '',
    conditions: c.conditions ?? '',
    variableEffects: c.variableEffects ?? '',
    choiceWeight: c.choiceWeight,
  }))
  if (nc.exploreReturnNodeId) node.exploreReturnNodeId = nc.exploreReturnNodeId
}
console.log(` ✓（${nodeChoices.length} 节点配置了分支）`)

// ── 6. workshop 填充（所有可填节点）─────────────────────────────
const fillable = nodes.filter(n => n.type !== 'ending' && n.type !== 'explore')
console.log(`6/6 填充对白和情感（${fillable.length} 个节点，并行执行）...`)

const BATCH = 4  // 并发控制，避免 Claude CLI 过载
for (let i = 0; i < fillable.length; i += BATCH) {
  const batch = fillable.slice(i, i + BATCH)
  process.stdout.write(`  [${i + 1}-${Math.min(i + BATCH, fillable.length)}/${fillable.length}] `)
  await Promise.all(batch.map(async (node) => {
    const ctx = {
      ...node,
      worldAnchor: WORLD,
      characters: CHARACTERS,
      variables: [],
    }
    try {
      const [emotion, dialogueResult] = await Promise.all([
        ai('workshop', 'fill_emotion', ctx),
        ai('workshop', 'write_dialogue', ctx),
      ])
      node.emotionFunction = {
        emotionIn: emotion.emotionIn ?? '',
        emotionOut: emotion.emotionOut ?? '',
        playerEmotion: emotion.playerEmotion ?? '',
        tension: typeof emotion.tension === 'number' ? emotion.tension : 5,
      }
      node.sceneDesc = dialogueResult.sceneDesc ?? ''
      node.dialogue = (dialogueResult.dialogue ?? []).map(d => ({
        id: uid('dl'),
        speaker: d.speaker ?? '',
        text: d.text ?? '',
        emotion: d.emotion ?? '',
        subtext: d.subtext ?? '',
      }))
      process.stdout.write('✓')
    } catch (e) {
      process.stdout.write('✗')
    }
  }))
  console.log()
}

// ── 构建 Project 对象 ─────────────────────────────────────────────
const now = new Date().toISOString()
const project = {
  id: PROJECT_ID,
  title: '量子侦探',
  createdAt: now,
  updatedAt: now,
  currentPhase: 'workshop',
  phaseProgress: {
    world: 'done',
    scale: 'done',
    structure: 'done',
    workshop: 'in_progress',
    validate: 'locked',
  },
  worldAnchor: WORLD,
  characters: CHARACTERS,
  selectedScalePlanId: selected.id,
  scalePlanOptions: plans,
  chapters,
  acts,
  nodes,
  variables: [],
  endings: [],
  lastValidation: null,
  directorReview: null,
  downstreamStale: false,
  schemaVersion: 1,
}

// ── 直接写入服务端 ────────────────────────────────────────────────
writeFileSync(`data/projects/${PROJECT_ID}.json`, JSON.stringify(project, null, 2))
console.log(`\n✓ 已写入 data/projects/${PROJECT_ID}.json`)

// ── 输出浏览器注入脚本（仍保留，用于 localStorage 同步）──────────
const summary = {
  id: PROJECT_ID,
  title: '量子侦探',
  updatedAt: now,
  currentPhase: 'workshop',
  nodeCount: nodes.length,
}

const injectScript = `// 粘贴到浏览器控制台（F12 → Console）运行
(function(){
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith('filmgame:')) keys.push(k);
  }
  keys.forEach(function(k){ localStorage.removeItem(k); });
  fetch('/api/projects/${PROJECT_ID}')
    .then(function(r){ return r.json(); })
    .then(function(d){
      var p = d.project;
      if (!p) { console.error('项目不存在'); return; }
      var s = { id: p.id, title: p.title, updatedAt: p.updatedAt, currentPhase: p.currentPhase, nodeCount: (p.nodes||[]).length };
      localStorage.setItem('filmgame:project:' + p.id, JSON.stringify(p));
      localStorage.setItem('filmgame:projects:index', JSON.stringify([s]));
      console.log('[inject] ' + p.title + ' 已注入，节点数：' + (p.nodes||[]).length);
      window.location.href = '/project/' + p.id + '/workshop';
    });
})();`

writeFileSync('inject-project.js', injectScript, 'utf8')

console.log(`\n✓ 完成！`)
console.log(`  章数：${chapters.length}  幕数：${acts.length}  节点数：${nodes.length}`)
console.log(`  已填充内容的节点：${fillable.length}`)
console.log(`\n步骤：`)
console.log(`  1. 打开浏览器 http://localhost:3000`)
console.log(`  2. 按 F12 → Console，粘贴 inject-project.js 并回车`)
console.log(`  3. 自动跳转到「量子侦探」项目`)
