/**
 * gen-project.mjs — 完整五阶段流程生成一个项目
 * 用法: node scripts/gen-project.mjs
 *
 * 阶段顺序：world → scale → structure → workshop(fill+write+refine) → validate
 * 输出到 data/projects/{id}.json
 */

import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dir, '../data/projects')
mkdirSync(DATA_DIR, { recursive: true })

function nanoid(n = 8) { return randomBytes(n).toString('base64url').slice(0, n) }
function ts() { return new Date().toISOString() }

// ── Claude CLI ────────────────────────────────────────────────────

const RETRY = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

function callClaude(prompt, label = '') {
  for (let i = 0; i < 3; i++) {
    if (label) process.stdout.write(i === 0 ? `  ${label}...` : ` ↻`)
    const r = spawnSync('claude', ['--print', '--output-format', 'text'], {
      input: i === 0 ? prompt : prompt + RETRY,
      encoding: 'utf8', shell: true, timeout: 300_000, maxBuffer: 20 * 1024 * 1024,
    })
    if (r.error) throw r.error
    const parsed = extractJson(r.stdout || '')
    if (!isFallback(parsed)) { if (label) process.stdout.write(' ✓\n'); return parsed }
  }
  if (label) process.stdout.write(' ✗\n')
  return null
}

function extractJson(text) {
  const t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try { const i = JSON.parse(t); if (typeof i === 'string') return JSON.parse(i) } catch {}
  }
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) { try { return JSON.parse(block[1].trim()) } catch {} }
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)) } catch {} }
  const as = t.indexOf('['), ae = t.lastIndexOf(']')
  if (as !== -1 && ae > as) { try { return JSON.parse(t.slice(as, ae + 1)) } catch {} }
  return { raw: t }
}

function isFallback(j) { return typeof j === 'object' && j !== null && 'raw' in j }

// ── 故事前提（固定输入，让AI充分发展） ───────────────────────────

const PREMISE = {
  title: '替罪',
  idea: `一位专注死刑复审的律师顾晚，花了五年时间为死刑犯沈明平申诉。
就在胜诉前夕，她发现了一条新证据——它不仅能证明沈明平无罪，
还能证明真正的凶手是本市最受尊敬的慈善家、她的恩师邱建国。
邱建国不仅是她法律生涯的奠基人，还是她父亲下岗后唯一伸出援手的人。
如果她公开证据，沈明平获救，恩师入狱，自己的法律资质也将因"利益冲突"被吊销。
如果她销毁证据，一个无辜的人将被执行死刑，而她将成为这个系统最深处的共谋。`,
}

// ── Phase 1: World Anchor ─────────────────────────────────────────

function genWorldAnchor() {
  const prompt = `你是顶级互动影游编剧顾问。根据以下故事前提，生成一份完整的世界锚点设定并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事前提】
${PREMISE.idea}

【世界锚点要求】
- storyCore：50-80字，包含"主角想要什么 + 什么在阻碍 + 核心道德困境"三要素
- theme：核心主题，一个值得互动体验的道德问题，不超过30字
- genre：2-3个类型标签
- worldRules：3-4条规则，每条都是"逼迫角色做出艰难选择"的叙事引擎
- durationMinutes：建议游戏时长（60-120分钟）
- endingCount：建议结局数量（3-5个）

【输出模板】字段名固定：
{"storyCore":"...","theme":"...","genre":"...","worldRules":"1. ...\n2. ...\n3. ...","durationMinutes":90,"endingCount":4}

输出：`

  return callClaude(prompt, 'Phase 1: 世界锚点')
}

// ── Phase 2: Characters ───────────────────────────────────────────

function genCharacters(worldAnchor) {
  const prompt = `你是Robert McKee级别的角色设计师。根据以下世界设定，生成主要角色档案并输出JSON数组。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事前提】${PREMISE.idea}
【世界设定】
${JSON.stringify(worldAnchor, null, 2)}

【角色设计要求】
- 设计3-5个主要角色（包括主角、对立力量、配角）
- 每个角色必须有McKee四维：wound（塑造一切防御的核心创伤）、lie（角色信以为真的错误信念）、want（外部目标）、need（真正需要但正在抗拒的成长）
- 角色之间的关系必须能产生叙事张力和道德复杂性
- role字段只能是：protagonist / antagonist / ally / foil / catalyst

【输出模板】JSON数组，字段名固定：
[{"id":"c_1","name":"角色全名","role":"protagonist","motivation":"核心动机一句话","relationship":"与主线和其他角色的关系","wound":"塑造了他一切防御的核心创伤事件","lie":"他对自己或世界的错误信念","want":"此故事中明确追求的外部目标","need":"他不愿承认但真正缺少的内心成长"}]

输出：`

  return callClaude(prompt, 'Phase 2: 角色设计')
}

