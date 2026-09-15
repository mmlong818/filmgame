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
const { pool } = await import('../lib/db/index.ts')
// 示例项目内容与项目列表页「打开示例项目」共用同一份定义（lib/seed/demoProject.ts）
const { SEED_PROJECT_ID, buildSeedProject } = await import('../lib/seed/demoProject.ts')

// ─── 执行 ────────────────────────────────────────────────────────────

async function main() {
  const existing = await getProject(SEED_PROJECT_ID)
  if (existing) {
    console.log(`[seed] 项目 ${SEED_PROJECT_ID} 已存在，跳过（幂等）。`)
    return 0
  }

  // buildSeedProject 内部已过 ProjectSchema.parse，不合法会直接抛错
  let project
  try {
    project = buildSeedProject()
  } catch (err) {
    console.error('[seed] 示例项目未通过 ProjectSchema 校验：', err instanceof Error ? err.message : err)
    return 1
  }

  const saved = await saveProject(project)
  console.log(`[seed] 已插入示例项目 ${saved.id}（${saved.title}），节点数 ${saved.nodes.length}。`)
  return 0
}

const code = await main()
await pool.end()
process.exit(code)
