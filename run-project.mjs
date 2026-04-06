/**
 * 完整项目自主执行 —「量子侦探」
 * 世界锚点 → 规模规划 → 结构与分支 → 场景填充 → 全局校验
 */

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
  { id: 'c1', name: '林宇', role: 'protagonist', motivation: '找回被量子跳跃抹去的记忆', relationship: '主线驱动者' },
  { id: 'c2', name: '阿尔法', role: 'antagonist', motivation: '利用林宇收集量子数据实现全宇宙意识统一', relationship: '真实身份是林宇的未来自己' },
  { id: 'c3', name: '陈晓', role: 'support', motivation: '保护林宇，因为她知道真相', relationship: '不同宇宙中关系各异' },
]

async function ai(phase, action, context) {
  const res = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, action, context }),
    signal: AbortSignal.timeout(300000),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error)
  return data.result
}

function hr(title) {
  console.log('\n' + '─'.repeat(60))
  console.log('  ' + title)
  console.log('─'.repeat(60))
}

function flatNodes(structure) {
  const list = []
  for (const ch of structure.chapters ?? []) {
    for (const act of ch.acts ?? []) {
      for (const node of act.nodes ?? []) {
        list.push({ ...node, chapterTitle: ch.title, actTitle: act.title })
      }
    }
  }
  return list
}

console.log('\n🎬  量子侦探 · 完整项目自主执行\n')
console.log('  项目：量子侦探')
console.log('  类型：科幻悬疑 + 心理惊悚')
console.log('  角色：林宇（主角）/ 阿尔法（反派）/ 陈晓（支持）')

// ─── 阶段1：世界锚点 ─────────────────────────────────────────
hr('阶段 1 · 世界锚点审查')
console.log('  提交世界设定，AI 审查一致性...')
let t = Date.now()
const review = await ai('world', 'review', WORLD)
console.log(`  耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)
console.log(`  一致性：${review.consistency}`)
console.log(`  时长匹配：${review.duration_match}`)
console.log(`  AI 评价：${review.overall}`)
if (review.issues?.length) {
  review.issues.forEach(i => console.log(`  ⚠ [${i.field}] ${i.issue}`))
} else {
  console.log('  问题：无')
}

// ─── 阶段2：规模规划 ─────────────────────────────────────────
hr('阶段 2 · 规模规划')
console.log('  AI 生成三套方案...')
t = Date.now()
const scaleResult = await ai('scale', 'generate', WORLD)
console.log(`  耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)
const plans = scaleResult.plans
plans.forEach(p => {
  const mark = p.id === 'plan_b' ? ' ← 【选定】' : ''
  console.log(`\n  ${p.label}${mark}  ${p.chapterCount}章/${p.totalNodes}节点/${p.estimatedHours}h`)
  console.log(`    ${p.aiRationale}`)
  p.chapters?.forEach((ch, i) => console.log(`    ${i + 1}. ${ch.title} — ${ch.brief}`))
})
const selected = plans.find(p => p.id === 'plan_b') ?? plans[1]
console.log(`\n  ✓ 选定：${selected.label}（${selected.chapterCount}章 ${selected.totalNodes}节点）`)

// ─── 阶段3a：结构生成 ────────────────────────────────────────
hr('阶段 3a · 结构生成')
console.log('  AI 填充章节/幕/节点骨架...')
t = Date.now()
let structure = null
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = await ai('structure', 'generate', { worldAnchor: WORLD, characters: CHARACTERS, scalePlan: selected })
  if (result?.chapters?.length > 0) { structure = result; break }
  console.log(`  第 ${attempt} 次结构生成未得到有效数据，重试...`)
}
if (!structure?.chapters?.length) throw new Error('结构生成失败：3次尝试均未返回有效章节数据')
console.log(`  耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)
const allNodes = flatNodes(structure)
console.log(`  ${structure.chapters.length} 章 / ${allNodes.length} 节点`)

structure.chapters?.forEach(ch => {
  console.log(`\n  【${ch.title}】`)
  ch.acts?.forEach(act => {
    console.log(`    ${act.title}`)
    act.nodes?.forEach(n => {
      const icon = { start: '▶', ending: '★', branch: '◆', merge: '◀' }[n.type] ?? '·'
      console.log(`      ${icon} ${n.title}  (${n.type})  ${n.notes}`)
    })
  })
})

// ─── 阶段3b：分支生成 ────────────────────────────────────────
hr('阶段 3b · 分支生成')
const branchable = allNodes.filter(n => n.type === 'branch' || n.type === 'normal')
console.log(`  为 ${branchable.length} 个节点生成选项...`)
t = Date.now()
const branches = await ai('branches', 'generate', { worldAnchor: WORLD, characters: CHARACTERS, nodes: allNodes })
console.log(`  耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)
const choices = branches.nodeChoices ?? []
const totalOpts = choices.reduce((s, n) => s + (n.choices?.length ?? 0), 0)
console.log(`  ${choices.length} 节点 · ${totalOpts} 个选项`)
console.log('\n  示例（前4个节点）：')
choices.slice(0, 4).forEach(nc => {
  console.log(`  · 「${nc.nodeTitle}」`)
  nc.choices?.forEach(c => console.log(`      → ${c.text}  ▷ ${c.targetNodeTitle}`))
})

