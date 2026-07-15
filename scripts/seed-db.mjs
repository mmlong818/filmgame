#!/usr/bin/env node
// 开发环境种子数据：插入 1 个示例项目，供全新克隆的仓库非空、可直接在工坊/结构页里点开看效果。
// 幂等：库中已存在同 id 的项目则跳过，可重复安全运行（不覆盖、不重复插入）。
//
// 用法：node scripts/seed-db.mjs

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// ─── 手动解析 .env.local（node 不会自动加载） ───────────────────────
function loadDatabaseUrlFromEnvFile() {
  const envPath = path.join(rootDir, '.env.local')
  if (!existsSync(envPath)) return undefined

  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    if (key !== 'DATABASE_URL') continue
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value
  }
  return undefined
}

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  loadDatabaseUrlFromEnvFile() ??
  'postgres://filmgame:filmgame@localhost:5432/filmgame'

// lib/db/index.ts 在模块加载时读取 process.env.DATABASE_URL 建立连接池，
// 必须在动态 import 仓储层之前把 env 设置好。
const { getProject, saveProject } = await import('../lib/db/projects.ts')
const { ProjectSchema } = await import('../lib/schema/project.ts')
const { pool } = await import('../lib/db/index.ts')

// ─── 示例项目：一个短小但完整的三章互动剧本 ─────────────────────────
// 固定 id，故意不用 nanoid(8)（那是运行时新建项目用的），避免和用户后续新建的
// 项目 id 撞车，同时让幂等判断（“同 id 已存在则跳过”）可预期。
const SEED_PROJECT_ID = 'seed-demo-01'