// ── Phase 3: Scale Plan ───────────────────────────────────────────

function genScalePlan(worldAnchor) {
  const prompt = `你是互动影游制作人。根据以下世界设定生成标准版规模方案并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【世界设定】
${JSON.stringify(worldAnchor, null, 2)}

【要求】生成标准版（不要生成多套），3章3幕，总节点22-26个，4个结局。
chapters数组长度必须等于chapterCount，节点数随规模合理分配。

【输出模板】字段名固定：
{"id":"plan_b","label":"标准版","chapterCount":3,"actCountPerChapter":3,"totalNodes":24,"totalBranches":12,"estimatedHours":100,"aiRationale":"推荐方案理由","chapters":[{"title":"第一章：章名","brief":"章节核心冲突一句话"},{"title":"第二章：章名","brief":"..."},{"title":"第三章：章名","brief":"..."}]}

输出：`

  return callClaude(prompt, 'Phase 3: 规模规划')
}

// ── Phase 4: Structure (nodes) ────────────────────────────────────

function genStructure(worldAnchor, scalePlan, characters) {
  const chapterCount = scalePlan.chapterCount ?? 3
  const actCount = scalePlan.actCountPerChapter ?? 3
  const totalNodes = scalePlan.totalNodes ?? 24
  const endingCount = worldAnchor.endingCount ?? 4
  const nodesPerAct = Math.max(2, Math.round(totalNodes / (chapterCount * actCount)))
  const chapterOutline = scalePlan.chapters ?? []

  const charNames = (characters ?? []).map(c => c.name).join('、')

  const prompt = `你是专业互动剧本结构师。根据以下设定，生成完整的叙事结构（所有章节、幕、节点）并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事前提】${PREMISE.idea}
【世界设定】
故事核：${worldAnchor.storyCore}
主题：${worldAnchor.theme}
类型：${worldAnchor.genre}
世界规则：${worldAnchor.worldRules}
【角色】${charNames}
【结局数量】${endingCount}个
【章节大纲】
${chapterOutline.map((c, i) => `第${i+1}章《${c.title}》：${c.brief}`).join('\n')}

【结构要求】
- 共${chapterCount}章，每章${actCount}幕，每幕约${nodesPerAct}个节点
- 第一幕第一节点类型必须是"start"
- 最后一章需要包含${endingCount}个"ending"类型节点（代表不同结局）
- branch节点之后必须有不同的节点路径，体现互动分叉
- 每个节点必须有title（15字内）、type、notes（核心冲突描述）、dramaticFunction
- dramaticFunction只能是：setup/conflict/turn/resolution
- type只能是：start/normal/branch/ending/merge/explore
- choices字段：branch节点必须有2-4个选择，每个选择必须有text（≤10字）和targetNodeId（暂填"TBD_序号"）
- 节点排序必须遵循叙事逻辑，从建置到高潮到多结局

【输出模板】：
{"chapters":[{"id":"ch1","title":"第一章标题","acts":[{"id":"act1_1","title":"第一幕标题","dramaticFunction":"setup","nodes":[{"id":"n_001","title":"节点标题","type":"start","order":1,"notes":"核心冲突","dramaticFunction":"setup","choices":[]}]}]}]}

注意：所有节点id必须唯一，格式为n_001/n_002...，choices中的targetNodeId暂填"TBD_X"

输出：`

  return callClaude(prompt, 'Phase 4: 叙事结构')
}

// ── Phase 5a: Workshop — fill_emotion ──────────────────────────────

function fillEmotion(node, worldAnchor, characters) {
  const prompt = `你是精通角色心理学的编剧，为互动影游节点设计深层情感状态并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore}
【主题】${worldAnchor.theme}
【角色】${(characters||[]).map(c=>`${c.name}（${c.role}）：${c.motivation}`).join('；')}

【节点】标题：${node.title}  类型：${node.type}  戏剧功能：${node.dramaticFunction}
创作备注：${node.notes}

【原则】外部行为与内心必须有张力；internal_lie是角色保护自己的谎言；fear是心理层面的恐惧
【输出】{"emotionIn":"...","emotionOut":"...","playerEmotion":"...","tension":7,"internal_lie":"...","fear":"..."}

输出：`
  return callClaude(prompt)
}

