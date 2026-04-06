import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { AIConfig } from './config'

const SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json')

export async function loadServerAIConfig(): Promise<AIConfig> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { provider: 'claude_cli' }
  }
}

export async function saveServerAIConfig(config: AIConfig): Promise<void> {
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf8')
}
