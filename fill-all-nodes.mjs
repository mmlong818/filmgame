/**
 * 批量填充所有节点的对白、情感函数、玩家选择建议
 */

import { readFileSync, writeFileSync } from 'fs'

const BASE = 'http://localhost:3000'

async function ai(phase, action, context) {
  const res = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, action, context }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error)
  return data.result
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

// 读取现有项目数据
const raw = readFileSync('inject-project.js', 'utf8')
const match = raw.match(/const project = ({[\s\S]*?});[\s\n]*const summary/)
const project = JSON.parse(match[1])

const WORLD = project.worldAnchor
const CHARACTERS = project.characters
const nodes = project.nodes

const unfilled = nodes.filter(n => n.dialogue.length === 0)
console.log(`需填充节点：${unfilled.length} / ${nodes.length}`)

// 批量处理，每批 4 个并行
const BATCH = 4
for (let i = 0; i < unfilled.length; i += BATCH) {
  const batch = unfilled.slice(i, i + BATCH)
  const batchNums = `${i + 1}~${Math.min(i + BATCH, unfilled.length)}`
  process.stdout.write(`  处理 ${batchNums}/${unfilled.length}：${batch.map(n => n.title).join(' / ')} ...`)

  await Promise.all(batch.map(async (node) => {
    const ctx = { ...node, worldAnchor: WORLD, characters: CHARACTERS }
    try {
      const [emotion, dialogue] = await Promise.all([
        ai('workshop', 'fill_emotion', ctx),
        ai('workshop', 'write_dialogue', ctx),
      ])

      node.emotionFunction = {
        emotionIn: emotion.emotionIn ?? '',
        emotionOut: emotion.emotionOut ?? '',
        playerEmotion: emotion.playerEmotion ?? '',
        tension: typeof emotion.tension === 'number' ? emotion.tension : 5,
      }

      if (dialogue.sceneDesc) node.sceneDesc = dialogue.sceneDesc
      node.dialogue = (dialogue.dialogue ?? []).map(d => ({
        id: uid('dl'),
        speaker: d.speaker ?? '',
        text: d.text ?? '',
        emotion: d.emotion ?? '',
      }))
    } catch (e) {
      console.error(`\n  ✗ 节点「${node.title}」失败：${e.message}`)
    }
  }))

  const done = batch.filter(n => n.dialogue.length > 0).length
  console.log(` ✓ (${done}/${batch.length} 成功)`)
}

// 更新 currentPhase 到 validate
project.currentPhase = 'validate'
project.phaseProgress.workshop = 'done'
project.phaseProgress.validate = 'in_progress'
project.updatedAt = new Date().toISOString()

const filledCount = nodes.filter(n => n.dialogue.length > 0).length
console.log(`\n填充完成：${filledCount}/${nodes.length} 个节点有对白`)

const summary = {
  id: project.id,
  title: project.title,
  updatedAt: project.updatedAt,
  currentPhase: project.currentPhase,
  nodeCount: nodes.length,
}

const injectScript = `// 粘贴到浏览器控制台（F12 → Console）运行
(function(){
  const project = ${JSON.stringify(project)};
  const summary = ${JSON.stringify(summary)};
  localStorage.setItem('filmgame:project:${project.id}', JSON.stringify(project));
  const idx = JSON.parse(localStorage.getItem('filmgame:projects:index') || '[]');
  const existing = idx.findIndex(s => s.id === '${project.id}');
  if (existing >= 0) idx[existing] = summary; else idx.unshift(summary);
  localStorage.setItem('filmgame:projects:index', JSON.stringify(idx));
  console.log('✓ 量子侦探已更新，节点：${nodes.length}，已填充对白：' + ${JSON.stringify(filledCount)});
  window.location.href = '/project/${project.id}/workshop';
})();`

writeFileSync('inject-project.js', injectScript, 'utf8')
writeFileSync('public/inject-project.js', injectScript, 'utf8')

console.log('inject-project.js 已更新（含完整对白）')
console.log('\n在浏览器控制台运行：fetch(\'/inject-project.js\').then(r=>r.text()).then(s=>eval(s))')