// ── Phase 5b: Workshop — write_dialogue ───────────────────────────

function writeDialogue(node, worldAnchor, characters, variables) {
  const ef = node.emotionFunction ?? {}
  const charProfiles = (characters||[]).map(ch => [
    `${ch.name}（${ch.role}）`,
    `  伤痛：${ch.wound ?? '推断'}`,
    `  谎言：${ch.lie ?? '推断'}`,
    `  想要：${ch.want ?? ch.motivation}`,
    `  需要：${ch.need ?? '推断'}`,
  ].join('\n')).join('\n\n')

  const choiceCtx = (node.choices||[]).length > 0
    ? `\n【玩家将面临的选择——对白必须为此积蓄张力】\n${(node.choices||[]).map((c,i)=>`${i+1}. "${c.text}"`).join('\n')}`
    : ''

  const prompt = `你是Robert McKee级别的编剧，为互动影游创作关键场景并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore}
【主题】${worldAnchor.theme}——所有对白都必须在某个层面回应这个主题
【类型】${worldAnchor.genre}
【世界规则】${worldAnchor.worldRules}

【角色心理档案】
${charProfiles}

【当前节点】
标题：${node.title}  类型：${node.type}  戏剧功能：${node.dramaticFunction}
进入情绪：${ef.emotionIn ?? '未设定'}  离开情绪：${ef.emotionOut ?? '未设定'}
内心谎言：${ef.internal_lie ?? '推断'}  当前恐惧：${ef.fear ?? '推断'}
紧张度：${ef.tension ?? 5}/10
创作备注：${node.notes}${choiceCtx}

【McKee铁律】
1. 对白即行动——每句话是战术行为，禁止说出真实想法
2. 权力必须至少转移一次（通过具体一句台词实现）
3. 至少一角色说出与真实想法相反的话
4. 两角色说话节奏绝对不同（短句/长句，直接/迂回）
5. 禁止直陈情绪，用行为细节体现
6. 最后一行必须留钩，不能给情感闭合
7. sceneDesc只写摄影机可见的动作和空间，揭示权力关系

【输出】对白必须6-10行，不能少于6行：
{"sceneDesc":"摄影机语言2-3句，含权力关系和身体动作","dialogue":[{"speaker":"角色完整名","text":"台词（战术行为）","emotion":"外在情绪1-2词","subtext":"真实意图，与text形成反差"}]}

输出：`
  return callClaude(prompt)
}

// ── Phase 5c: Refine thin nodes ───────────────────────────────────

function sceneAnalysis(node, worldAnchor) {
  const dl = node.dialogue ?? []
  const dlText = dl.map((l,i)=>`${i+1}. ${l.speaker}："${l.text}"${l.subtext?`（潜台词：${l.subtext}）`:''}`).join('\n')
  const prompt = `你是资深剧本编辑，诊断对白问题并输出JSON。
禁止JSON以外内容，禁止Markdown代码块。

【故事核】${worldAnchor.storyCore}  【主题】${worldAnchor.theme}
【节点】${node.title}（${node.type}）
【对白共${dl.length}行】
${dlText || '（无对白）'}

【输出】{"working":"有效部分","issues":[{"line":"问题台词","problem":"原因","fix":"修改建议"}],"killer_line":"建议台词"}
输出：`
  return callClaude(prompt)
}

function reviseDialogue(node, critique, worldAnchor, characters) {
  const dl = node.dialogue ?? []
  const charProfiles = (characters||[]).map(c=>`${c.name}：伤痛="${c.wound??'推断'}"，谎言="${c.lie??'推断'}"，想要="${c.want??c.role}"，需要="${c.need??'推断'}"`).join('\n')
  const issues = (critique.issues??[]).map((x,i)=>`${i+1}. "${x.line}" → ${x.problem} → 修改：${x.fix}`).join('\n')

  const prompt = `你是Robert McKee级别编剧，修订问题对白写出第二稿并输出JSON。
禁止JSON以外内容，禁止Markdown代码块。

【故事核】${worldAnchor.storyCore}  【主题】${worldAnchor.theme}
【角色】${charProfiles}
【节点】${node.title}（${node.type}）  备注：${node.notes}
【第一稿${dl.length}行】
${dl.map((l,i)=>`${i+1}. ${l.speaker}："${l.text}"`).join('\n')||'（空）'}
【批注】${issues||'行数不足，需扩写至6行以上'}
${critique.killer_line?`【推荐台词】${critique.killer_line}`:''}

【铁律】最终≥6行；行行是战术行为；权力转移≥1次；至少1角色说反话；节奏可区分；末行留钩；sceneDesc≥80字符
【输出】{"sceneDesc":"...","dialogue":[{"speaker":"...","text":"...","emotion":"...","subtext":"..."}]}
输出：`
  return callClaude(prompt)
}

