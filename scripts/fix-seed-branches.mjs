/**
 * fix-seed-branches.mjs — 修复种子项目中的假分支（fake choices）
 * 对每个 branch 节点中所有选项都指向同一节点的情况，
 * 创建真正的 pathB 节点，让 choice 1-2 指向 pathA（原目标），choice 3 指向 pathB
 *
 * 用法: node scripts/fix-seed-branches.mjs [1-5] [1-5] ...
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

const RETRY = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

function nanoid(n = 8) { return randomBytes(n).toString('base64url').slice(0, n) }

function callClaude(prompt) {
  for (let i = 0; i < 3; i++) {
    const r = spawnSync('claude', ['--print', '--output-format', 'text'], {
      input: i === 0 ? prompt : prompt + RETRY,
      encoding: 'utf8', shell: true, timeout: 180_000, maxBuffer: 10 * 1024 * 1024,
    })
    if (r.error) throw r.error
    const raw = r.stdout || ''
    const t = raw.trim()
    const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
    const src = block ? block[1].trim() : (() => {
      const s = t.indexOf('{'), e = t.lastIndexOf('}')
      return s !== -1 && e > s ? t.slice(s, e + 1) : ''
    })()
    try { const j = JSON.parse(src); if (j && !('raw' in j)) return j } catch {}
    console.log(`    ↻ retry ${i + 1}/3`)
  }
  return null
}

function findFakeBranches(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  return nodes.filter(n => {
    if (n.type !== 'branch') return false
    const targets = [...new Set((n.choices ?? []).map(c => c.targetNodeId).filter(Boolean))]
    return targets.length === 1  // all choices point to same node = fake branch
  }).map(n => {
    const targets = [...new Set((n.choices ?? []).map(c => c.targetNodeId).filter(Boolean))]
    const pathA = nodeMap.get(targets[0])
    // find what pathA points to (the merge/convergence point)
    const pathATargets = [...new Set((pathA?.choices ?? [])
      .map(c => c.targetNodeId)
      .filter(id => id && nodeMap.get(id)?.type !== 'explore'))]
    const mergeId = pathATargets[0] ?? null
    const mergeNode = mergeId ? nodeMap.get(mergeId) : null
    return { branchNode: n, pathANode: pathA, mergeId, mergeNode }
  })
}

function buildPathBPrompt(branchNode, pathANode, mergeNode, worldAnchor, characters) {
  const charNames = (characters ?? []).map(c => `${c.name}（${c.role}）`).join('、')
  const pathAChoices = (pathANode?.choices ?? [])
    .filter(c => {
      // Only mention the merge-pointing choice, not explore choices
      return c.targetNodeId === mergeNode?.id
    })
    .map(c => c.text)
    .join('、')

  return `你是专业互动影游编剧，需要为一个分支节点创建替代路径（B路径）。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事背景】
故事核：${worldAnchor.storyCore ?? ''}
主题：${worldAnchor.theme ?? ''}
世界规则：${worldAnchor.worldRules ?? ''}
角色：${charNames}

【分支节点（玩家选择点）】
标题：${branchNode.title}
创作备注：${branchNode.notes ?? ''}
现有选项：${(branchNode.choices ?? []).map(c => c.text).join('、')}

【A路径节点（已存在，选项1-2的目标）】
标题：${pathANode?.title ?? ''}
内容备注：${pathANode?.notes ?? ''}

【任务】
为这个分支节点创建B路径节点（一个与A路径完全不同的场景）：
- B路径必须代表选择另一条道路的后果——情感基调或场景与A路径相反/对立
- B路径最终也汇合到：${mergeNode?.title ?? '下一个主线节点'}
- sceneDesc：15-30字，纯视觉描述，摄影机可见的动作和空间
- dialogue：3-5行，每行有speaker/text/emotion（无需subtext字段）
- 节点title：≤10字，体现这条路径的核心特征

【输出模板】：
{
  "title": "B路径标题（≤10字）",
  "notes": "这条路径代表的核心冲突/后果（20字内）",
  "sceneDesc": "摄影机可见的场景描述（15-30字）",
  "dialogue": [
    {"speaker": "角色名", "text": "台词", "emotion": "情绪状态"},
    {"speaker": "角色名", "text": "台词", "emotion": "情绪状态"},
    {"speaker": "角色名", "text": "台词", "emotion": "情绪状态"}
  ],
  "choiceText": "从B路径汇入主线的选项文字（≤8字，如：继续前进）"
}

输出：`
}

function buildChoiceUpdatePrompt(branchNode, pathANode, pathBTitle, worldAnchor) {
  return `你是互动影游编剧，需要为一个分支节点重新分配选项，确保不同选项指向不同的路径。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【分支节点】
标题：${branchNode.title}
现有选项（共${(branchNode.choices ?? []).length}个）：
${(branchNode.choices ?? []).map((c, i) => `${i + 1}. "${c.text}"`).join('\n')}

【两条路径】
- A路径：${pathANode?.title ?? ''} — 这条路代表：${pathANode?.notes ?? ''}
- B路径：${pathBTitle} — 这条路代表与A完全不同的选择后果

【任务】
将现有选项分配到A路径或B路径：
- 选项中语气/立场倾向于"遵守/妥协/官方"的 → A路径
- 选项中语气/立场倾向于"反抗/质疑/情感"的 → B路径
- 每条路径至少分配1个选项，最多2个选项

【输出模板】（只输出路径分配，不修改选项文字）：
{
  "pathA_indices": [1, 2],
  "pathB_indices": [3]
}

其中数字是选项序号（从1开始）。

输出：`
}

async function fixProject(filePath) {
  const fileName = filePath.split(/[\\/]/).pop()
  const project = JSON.parse(readFileSync(filePath, 'utf8'))
  const { worldAnchor, characters, nodes } = project

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`▶ ${project.title}（${fileName}）— ${nodes.length} 个节点`)
  console.log('═'.repeat(60))

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const fakeBranches = findFakeBranches(nodes)

  if (fakeBranches.length === 0) {
    console.log('  ✓ 无假分支，跳过')
    return
  }

  console.log(`  发现 ${fakeBranches.length} 个假分支，开始修复...`)

  for (const { branchNode, pathANode, mergeId, mergeNode } of fakeBranches) {
    console.log(`\n  [假分支] ${branchNode.title} → ${pathANode?.title ?? '?'}`)

    if (!pathANode || !mergeId) {
      console.log('    ✗ 无法确定 pathA 或 merge 节点，跳过')
      continue
    }

    // 1. 生成 pathB 节点内容
    process.stdout.write('    生成 B路径 内容...')
    const pathBData = callClaude(buildPathBPrompt(branchNode, pathANode, mergeNode, worldAnchor, characters))
    if (!pathBData) { console.log(' ✗ 生成失败，跳过'); continue }
    console.log(` ✓ "${pathBData.title}"`)

    // 2. 询问如何分配选项
    process.stdout.write('    分配选项到各路径...')
    const distribution = callClaude(buildChoiceUpdatePrompt(branchNode, pathANode, pathBData.title, worldAnchor))
    if (!distribution) { console.log(' ✗ 分配失败，跳过'); continue }
    console.log(` ✓ A:[${distribution.pathA_indices}] B:[${distribution.pathB_indices}]`)

    // 3. 创建 pathB 节点
    const pathBId = 'n_' + nanoid(6)
    const pathBNode = {
      id: pathBId,
      title: pathBData.title,
      type: 'normal',
      order: pathANode.order + 0.5,  // 插在 pathA 后
      notes: pathBData.notes ?? '',
      dramaticFunction: pathANode.dramaticFunction ?? 'conflict',
      sceneDesc: pathBData.sceneDesc ?? '',
      dialogue: (pathBData.dialogue ?? []).map(d => ({ ...d, id: nanoid(6) })),
      emotionFunction: null,
      choices: [{
        id: nanoid(6),
        text: pathBData.choiceText ?? '继续',
        targetNodeId: mergeId,
        targetNodeTitle: mergeNode?.title ?? '',
        variableEffects: '',
        choiceWeight: 'light',
        consequence: 'B路径汇入主线',
      }],
    }

    // 4. 更新 branchNode 的选项分配
    const pathAIndices = new Set((distribution.pathA_indices ?? [1]).map(i => i - 1))
    const pathBIndices = new Set((distribution.pathB_indices ?? []).map(i => i - 1))

    const originalChoices = branchNode.choices ?? []
    const updatedChoices = originalChoices.map((c, i) => {
      if (pathBIndices.has(i)) {
        return { ...c, targetNodeId: pathBId, targetNodeTitle: pathBData.title }
      }
      return c  // pathA 或默认保持原样
    })

    // 确保至少一个选项指向 pathB（如果 distribution 失败）
    if (pathBIndices.size === 0 && updatedChoices.length >= 2) {
      updatedChoices[updatedChoices.length - 1] = {
        ...updatedChoices[updatedChoices.length - 1],
        targetNodeId: pathBId,
        targetNodeTitle: pathBData.title,
      }
    }

    const branchIdx = nodes.findIndex(n => n.id === branchNode.id)
    const pathAIdx = nodes.findIndex(n => n.id === pathANode.id)

    // 应用更新
    nodes[branchIdx] = { ...branchNode, choices: updatedChoices }

    // 插入 pathB 节点（在 pathA 之后）
    nodes.splice(pathAIdx + 1, 0, pathBNode)
    nodeMap.set(pathBId, pathBNode)

    console.log(`    ✓ 已插入 B路径节点"${pathBData.title}"，choices 已更新`)
  }

  // 写回文件
  project.nodes = nodes
  project.updatedAt = new Date().toISOString()
  writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8')
  console.log(`\n✅ ${fileName} 修复完成（现有 ${nodes.length} 个节点）`)
}

const args = process.argv.slice(2)
const indices = args.length > 0
  ? args.map(a => parseInt(a, 10) - 1).filter(i => i >= 0 && i < SEED_FILES.length)
  : SEED_FILES.map((_, i) => i)

console.log(`🔧 假分支修复器 — 处理 ${indices.length} 个项目\n`)

for (const i of indices) {
  await fixProject(join(PUBLIC, SEED_FILES[i]))
}

console.log('\n🎉 全部完成')
