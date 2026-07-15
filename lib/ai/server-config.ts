import { readFile } from 'fs/promises'
import { join } from 'path'
import type { AIConfig } from './config'
// .ts 扩展名：lib/db/* 的既有约定（见 lib/db/projects.ts 注释），保证 Node strip-only
// 模式（临时校验脚本等直接 import 本文件）也能解析，不止 Next bundler。
import { getSettings, saveSettings } from '../db/settings.ts'

// 旧文件后端（迁移前唯一真源）。DB 落地后不再由本文件写入；仅在 DB 无 settings 行时读一次做惰性迁移。
const LEGACY_SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json')

/**
 * 惰性迁移：DB 无 singleton 行、且旧 data/settings.json 存在时，读取该文件（可能含明文 apiKey）
 * 并写入 DB（加密 apiKey）一次。此后 getSettings() 命中 DB 行，不再读文件。
 * 迁移不会删除 data/settings.json —— 确认 DB 数据无误后可手动删除该文件。
 */
async function migrateLegacyFileToDb(): Promise<AIConfig | null> {
  let legacy: AIConfig
  try {
    const raw = await readFile(LEGACY_SETTINGS_FILE, 'utf8')
    legacy = JSON.parse(raw) as AIConfig
  } catch {
    return null
  }
  if (!legacy || !legacy.provider) return null

  await saveSettings(legacy)
  return legacy
}

export async function loadServerAIConfig(): Promise<AIConfig> {
  const existing = await getSettings()
  if (existing) return existing

  const migrated = await migrateLegacyFileToDb()
  if (migrated) return migrated

  return { provider: 'claude_cli' }
}

export async function saveServerAIConfig(config: AIConfig): Promise<void> {
  await saveSettings(config)
}