// ── Phase 6: Director Review ──────────────────────────────────────

function directorReview(project) {
  const sampleNodes = project.nodes
    .filter(n => n.dialogue?.length >= 4)
    .sort((a, b) => (b.emotionFunction?.tension ?? 0) - (a.emotionFunction?.tension ?? 0))
    .slice(0, 6)

  const nodeSamples = sampleNodes.map(n => ({
    title: n.title, type: n.type,
    tension: n.emotionFunction?.tension,
    dialogueCount: n.dialogue?.length,
    sample: n.dialogue?.slice(0, 3).map(d => `${d.speaker}："${d.text}"`).join(' / '),
  }))

  const prompt = `你是由五位顶级专家组成的评审团，对这部互动影游进行终审并输出JSON。
禁止JSON以外内容，禁止Markdown代码块，字段名必须与模板完全一致。

【项目】${project.title}
【故事核】${project.worldAnchor.storyCore}
【主题】${project.worldAnchor.theme}
【类型】${project.worldAnchor.genre}
【规模】${project.nodes.length}个节点，${project.characters?.length ?? 0}个角色，${project.worldAnchor.endingCount}个结局
【高张力节点样本】
${JSON.stringify(nodeSamples, null, 2)}

【评审团】
1. 情感导演（斯皮尔伯格视角）：情感共鸣和观众体验
2. 结构大师（麦基视角）：故事结构和对白质量
3. 体验设计师（乔布斯视角）：互动设计和用户旅程
4. 心理分析师：角色深度和心理真实性
5. 目标受众代表：可重玩性和情感冲击力

每位专家给出：score(0-10)、observation(1句具体观察)、note(1个可执行改进建议)

【输出模板】字段名固定：
{"overallScore":8,"greenlit":true,"mustFix":[],"experts":[{"role":"情感导演","score":8,"observation":"...","note":"..."},{"role":"结构大师","score":8,"observation":"...","note":"..."},{"role":"体验设计师","score":7,"observation":"...","note":"..."},{"role":"心理分析师","score":8,"observation":"...","note":"..."},{"role":"受众代表","score":8,"observation":"...","note":"..."}]}

输出：`
  return callClaude(prompt, 'Phase 6: 五专家终审')
}

// ── 工具：展平结构为节点列表 ─────────────────────────────────────

function flattenNodes(structure) {
  const nodes = []
  let order = 1
  for (const ch of (structure.chapters ?? [])) {
    for (const act of (ch.acts ?? [])) {
      for (const node of (act.nodes ?? [])) {
        nodes.push({
          ...node,
          id: node.id ?? `n_${String(order).padStart(3,'0')}`,
          order: order++,
          chapterId: ch.id,
          actId: act.id,
          dialogue: node.dialogue ?? [],
          choices: (node.choices ?? []).map(c => ({ ...c, id: nanoid(6) })),
        })
      }
    }
  }
  return nodes
}

// ── 主流程 ────────────────────────────────────────────────────────

console.log(`\n${'█'.repeat(60)}`)
console.log(`  FILMGAME — 完整五阶段项目生成`)
console.log(`  《${PREMISE.title}》`)
console.log(`${'█'.repeat(60)}\n`)

// Phase 1
const worldAnchor = genWorldAnchor()
if (!worldAnchor) { console.error('Phase 1 失败'); process.exit(1) }
console.log(`  → 故事核: ${worldAnchor.storyCore?.slice(0, 60)}...`)

// Phase 2
const characters = genCharacters(worldAnchor)
if (!characters || !Array.isArray(characters)) { console.error('Phase 2 失败'); process.exit(1) }
console.log(`  → 角色: ${characters.map(c => c.name).join('、')}`)

// Phase 3
const scalePlan = genScalePlan(worldAnchor)
if (!scalePlan) { console.error('Phase 3 失败'); process.exit(1) }
console.log(`  → 规模: ${scalePlan.chapterCount}章 ${scalePlan.actCountPerChapter}幕/章 预计${scalePlan.totalNodes}节点`)

// Phase 4
const structure = genStructure(worldAnchor, scalePlan, characters)
if (!structure) { console.error('Phase 4 失败'); process.exit(1) }
const rawNodes = flattenNodes(structure)
console.log(`  → 结构: 共${rawNodes.length}个节点`)

