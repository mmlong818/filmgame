/**
 * 影游设计工具全流程测试脚本
 * 使用真实测试项目「量子侦探」，逐步测试每个阶段
 */

const BASE = 'http://localhost:3000'

// ─── 测试项目数据 ───────────────────────────────────────────────
const WORLD_ANCHOR = {
  storyCore: '一名失忆的量子物理学家在平行宇宙间穿梭，试图找回自己的记忆，却发现每一个"自己"都做出了截然不同的选择。',
  theme: '身份与选择——如果你可以看到所有可能的自己，你还知道自己是谁吗？',
  genre: '科幻悬疑 + 心理惊悚',
  worldRules: '1. 量子跳跃每次消耗记忆片段，跳跃越多遗忘越多\n2. 同一宇宙中不能有两个自己同时存在超过72小时\n3. 死亡在当前宇宙是永久的，但在其他宇宙的分身仍然存活',
  durationMinutes: 90,
  endingCount: 3,
}

const CHARACTERS = [
  { id: 'c1', name: '林宇', role: 'protagonist', motivation: '找回被量子跳跃抹去的记忆，回到"正确"的宇宙', relationship: '主线驱动者，每次跳跃都失去一部分自己' },
  { id: 'c2', name: '阿尔法', role: 'antagonist', motivation: '利用林宇的跳跃能力收集所有宇宙的量子数据，实现"全宇宙意识统一"', relationship: '真实身份是林宇在某个宇宙的未来自己' },
  { id: 'c3', name: '陈晓', role: 'support', motivation: '保护林宇，因为她知道他的真实身份会改变一切', relationship: '不同宇宙中与林宇的关系各不相同（同事/情人/陌生人）' },
]

const SCALE_PLAN = {
  id: 'plan_b',
  label: '标准版',
  chapterCount: 3,
  actCountPerChapter: 3,
  totalNodes: 25,
  totalBranches: 15,
  estimatedHours: 120,
  aiRationale: '三章结构完整呈现量子跳跃的三个关键宇宙，节点数量足够体现分支复杂度',
  chapters: [
    { title: '第一章：碎片', brief: '林宇在第一个宇宙醒来，发现自己失忆，开始调查' },
    { title: '第二章：镜像', brief: '跳跃至第二个宇宙，遭遇另一个自己，真相开始浮现' },
    { title: '第三章：归零', brief: '最终宇宙，面对阿尔法揭露身份，走向三种结局' },
  ],
}

// ─── 工具函数 ───────────────────────────────────────────────────
async function callAI(phase, action, context) {
  const res = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, action, context }),
  })
  return res.json()
}

function score(label, checks) {
  const passed = checks.filter(Boolean).length
  const total = checks.length
  const pct = Math.round((passed / total) * 100)
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  console.log(`  ${bar} ${pct}% (${passed}/${total}) — ${label}`)
  return { passed, total, pct }
}

function section(title) {
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(55))
}