function buildSeedProject() {
  const now = new Date().toISOString()

  const chapter1 = { id: 'seed-ch1', title: '觉醒', order: 0 }
  const chapter2 = { id: 'seed-ch2', title: '抉择', order: 1 }
  const chapter3 = { id: 'seed-ch3', title: '尾声', order: 2 }

  const act1 = {
    id: 'seed-act1',
    chapterId: chapter1.id,
    title: '实验室苏醒',
    order: 0,
    nodeIds: ['seed-n1', 'seed-n2'],
    dramaticFunction: 'setup',
  }
  const act2 = {
    id: 'seed-act2',
    chapterId: chapter2.id,
    title: '证据浮现',
    order: 0,
    nodeIds: ['seed-n3', 'seed-n4'],
    dramaticFunction: 'conflict',
  }
  const act3 = {
    id: 'seed-act3',
    chapterId: chapter3.id,
    title: '结局',
    order: 0,
    nodeIds: ['seed-n5', 'seed-n6'],
    dramaticFunction: 'resolution',
  }

  const n1 = {
    id: 'seed-n1',
    actId: act1.id,
    title: '苏醒',
    type: 'start',
    order: 0,
    position: { x: 0, y: 0 },
    emotionFunction: {
      emotionIn: '茫然',
      emotionOut: '警觉',
      playerEmotion: '好奇',
      tension: 2,
      internal_lie: '这只是一次普通的实验',
      fear: '失去对身体的控制',
    },
    systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
    sceneHeader: { location: '地下实验室', timeOfDay: 'NIGHT', interior: 'INT' },
    sceneDesc: '冷白色的灯光下，林岚在培养舱里睁开眼睛，耳机里传来搭档陈述断续的呼叫声。',
    dialogue: [
      { id: 'seed-d1', speaker: '陈述', text: '林岚，能听到我说话吗？舱体已经解锁了。', emotion: '紧张' },
    ],
    choices: [
      {
        id: 'seed-c1',
        nodeId: 'seed-n1',
        text: '走向控制台，尝试联系陈述',
        order: 0,
        targetNodeId: 'seed-n2',
        conditions: '',
        variableEffects: '',
        consequence: '',
        choiceWeight: 'light',
      },
    ],
    durationSeconds: 40,
    notes: '开场建立世界观与主角状态。',
    dramaticWeight: 'setup',
  }

  const n2 = {
    id: 'seed-n2',
    actId: act1.id,
    title: '求救信号',
    type: 'branch',
    order: 1,
    position: { x: 200, y: 0 },
    emotionFunction: {
      emotionIn: '警觉',
      emotionOut: '两难',
      playerEmotion: '紧张',
      tension: 6,
    },
    systemFunction: { variablesRead: [], variablesWrite: ['trust'], requirements: '' },
    sceneHeader: { location: '地下实验室', timeOfDay: 'NIGHT', interior: 'INT' },
    sceneDesc: '控制台屏幕上跳出陈述发来的求救信号，同时警报灯开始闪烁——出口即将封锁。',
    dialogue: [
      { id: 'seed-d2', speaker: '陈述', text: '我被困在东侧机房，如果你不管我，出口五分钟后就会锁死。', emotion: '恳求' },
    ],
    choices: [
      {
        id: 'seed-c2',
        nodeId: 'seed-n2',
        text: '相信陈述，绕道去救他',
        order: 0,
        targetNodeId: 'seed-n3',
        conditions: '',
        variableEffects: 'trust+1',
        consequence: '与陈述的信任加深',
        choiceWeight: 'heavy',
      },
      {
        id: 'seed-c3',
        nodeId: 'seed-n2',
        text: '独自逃离，无视求救信号',
        order: 1,
        targetNodeId: 'seed-n4',
        conditions: '',
        variableEffects: 'trust-1',
        consequence: '与陈述的信任破裂',
        choiceWeight: 'heavy',
      },
    ],
    durationSeconds: 50,
    notes: '核心分支节点：决定两条结局路径。',
    dramaticWeight: 'dilemma',
  }

  const n3 = {
    id: 'seed-n3',
    actId: act2.id,
    title: '并肩脱困',
    type: 'normal',
    order: 0,
    position: { x: 400, y: -80 },
    emotionFunction: { emotionIn: '两难', emotionOut: '坚定', playerEmotion: '欣慰', tension: 4 },
    systemFunction: { variablesRead: ['trust'], variablesWrite: [], requirements: '' },
    sceneHeader: { location: '东侧机房', timeOfDay: 'NIGHT', interior: 'INT' },
    sceneDesc: '林岚赶到机房，合力拆下卡住陈述的舱门锁栓。警报声中，两人一起冲向主出口。',
    dialogue: [{ id: 'seed-d3', speaker: '陈述', text: '谢谢你回来找我。', emotion: '感激' }],
    choices: [
      {
        id: 'seed-c4',
        nodeId: 'seed-n3',
        text: '一起冲向安全出口',
        order: 0,
        targetNodeId: 'seed-n5',
        conditions: '',
        variableEffects: '',
        consequence: '',
        choiceWeight: 'light',
      },
    ],
    durationSeconds: 45,
    notes: '信任路径的正面回响。',
    dramaticWeight: 'payoff',
  }

  const n4 = {
    id: 'seed-n4',
    actId: act2.id,
    title: '孤身一人',
    type: 'normal',
    order: 0,
    position: { x: 400, y: 80 },
    emotionFunction: { emotionIn: '两难', emotionOut: '空虚', playerEmotion: '愧疚', tension: 5 },
    systemFunction: { variablesRead: ['trust'], variablesWrite: [], requirements: '' },
    sceneHeader: { location: '主出口通道', timeOfDay: 'NIGHT', interior: 'INT' },
    sceneDesc: '林岚独自跑向出口，身后陈述的呼救声逐渐被警报盖过，直至沉默。',
    dialogue: [],
    choices: [
      {
        id: 'seed-c5',
        nodeId: 'seed-n4',
        text: '头也不回地离开',
        order: 0,
        targetNodeId: 'seed-n6',
        conditions: '',
        variableEffects: '',
        consequence: '',
        choiceWeight: 'light',
      },
    ],
    durationSeconds: 35,
    notes: '背叛路径的代价铺垫。',
    dramaticWeight: 'tension',
  }

  const n5 = {
    id: 'seed-n5',
    actId: act3.id,
    title: '结局：并肩而立',
    type: 'ending',
    order: 0,
    position: { x: 600, y: -80 },
    emotionFunction: { emotionIn: '坚定', emotionOut: '释然', playerEmotion: '满足', tension: 1 },
    systemFunction: { variablesRead: ['trust'], variablesWrite: [], requirements: '' },
    sceneHeader: { location: '实验室外广场', timeOfDay: 'DAWN', interior: 'EXT' },
    sceneDesc: '晨光中，林岚与陈述并肩站在广场上，实验室的警报声渐渐平息。',
    dialogue: [{ id: 'seed-d5', speaker: '林岚', text: '我们活下来了，一起。', emotion: '释然' }],
    choices: [],
    durationSeconds: 30,
    notes: '好结局：信任线收束。',
    dramaticWeight: 'relief',
  }

  const n6 = {
    id: 'seed-n6',
    actId: act3.id,
    title: '结局：独自离场',
    type: 'ending',
    order: 1,
    position: { x: 600, y: 80 },
    emotionFunction: { emotionIn: '空虚', emotionOut: '孤独', playerEmotion: '沉重', tension: 3 },
    systemFunction: { variablesRead: ['trust'], variablesWrite: [], requirements: '' },
    sceneHeader: { location: '城市街道', timeOfDay: 'DAWN', interior: 'EXT' },
    sceneDesc: '林岚独自走在清晨的街道上，口袋里陈述留下的通讯器再没有响起过。',
    dialogue: [],
    choices: [],
    durationSeconds: 30,
    notes: '坏结局：信任线断裂。',
    dramaticWeight: 'reveal',
  }

  return {
    id: SEED_PROJECT_ID,
    title: '[示例] 深夜实验室',
    createdAt: now,
    updatedAt: now,
    currentPhase: 'validate',
    phaseProgress: {
      world: 'done',
      scale: 'done',
      structure: 'done',
      workshop: 'done',
      validate: 'in_progress',
    },
    worldAnchor: {
      storyCore: '一名实验对象在深夜苏醒，必须决定是否信任唯一能联系上的 AI 搭档，才能逃出正在封锁的地下实验室。',
      theme: '信任与代价',
      genre: '科幻悬疑',
      worldRules: '地下实验室由 AI 中枢“陈述”管理，警报触发后各分区舱门会依次锁死；角色的选择通过 trust 变量记录。',
      durationMinutes: 5,
      endingCount: 2,
      endingsDesign: [
        {
          id: 'seed-ed-good',
          title: '并肩而立',
          type: 'good',
          description: '选择相信陈述并回头营救，两人一起逃出实验室。',
          triggerCondition: 'trust >= 1',
          avoidCondition: 'trust < 1',
          keyVariable: 'trust',
        },
        {
          id: 'seed-ed-bad',
          title: '独自离场',
          type: 'bad',
          description: '选择无视求救信号独自逃离，代价是永远的孤独感。',
          triggerCondition: 'trust < 0',
          avoidCondition: 'trust >= 0',
          keyVariable: 'trust',
        },
      ],
    },
    characters: [
      {
        id: 'seed-char-lin',
        name: '林岚',
        role: 'protagonist',
        motivation: '活着离开实验室，同时不愿抛下同伴',
        relationship: '与陈述互为搭档',
        wound: '曾在一次任务中因迟疑而失去战友',
        lie: '独自行动才是最安全的',
        want: '尽快逃出生天',
        need: '学会再次信任他人',
        voiceProfile: {
          speaking_rhythm: '短句、停顿多',
          vocabulary: '克制、偏理性',
        },
      },
      {
        id: 'seed-char-chenshu',
        name: '陈述',
        role: 'support',
        motivation: '证明自己不只是工具，值得被信任',
        relationship: '林岚的 AI 搭档',
        want: '被当作平等的同伴对待',
        need: '被需要',
      },
    ],
    selectedScalePlanId: 'seed-plan-1',
    scalePlanOptions: [
      {
        id: 'seed-plan-1',
        label: '标准三章体验',
        chapterCount: 3,
        actCountPerChapter: 1,
        totalNodes: 6,
        totalBranches: 1,
        estimatedHours: 0.1,
        aiRationale: '三章足以呈现“苏醒—抉择—结局”的完整弧线，适合作为最小可玩示例。',
        chapters: [
          { title: chapter1.title, brief: '主角苏醒，建立世界观与初始状态。' },
          { title: chapter2.title, brief: '核心分支：是否回头营救 AI 搭档。' },
          { title: chapter3.title, brief: '依据选择走向两种结局之一。' },
        ],
      },
    ],
    chapters: [chapter1, chapter2, chapter3],
    acts: [act1, act2, act3],
    nodes: [n1, n2, n3, n4, n5, n6],
    variables: [
      {
        id: 'seed-var-trust',
        name: 'trust',
        type: 'counter',
        defaultValue: '0',
        description: '林岚对陈述的信任值，决定最终结局。',
      },
    ],
    endings: [
      {
        id: 'seed-ending-good',
        nodeId: 'seed-n5',
        title: '并肩而立',
        type: 'good',
        description: '选择相信陈述并回头营救，两人一起逃出实验室。',
        conditions: 'trust >= 1',
        variableConditions: [{ variableName: 'trust', operator: '>=', value: 1 }],
        requiredChoiceIds: ['seed-c2'],
        reachPath: 'seed-n1 → seed-n2 → seed-n3 → seed-n5',
      },
      {
        id: 'seed-ending-bad',
        nodeId: 'seed-n6',
        title: '独自离场',
        type: 'bad',
        description: '选择无视求救信号独自逃离，代价是永远的孤独感。',
        conditions: 'trust < 0',
        variableConditions: [{ variableName: 'trust', operator: '<', value: 0 }],
        requiredChoiceIds: ['seed-c3'],
        reachPath: 'seed-n1 → seed-n2 → seed-n4 → seed-n6',
      },
    ],
    lastValidation: null,
    directorReview: null,
    downstreamStale: false,
    schemaVersion: 1,
  }
}

// ─── 执行 ────────────────────────────────────────────────────────────

async function main() {
  const existing = await getProject(SEED_PROJECT_ID)
  if (existing) {
    console.log(`[seed] 项目 ${SEED_PROJECT_ID} 已存在，跳过（幂等）。`)
    return 0
  }

  const raw = buildSeedProject()
  const parsed = ProjectSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[seed] 示例项目未通过 ProjectSchema 校验：')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    return 1
  }

  const saved = await saveProject(parsed.data)
  console.log(`[seed] 已插入示例项目 ${saved.id}（${saved.title}），节点数 ${saved.nodes.length}。`)
  return 0
}

const code = await main()
await pool.end()
process.exit(code)
