#!/usr/bin/env node
// 一次性存量迁移：data/projects/*.json + data/archive/*.json → Postgres。
// 幂等：库中同 id 项目的 updatedAt >= 文件的 updatedAt 时跳过（可重复安全运行）。
// 非破坏：任何情况下都不修改/删除 data/projects、data/archive 下的源文件。
//
// 用法：node scripts/migrate-json-to-db.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs'
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
const { getProject, saveProject, archiveProject } = await import('../lib/db/projects.ts')
const { migrateProject } = await import('../lib/schema/migrations.ts')
const { ProjectSchema } = await import('../lib/schema/project.ts')
const { pool } = await import('../lib/db/index.ts')

// ─── 遍历目录 ────────────────────────────────────────────────────────
function listProjectJsonFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.includes('.bak') && !f.includes('.tmp'))
    .map((f) => path.join(dir, f))
}

const projectFiles = listProjectJsonFiles(path.join(rootDir, 'data', 'projects')).map((file) => ({
  file,
  archived: false,
}))
const archiveFiles = listProjectJsonFiles(path.join(rootDir, 'data', 'archive')).map((file) => ({
  file,
  archived: true,
}))
const allFiles = [...projectFiles, ...archiveFiles]

const report = { imported: [], skipped: [], failed: [] }

function summarizeZodError(error) {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

for (const { file, archived } of allFiles) {
  const filename = path.basename(file)
  try {
    const raw = readFileSync(file, 'utf8')
    const doc = JSON.parse(raw)
    const migrated = migrateProject(doc)
    const parsed = ProjectSchema.safeParse(migrated)

    if (!parsed.success) {
      report.failed.push({ filename, reason: `zod 校验失败: ${summarizeZodError(parsed.error)}` })
      continue
    }

    const project = parsed.data

    const existing = await getProject(project.id)
    if (existing && new Date(existing.updatedAt).getTime() >= new Date(project.updatedAt).getTime()) {
      report.skipped.push({
        filename,
        reason: `库中已存在且 updatedAt 不早于文件 (db=${existing.updatedAt}, file=${project.updatedAt})`,
      })
      continue
    }

    await saveProject(project)
    if (archived) {
      await archiveProject(project.id)
    }
    report.imported.push({ filename, id: project.id, nodeCount: project.nodes.length })
  } catch (err) {
    report.failed.push({ filename, reason: err instanceof Error ? err.message : String(err) })
  }
}

// ─── 报告 ────────────────────────────────────────────────────────────
console.log('\n=== 存量迁移报告 ===')
console.log(`imported (${report.imported.length}):`)
for (const item of report.imported) {
  console.log(`  - ${item.filename} → id=${item.id}, nodes=${item.nodeCount}`)
}
console.log(`skipped (${report.skipped.length}):`)
for (const item of report.skipped) {
  console.log(`  - ${item.filename}: ${item.reason}`)
}
console.log(`failed (${report.failed.length}):`)
for (const item of report.failed) {
  console.log(`  - ${item.filename}: ${item.reason}`)
}

await pool.end()

process.exit(report.failed.length > 0 ? 1 : 0)
