/**
 * gen-seeds.mjs — 批量生成所有种子项目的对白和情感内容
 * 用法: node scripts/gen-seeds.mjs [seed序号，不填则全部]
 * 示例: node scripts/gen-seeds.mjs 1   # 只处理第一个
 *       node scripts/gen-seeds.mjs      # 全部5个
 */

import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dir = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dir, '../public')

const SEED_FILES = [
  'seed-data.json',
  'seed-data-2.json',
  'seed-data-3.json',
  'seed-data-4.json',
  'seed-data-5.json',
]

const RETRY_SUFFIX = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

// ── Claude CLI 调用 ───────────────────────────────────────────────

function callClaude(prompt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = attempt === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = spawnSync('claude', ['--print', '--output-format', 'text'], {
      input: p,
      encoding: 'utf8',
      shell: true,
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (result.error) throw result.error
    const raw = result.stdout || ''
    const parsed = extractJson(raw)
    if (!isFallback(parsed)) return parsed
    console.log(`  ↻ retry ${attempt + 1}/3 (JSON parse failed)`)
  }
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

function nanoid(n = 6) { return randomBytes(n).toString('base64url').slice(0, n) }

// ── Prompt 构建 ───────────────────────────────────────────────────

function promptFillEmotion(node, worldAnchor, characters) {
  const ctx = { node, worldAnchor, characters }
  return `你是一位精通角色心理学的资深编剧，需要为互动影游节点设计深层情感状态并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【节点数据】
${JSON.stringify(ctx, null, 2)}

【情感设计原则】
- 角色的外部行为与内心状态必须存在张力
- internal_lie：此刻角色正在对自己撒的谎，用来保护自己不面对真相
- fear：此刻角色最想回避的事——心理层面的恐惧而非具体危险
- emotionIn/emotionOut 描述可见的外在情绪状态
- playerEmotion 描述希望玩家产生的情感共鸣

【输出模板】字段名固定，值替换为真实内容：
{"emotionIn":"表面平静，实则如履薄冰","emotionOut":"震惊与麻木同时涌上","playerEmotion":"强烈代入感，替角色捏一把汗","tension":7,"internal_lie":"他告诉自己这只是误会，很快会过去","fear":"被最信任的人看穿真实面目"}

输出：`
}

function promptWriteDialogue(node, worldAnchor, characters, variables = []) {
  const ef = node.emotionFunction ?? {}
  const nodeChoices = node.choices ?? []
  const charProfiles = characters.map(ch => {
    return [
      `${ch.name}（${ch.role}）`,
      `  · 动机："${ch.motivation ?? '未设定'}"`,
      `  · 伤痛（WOUND）："${ch.wound ?? '从角色动机和关系推断'}"`,
      `  · 谎言（LIE）："${ch.lie ?? '从动机推断'}"`,
      `  · 想要（WANT）："${ch.want ?? ch.motivation ?? '外部目标'}"`,
      `  · 需要（NEED）："${ch.need ?? '内心真正需要但正在抗拒的成长'}"`,
    ].join('\n')
  }).join('\n\n')

  const varCtx = variables.length > 0
    ? `\n【叙事变量系统】\n${variables.map(v => `- ${v.label}（${v.name}）：${v.description}`).join('\n')}`
    : ''

  const choiceCtx = nodeChoices.length > 0
    ? `\n【此节点后玩家将面临的选择】\n${nodeChoices.map((c, i) => `${i + 1}. "${c.text}"`).join('\n')}\n张力要求：对白结束时，玩家必须感受到选择每个选项都意味着失去某些东西。`
    : ''

  return `你是Robert McKee级别的编剧，正在为互动影游创作一个关键场景。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【类型/风格】${worldAnchor.genre ?? ''}
【核心主题】${worldAnchor.theme ?? ''}——所有对白都必须在某个层面回应这个主题
【世界规则】${worldAnchor.worldRules ?? ''}${varCtx}

【角色心理档案（四维模型）】
${charProfiles}

【当前节点】
标题：${node.title ?? ''}
类型：${node.type ?? ''}
戏剧功能：${node.dramaticFunction ?? '未设定'}
进入情绪：${ef.emotionIn ?? '未设定'}
离开情绪：${ef.emotionOut ?? '未设定'}
内心谎言：${ef.internal_lie ?? '从角色档案推断'}
当前恐惧：${ef.fear ?? '从节点情境推断'}
紧张度目标：${ef.tension ?? 5}/10
创作备注：${node.notes ?? ''}${choiceCtx}

【McKee对白铁律】
1. 对白即行动——每句话都是战术行为，禁止角色说出真实想法
2. 权力必须在场景中至少转移一次
3. 至少一个角色说出与真实想法相反的话
4. 两个角色说话节奏和用词绝对不能相同
5. 禁止直陈情绪，通过行为细节体现
6. 最后一行必须留钩，不能给出情感闭合
7. sceneDesc只写摄影机可见的动作和空间细节，必须包含权力关系和身体动作

【输出格式】对白6-10行（不能少于6行）：
{"sceneDesc":"摄影机语言，2-3句","dialogue":[{"speaker":"角色完整中文名","text":"说出口的台词","emotion":"外在情绪状态","subtext":"真实意图，必须与text形成反差"}]}

输出：`
}

function promptSceneAnalysis(node, worldAnchor) {
  const dialogue = node.dialogue ?? []
  const dialogueText = dialogue.map((l, i) => `${i + 1}. ${l.speaker}："${l.text}"${l.subtext ? `（潜台词：${l.subtext}）` : ''}`).join('\n')
  return `你是一位资深剧本编辑，诊断对白的结构性问题并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【核心主题】${worldAnchor.theme ?? ''}

【节点】标题：${node.title ?? ''}  类型：${node.type ?? ''}
【当前对白（共${dialogue.length}行）】
${dialogueText || '（尚无对白）'}

【输出格式】：
{"working":"有效部分","issues":[{"line":"问题台词","problem":"问题原因","fix":"修改建议"}],"killer_line":"建议加入的关键台词"}

输出：`
}

function promptReviseDialogue(node, critique, worldAnchor, characters) {
  const dl = node.dialogue ?? []
  const issues = (critique.issues ?? []).map((x, i) => `${i+1}. 问题台词："${x.line}" → ${x.problem} → 修改：${x.fix}`).join('\n')
  const charProfiles = characters.map(ch =>
    `${ch.name}：伤痛="${ch.wound ?? '推断'}"，谎言="${ch.lie ?? '推断'}"，想要="${ch.want ?? ch.role}"，需要="${ch.need ?? '推断'}"`
  ).join('\n')

  return `你是Robert McKee级别的编剧，修订问题对白，输出第二稿。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【主题】${worldAnchor.theme ?? ''}
【角色】
${charProfiles}

【节点】标题：${node.title ?? ''}  类型：${node.type ?? ''}
【第一稿（共${dl.length}行，问题版本）】
${dl.map((l, i) => `${i+1}. ${l.speaker}："${l.text}"`).join('\n') || '（空）'}

【编辑批注】
${issues || '（对白行数不足，需扩写至6行以上）'}
${critique.killer_line ? `【推荐关键台词】${critique.killer_line}` : ''}

【修订铁律】
1. 最终对白≥6行（当前${dl.length}行）
2. 每行是战术行为，禁止直陈情绪
3. 权力必须转移至少一次
4. 至少一角色说出与真实想法相反的话
5. 两角色说话节奏可区分
6. 最后一行必须留钩
7. sceneDesc≥80字符，只写可见动作

【输出格式】：
{"sceneDesc":"摄影机语言，2-3句，≥80字符","dialogue":[{"speaker":"角色完整中文名","text":"台词","emotion":"情绪","subtext":"真实意图，与text反差"}]}

输出：`
}

// ── 主处理逻辑 ────────────────────────────────────────────────────

async function processProject(filePath) {
  const fileName = filePath.split(/[\\/]/).pop()
  const project = JSON.parse(readFileSync(filePath, 'utf8'))
  const { worldAnchor, characters, variables = [], nodes } = project

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`▶ ${project.title}（${fileName}）— ${nodes.length} 个节点`)
  console.log('═'.repeat(60))

  // Pass 1: fill_emotion + write_dialogue
  console.log('\n【第一轮：生成情感函数 + 对白】')
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const label = `[${i + 1}/${nodes.length}] ${node.title}（${node.type}）`
    process.stdout.write(`  ${label} ...`)

    try {
      // fill_emotion
      const ef = callClaude(promptFillEmotion(node, worldAnchor, characters))
      if (ef && !isFallback(ef)) node.emotionFunction = ef

      // write_dialogue（用刚生成的emotionFunction）
      const nodeWithEf = { ...node }
      const dl = callClaude(promptWriteDialogue(nodeWithEf, worldAnchor, characters, variables))
      if (dl && !isFallback(dl)) {
        if (dl.dialogue) node.dialogue = dl.dialogue.map(d => ({ ...d, id: nanoid() }))
        if (dl.sceneDesc) node.sceneDesc = dl.sceneDesc
      }
      process.stdout.write(` ✓ (${node.dialogue?.length ?? 0} 行)\n`)
    } catch (e) {
      process.stdout.write(` ✗ ${e.message}\n`)
    }
  }

  // Pass 2: 精修瘦节点
  const thin = nodes.filter(n => n.type !== 'ending' && (n.dialogue?.length ?? 0) < 6)
  if (thin.length > 0) {
    console.log(`\n【第二轮：精修 ${thin.length} 个瘦节点（<6行对白）】`)
    for (let i = 0; i < thin.length; i++) {
      const node = thin[i]
      process.stdout.write(`  [${i + 1}/${thin.length}] ${node.title} ...`)
      try {
        const critique = callClaude(promptSceneAnalysis(node, worldAnchor))
        if (!critique || isFallback(critique)) { process.stdout.write(' ✗ (critique failed)\n'); continue }

        const revised = callClaude(promptReviseDialogue(node, critique, worldAnchor, characters))
        if (revised && !isFallback(revised)) {
          const idx = nodes.findIndex(n => n.id === node.id)
          if (revised.dialogue) nodes[idx].dialogue = revised.dialogue.map(d => ({ ...d, id: nanoid() }))
          if (revised.sceneDesc) nodes[idx].sceneDesc = revised.sceneDesc
          process.stdout.write(` ✓ (${nodes[idx].dialogue?.length ?? 0} 行)\n`)
        } else {
          process.stdout.write(' ✗ (revise failed)\n')
        }
      } catch (e) {
        process.stdout.write(` ✗ ${e.message}\n`)
      }
    }
  }

  // 写回文件
  project.updatedAt = new Date().toISOString()
  writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8')
  console.log(`\n✅ 已写回 ${fileName}`)
}

// ── 入口 ──────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const indices = args.length > 0
  ? args.map(a => parseInt(a, 10) - 1).filter(i => i >= 0 && i < SEED_FILES.length)
  : SEED_FILES.map((_, i) => i)

if (indices.length === 0) {
  console.error('用法: node scripts/gen-seeds.mjs [1-5] [1-5] ...')
  process.exit(1)
}

console.log(`\n🎬 Filmgame 种子生成器 — 共处理 ${indices.length} 个项目`)

for (const idx of indices) {
  await processProject(join(PUBLIC, SEED_FILES[idx]))
}

console.log('\n🎉 全部完成')