// ─── 主测试流程 ─────────────────────────────────────────────────
async function runTests() {
  const results = []
  console.log('\n🧪 影游设计工具全流程测试 —「量子侦探」项目\n')

  // ─── 阶段1：世界锚点 ────────────────────────────────────────
  section('阶段 1/5：世界锚点')
  console.log('  调用：world:review ...')

  let worldScore = { passed: 0, total: 0, pct: 0 }
  try {
    const t0 = Date.now()
    const data = await callAI('world', 'review', WORLD_ANCHOR)
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms`)

    if (!data.ok) throw new Error(data.error)
    const r = data.result
    console.log(`  AI 返回：consistency=${r?.consistency}, duration_match=${r?.duration_match}`)
    console.log(`  评价：${r?.overall}`)

    worldScore = score('世界锚点', [
      data.ok === true,
      typeof r?.consistency === 'string',
      Array.isArray(r?.issues),
      typeof r?.overall === 'string' && r.overall.length > 5,
      typeof r?.duration_match === 'string',
      ms < 60000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    worldScore = score('世界锚点', [false, false, false, false, false, false])
  }
  results.push({ name: '世界锚点', ...worldScore })

  // ─── 阶段2：规模规划 ────────────────────────────────────────
  section('阶段 2/5：规模规划')
  console.log('  调用：scale:generate ...')

  let scaleResult = null
  let scaleScore = { passed: 0, total: 0, pct: 0 }
  try {
    const t0 = Date.now()
    const data = await callAI('scale', 'generate', WORLD_ANCHOR)
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms`)

    if (!data.ok) throw new Error(data.error)
    const plans = data.result?.plans
    scaleResult = plans
    console.log(`  生成方案数：${plans?.length}`)
    plans?.forEach(p => console.log(`  · ${p.label}：${p.chapterCount}章 / ${p.totalNodes}节点 / ${p.estimatedHours}h — 含章节大纲：${Array.isArray(p.chapters) ? '是(' + p.chapters.length + '章)' : '否'}`))

    scaleScore = score('规模规划', [
      data.ok === true,
      Array.isArray(plans) && plans.length === 3,
      plans?.[0]?.id === 'plan_a',
      plans?.[1]?.id === 'plan_b',
      plans?.[2]?.id === 'plan_c',
      plans?.every(p => p.chapterCount > 0 && p.totalNodes > 0),
      plans?.every(p => Array.isArray(p.chapters) && p.chapters.length === p.chapterCount),
      ms < 60000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    scaleScore = score('规模规划', [false, false, false, false, false, false, false, false])
  }
  results.push({ name: '规模规划', ...scaleScore })

  // ─── 阶段3a：结构生成 ───────────────────────────────────────
  section('阶段 3/5：结构与分支（第1步 结构生成）')
  console.log('  调用：structure:generate ...')

  let structureNodes = []
  let structureScore = { passed: 0, total: 0, pct: 0 }
  try {
    const t0 = Date.now()
    const data = await callAI('structure', 'generate', {
      worldAnchor: WORLD_ANCHOR,
      scalePlan: SCALE_PLAN,
      characters: CHARACTERS,
    })
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms`)

    if (!data.ok) throw new Error(data.error)
    const chapters = data.result?.chapters
    const totalActs = chapters?.reduce((s, c) => s + (c.acts?.length ?? 0), 0) ?? 0
    const totalNodes = chapters?.reduce((s, c) =>
      s + c.acts?.reduce((a, act) => a + (act.nodes?.length ?? 0), 0) ?? 0, 0) ?? 0

    console.log(`  章数：${chapters?.length}（期望 ${SCALE_PLAN.chapterCount}）`)
    console.log(`  总幕数：${totalActs}（期望 ${SCALE_PLAN.chapterCount * SCALE_PLAN.actCountPerChapter}）`)
    console.log(`  总节点：${totalNodes}（期望 ~${SCALE_PLAN.totalNodes}）`)
    chapters?.forEach(ch => console.log(`  · ${ch.title}：${ch.acts?.length}幕`))

    // 收集节点用于分支测试
    chapters?.forEach(ch => ch.acts?.forEach(act => act.nodes?.forEach(n => structureNodes.push({ id: 'n_' + structureNodes.length, title: n.title, type: n.type }))))

    structureScore = score('结构生成', [
      data.ok === true,
      Array.isArray(chapters),
      chapters?.length === SCALE_PLAN.chapterCount,
      totalActs >= SCALE_PLAN.chapterCount * SCALE_PLAN.actCountPerChapter - 1,
      totalNodes >= SCALE_PLAN.totalNodes * 0.7,
      structureNodes.some(n => n.type === 'start'),
      structureNodes.some(n => n.type === 'ending'),
      ms < 120000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    structureScore = score('结构生成', [false, false, false, false, false, false, false, false])
  }
  results.push({ name: '结构生成', ...structureScore })

  // ─── 阶段3b：分支生成 ───────────────────────────────────────
  section('阶段 3/5：结构与分支（第2步 分支生成）')
  console.log(`  使用节点数：${structureNodes.length}`)
  console.log('  调用：branches:generate ...')

  let branchScore = { passed: 0, total: 0, pct: 0 }
  try {
    const t0 = Date.now()
    const data = await callAI('branches', 'generate', {
      worldAnchor: WORLD_ANCHOR,
      characters: CHARACTERS,
      nodes: structureNodes,
    })
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms`)

    if (!data.ok) throw new Error(data.error)
    const nodeChoices = data.result?.nodeChoices
    const totalChoices = nodeChoices?.reduce((s, nc) => s + (nc.choices?.length ?? 0), 0) ?? 0
    const branchNodes = nodeChoices?.filter(nc => nc.choices?.length >= 2)

    console.log(`  有分支的节点数：${nodeChoices?.length}`)
    console.log(`  总选项数：${totalChoices}`)
    console.log(`  多选节点（≥2个选项）：${branchNodes?.length}`)
    nodeChoices?.slice(0, 3).forEach(nc => console.log(`  · ${nc.nodeTitle} → ${nc.choices?.map(c => c.text).join(' / ')}`))

    const validTargets = nodeChoices?.every(nc =>
      nc.choices?.every(c => structureNodes.some(n => n.title === c.targetNodeTitle))
    )

    branchScore = score('分支生成', [
      data.ok === true,
      Array.isArray(nodeChoices) && nodeChoices.length > 0,
      totalChoices >= 5,
      branchNodes?.length >= 2,
      validTargets === true,
      ms < 120000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    branchScore = score('分支生成', [false, false, false, false, false, false])
  }
  results.push({ name: '分支生成', ...branchScore })

  // ─── 阶段4：场景填充 ────────────────────────────────────────
  section('阶段 4/5：场景填充')

  const testNode = { id: 'n0', title: '量子跳跃', type: 'branch', notes: '林宇第一次激活量子跳跃装置', actId: 'a1', order: 0, choices: [], dialogue: [], durationSeconds: 120, emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 5 }, systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' }, position: { x: 0, y: 0 } }

  let workshopScore = { passed: 0, total: 0, pct: 0 }
  try {
    console.log('  调用：workshop:fill_emotion ...')
    const t0 = Date.now()
    const [eData, dData] = await Promise.all([
      callAI('workshop', 'fill_emotion', { node: testNode, worldAnchor: WORLD_ANCHOR, characters: CHARACTERS }),
      callAI('workshop', 'write_dialogue', { node: testNode, worldAnchor: WORLD_ANCHOR, characters: CHARACTERS }),
    ])
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms（并行）`)

    const emotion = eData.result
    const dialogue = dData.result?.dialogue
    console.log(`  情感函数：进入=${emotion?.emotionIn} → 离开=${emotion?.emotionOut}，紧张度=${emotion?.tension}`)
    console.log(`  对白行数：${dialogue?.length}`)
    dialogue?.slice(0, 2).forEach(l => console.log(`  · ${l.speaker}：${l.text}`))

    const speakerNames = [...new Set(dialogue?.map(l => l.speaker))]
    const usesCharacter = speakerNames.some(name => CHARACTERS.some(c => c.name === name))

    workshopScore = score('场景填充', [
      eData.ok && dData.ok,
      typeof emotion?.emotionIn === 'string' && emotion.emotionIn.length > 0,
      typeof emotion?.tension === 'number',
      Array.isArray(dialogue) && dialogue.length >= 3,
      dialogue?.every(l => l.speaker && l.text),
      usesCharacter,
      ms < 120000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    workshopScore = score('场景填充', [false, false, false, false, false, false, false])
  }
  results.push({ name: '场景填充', ...workshopScore })

  // ─── 阶段5：全局校验 ────────────────────────────────────────
  section('阶段 5/5：全局校验')

  // 构造一个有问题的项目测试校验引擎
  const mockReport = {
    generatedAt: new Date().toISOString(),
    totalNodes: 25,
    totalBranches: 15,
    issues: [
      { id: 'i1', level: 'error', code: 'DEAD_END', message: '节点"绝望时刻"没有任何出口', relatedIds: ['n5'] },
      { id: 'i2', level: 'warning', code: 'NO_ENDING', message: '第二章没有结局节点', relatedIds: ['c2'] },
    ],
    passRate: 72,
  }

  let validateScore = { passed: 0, total: 0, pct: 0 }
  try {
    console.log('  调用：validate:report ...')
    const t0 = Date.now()
    const data = await callAI('validate', 'report', mockReport)
    const ms = Date.now() - t0
    console.log(`  响应时间：${ms}ms`)

    if (!data.ok) throw new Error(data.error)
    const s = data.result
    console.log(`  AI 总评：${s?.summary?.slice(0, 80)}...`)
    console.log(`  优先修复项：${s?.priority_issues?.length}条`)
    console.log(`  优化建议：${s?.suggestions?.length}条`)

    validateScore = score('全局校验', [
      data.ok === true,
      typeof s?.summary === 'string' && s.summary.length > 10,
      Array.isArray(s?.priority_issues) && s.priority_issues.length > 0,
      Array.isArray(s?.suggestions) && s.suggestions.length > 0,
      ms < 60000,
    ])
  } catch (e) {
    console.log(`  ❌ 失败：${e.message}`)
    validateScore = score('全局校验', [false, false, false, false, false])
  }
  results.push({ name: '全局校验', ...validateScore })

  // ─── 最终报告 ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55))
  console.log('  测试结果汇总')
  console.log('═'.repeat(55))

  let totalPassed = 0, totalChecks = 0
  results.forEach(r => {
    const stars = r.pct >= 90 ? '⭐' : r.pct >= 70 ? '✅' : r.pct >= 50 ? '⚠️ ' : '❌'
    console.log(`  ${stars} ${r.name.padEnd(12)} ${String(r.pct).padStart(3)}%  (${r.passed}/${r.total})`)
    totalPassed += r.passed
    totalChecks += r.total
  })

  const overall = Math.round((totalPassed / totalChecks) * 100)
  console.log('\n' + '─'.repeat(55))
  console.log(`  总体通过率：${overall}%  (${totalPassed}/${totalChecks} 项检查)`)
  console.log('═'.repeat(55) + '\n')
}

runTests().catch(e => {
  console.error('测试脚本崩溃：', e.message)
  process.exit(1)
})