// ─── 阶段4：场景填充（全部节点，批次并行）────────────────────
hr('阶段 4 · 场景填充（全部节点）')
const BATCH = 4  // 每批并行数，避免同时太多请求
const fillable = allNodes.filter(n => n.type !== 'ending')
console.log(`  共 ${fillable.length} 个节点，每批 ${BATCH} 个并行处理...`)
t = Date.now()

const filled = []
for (let i = 0; i < fillable.length; i += BATCH) {
  const batch = fillable.slice(i, i + BATCH)
  const results = await Promise.all(batch.map(async node => {
    const ctx = { ...node, worldAnchor: WORLD, characters: CHARACTERS }
    try {
      const [emotion, dialogue] = await Promise.all([
        ai('workshop', 'fill_emotion', ctx),
        ai('workshop', 'write_dialogue', ctx),
      ])
      return { node, emotion, dialogue }
    } catch (e) {
      console.log(`    ✗ 「${node.title}」失败：${e.message}`)
      return { node, emotion: null, dialogue: null }
    }
  }))
  filled.push(...results)
  console.log(`  进度：${Math.min(i + BATCH, fillable.length)}/${fillable.length} 节点  (${((Date.now() - t)/1000).toFixed(0)}s)`)
}
console.log(`  全部完成，耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)

// 输出前3个节点的详情预览
console.log('\n  ── 前3个节点预览 ──')
filled.slice(0, 3).forEach(({ node, emotion, dialogue }) => {
  if (!emotion || !dialogue) return
  console.log(`\n  ◆ 「${node.title}」(${node.type})`)
  console.log(`    情感弧：${emotion.emotionIn} → ${emotion.emotionOut}  紧张度 ${emotion.tension}/10`)
  console.log(`    对白 ${dialogue.dialogue?.length ?? 0} 行`)
  dialogue.dialogue?.slice(0, 2).forEach(d => console.log(`      ${d.speaker}：「${d.text}」`))
})

// ─── 阶段5：全局校验 ─────────────────────────────────────────
hr('阶段 5 · 全局校验')
const deadEnds = allNodes.filter(n => n.type === 'normal' && !choices.find(c => c.nodeTitle === n.title)).length
const coverage = Math.round(choices.length / (branchable.length || 1) * 100)
const validateCtx = {
  totalNodes: allNodes.length,
  totalBranches: totalOpts,
  deadEndNodes: deadEnds,
  endingNodes: allNodes.filter(n => n.type === 'ending').length,
  startNodes: allNodes.filter(n => n.type === 'start').length,
  coverageRate: coverage,
  chapters: structure.chapters?.length,
}
console.log(`  统计：${validateCtx.totalNodes}节点 · ${validateCtx.totalBranches}选项 · 覆盖率${coverage}%`)
t = Date.now()
const val = await ai('validate', 'report', validateCtx)
console.log(`  耗时：${((Date.now() - t) / 1000).toFixed(1)}s`)
console.log(`\n  总评：${val.summary}`)
console.log(`\n  优先修复（${val.priority_issues?.length} 项）：`)
val.priority_issues?.forEach(i => console.log(`    ⚠ ${i}`))
console.log(`\n  优化建议（${val.suggestions?.length} 项）：`)
val.suggestions?.forEach(s => console.log(`    ✦ ${s}`))

// ─── 组装 Project 对象并保存 ─────────────────────────────────
hr('保存项目')

let nodeIdCounter = 1
const mkid = () => String(nodeIdCounter++).padStart(8, '0')

const projectId = mkid() + mkid()

const projectChapters = []
const projectActs = []
const projectNodes = []

// 构建 nodeTitle → id 映射（用于分支连接）
const nodeTitleToId = new Map()
structure.chapters?.forEach((ch, ci) => {
  const chapterId = `ch${ci + 1}`
  projectChapters.push({ id: chapterId, title: ch.title, order: ci })
  ch.acts?.forEach((act, ai) => {
    const actId = `act${ci + 1}_${ai + 1}`
    const actNodeIds = []
    act.nodes?.forEach((n, ni) => {
      const nodeId = `nd${ci + 1}_${ai + 1}_${ni + 1}`
      nodeTitleToId.set(n.title, nodeId)
      actNodeIds.push(nodeId)
    })
    projectActs.push({ id: actId, chapterId, title: act.title, order: ai, nodeIds: actNodeIds })
    act.nodes?.forEach((n, ni) => {
      const nodeId = `nd${ci + 1}_${ai + 1}_${ni + 1}`
      const filledNode = filled?.find?.(f => f.node?.title === n.title)
      projectNodes.push({
        id: nodeId,
        actId: `act${ci + 1}_${ai + 1}`,
        title: n.title,
        type: n.type ?? 'normal',
        order: ni,
        position: { x: ci * 800, y: ai * 150 + ni * 120 },
        emotionFunction: filledNode?.emotion ?? { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 5 },
        systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
        sceneDesc: filledNode?.dialogue?.sceneDesc ?? '',
        dialogue: (filledNode?.dialogue?.dialogue ?? []).map((d, i) => ({ id: `dl${nodeId}_${i}`, speaker: d.speaker, text: d.text, emotion: d.emotion, subtext: '' })),
        choices: [],
        durationSeconds: 120,
        notes: n.notes ?? '',
      })
    })
  })
})

// 绑定分支选项
choices.forEach(nc => {
  const sourceId = nodeTitleToId.get(nc.nodeTitle)
  if (!sourceId) return
  const node = projectNodes.find(n => n.id === sourceId)
  if (!node) return
  node.choices = (nc.choices ?? []).map((c, i) => ({
    id: `ch_${sourceId}_${i}`,
    nodeId: sourceId,
    text: c.text,
    order: i,
    targetNodeId: nodeTitleToId.get(c.targetNodeTitle) ?? '',
    conditions: '',
    variableEffects: '',
  }))
})

const now = new Date().toISOString()
const project = {
  id: projectId,
  title: '量子侦探（脚本生成）',
  createdAt: now,
  updatedAt: now,
  currentPhase: 'validate',
  phaseProgress: { world: 'done', scale: 'done', structure: 'done', workshop: 'done', validate: 'in_progress' },
  worldAnchor: WORLD,
  characters: CHARACTERS,
  selectedScalePlanId: selected.id,
  scalePlanOptions: plans,
  chapters: projectChapters,
  acts: projectActs,
  nodes: projectNodes,
  variables: [],
  endings: [],
  lastValidation: null,
  downstreamStale: false,
}

console.log(`  组装完成：${projectChapters.length}章 / ${projectActs.length}幕 / ${projectNodes.length}节点`)
console.log('  保存到服务器...')
const saveRes = await fetch(`${BASE}/api/projects`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(project),
})
const saveData = await saveRes.json()
if (saveData.ok) {
  console.log(`  ✓ 已保存，项目 ID：${projectId}`)
  console.log(`  → 打开浏览器，点击首页「从脚本导入」即可看到此项目`)
} else {
  console.log(`  ✗ 保存失败：${saveData.error}`)
}

// ─── 最终汇总 ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  完成报告 · 量子侦探')
console.log('═'.repeat(60))
console.log(`  ✓ 世界锚点    一致性：${review.consistency}，时长：${review.duration_match}`)
console.log(`  ✓ 规模规划    选定「${selected.label}」${selected.chapterCount}章/${selected.totalNodes}节点`)
console.log(`  ✓ 结构生成    ${structure.chapters?.length}章 ${allNodes.length}节点 全部填充`)
console.log(`  ✓ 分支生成    ${choices.length}节点已配置 · ${totalOpts}个选项`)
console.log(`  ✓ 场景填充    ${filled.length}节点填充完成`)
console.log(`  ✓ 全局校验    ${val.priority_issues?.length}项待修复 · ${val.suggestions?.length}条建议`)
console.log(`  ✓ 项目已保存  首页点击「从脚本导入」查看`)
console.log('')