// Phase 5: Workshop
console.log(`\n【Workshop — 生成对白内容】`)
const nodes = rawNodes
for (let i = 0; i < nodes.length; i++) {
  const node = nodes[i]
  const label = `[${i+1}/${nodes.length}] ${node.title}（${node.type}）`
  process.stdout.write(`  ${label} `)

  try {
    const ef = fillEmotion(node, worldAnchor, characters)
    if (ef && !isFallback(ef)) node.emotionFunction = ef

    const dl = writeDialogue(node, worldAnchor, characters, [])
    if (dl && !isFallback(dl)) {
      if (dl.dialogue) node.dialogue = dl.dialogue.map(d => ({ ...d, id: nanoid(6) }))
      if (dl.sceneDesc) node.sceneDesc = dl.sceneDesc
    }
    process.stdout.write(`✓ ${node.dialogue?.length ?? 0}行\n`)
  } catch(e) {
    process.stdout.write(`✗ ${e.message}\n`)
  }
}

// Pass 2: 精修
const thin = nodes.filter(n => n.type !== 'ending' && (n.dialogue?.length ?? 0) < 6)
if (thin.length > 0) {
  console.log(`\n【精修 ${thin.length} 个瘦节点】`)
  for (let i = 0; i < thin.length; i++) {
    const node = thin[i]
    process.stdout.write(`  [${i+1}/${thin.length}] ${node.title} `)
    try {
      const critique = sceneAnalysis(node, worldAnchor)
      if (!critique || isFallback(critique)) { process.stdout.write('✗ critique\n'); continue }
      const revised = reviseDialogue(node, critique, worldAnchor, characters)
      if (revised && !isFallback(revised)) {
        const idx = nodes.findIndex(n2 => n2.id === node.id)
        if (revised.dialogue) nodes[idx].dialogue = revised.dialogue.map(d => ({ ...d, id: nanoid(6) }))
        if (revised.sceneDesc) nodes[idx].sceneDesc = revised.sceneDesc
        process.stdout.write(`✓ ${nodes[idx].dialogue?.length ?? 0}行\n`)
      } else {
        process.stdout.write('✗ revise\n')
      }
    } catch(e) {
      process.stdout.write(`✗ ${e.message}\n`)
    }
  }
}

// Phase 6: Director Review
console.log('')
const projectId = nanoid(12)
const project = {
  id: projectId,
  title: PREMISE.title,
  createdAt: ts(),
  updatedAt: ts(),
  currentPhase: 'validate',
  phaseProgress: { world:'done', scale:'done', structure:'done', workshop:'done', validate:'in_progress' },
  worldAnchor,
  scalePlan,
  characters,
  nodes,
  chapters: (structure.chapters ?? []).map(ch => ({
    id: ch.id, title: ch.title,
    acts: (ch.acts ?? []).map(act => ({
      id: act.id, title: act.title, dramaticFunction: act.dramaticFunction,
      nodeIds: (act.nodes ?? []).map(n => n.id),
    })),
  })),
  variables: [],
  downstreamStale: false,
}

const review = directorReview(project)
if (review) {
  project.directorReview = review
  project.phaseProgress.validate = 'done'
  console.log(`  → 综合评分: ${review.overallScore}/10  绿灯: ${review.greenlit ? '✅' : '❌'}`)
}

// 写入
const outPath = join(DATA_DIR, `${projectId}.json`)
writeFileSync(outPath, JSON.stringify(project, null, 2), 'utf8')

// 更新本地索引（供前端读取）
const idxPath = join(__dir, '../data/projects-index.json')
let idx = []
try { idx = JSON.parse(readFileSync(idxPath, 'utf8')) } catch {}
idx.unshift({
  id: projectId, title: PREMISE.title,
  updatedAt: project.updatedAt,
  currentPhase: 'validate',
  nodeCount: nodes.length,
})
writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8')

console.log(`\n${'█'.repeat(60)}`)
console.log(`  ✅ 完成：《${PREMISE.title}》`)
console.log(`  节点: ${nodes.length}  角色: ${characters.length}`)
const withDl = nodes.filter(n => (n.dialogue?.length ?? 0) >= 6).length
const avgDl = (nodes.reduce((s,n)=>s+(n.dialogue?.length??0),0)/nodes.length).toFixed(1)
console.log(`  平均对白行数: ${avgDl}  达标节点(≥6行): ${withDl}/${nodes.length}`)
console.log(`  文件: ${outPath}`)
console.log('█'.repeat(60))
