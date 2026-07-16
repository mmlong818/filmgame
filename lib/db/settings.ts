// settings 仓储：单例配置行（provider/model/baseUrl/apiKey）的读写 + 加解密。
// getSettings/saveSettings 只负责与 DB 交互；默认值/惰性迁移逻辑归 lib/ai/server-config.ts。
import { eq } from 'drizzle-orm'
import { db } from './index.ts'
import { settings } from './schema.ts'
import { encryptSecret, decryptSecret } from '../server/crypto.ts'
import type { AIConfig } from '../ai/config'

const SINGLETON_ID = 'singleton'

/** 读 singleton 行；不存在则返回 null（由调用方决定默认值）。apiKey 已解密为明文供服务端直接使用。 */
export async function getSettings(): Promise<AIConfig | null> {
  const [row] = await db.select().from(settings).where(eq(settings.id, SINGLETON_ID))
  if (!row) return null

  return {
    provider: row.provider as AIConfig['provider'],
    model: row.model ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    apiKey: row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : undefined,
    modelFast: row.modelFast ?? undefined,
    modelThinking: row.modelThinking ?? undefined,
  }
}

/** 写 singleton 行：apiKey 非空则加密后覆盖 apiKeyEnc；apiKey 为空/未传则保留库中原值（不清空已存密钥）。 */
export async function saveSettings(config: AIConfig): Promise<void> {
  const now = new Date()

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(settings).where(eq(settings.id, SINGLETON_ID))
    const apiKeyEnc = config.apiKey ? encryptSecret(config.apiKey) : (existing?.apiKeyEnc ?? null)

    const values = {
      id: SINGLETON_ID,
      provider: config.provider,
      model: config.model ?? null,
      baseUrl: config.baseUrl ?? null,
      apiKeyEnc,
      // 空字符串视为"清空/使用默认"，与 apiKey 的留空语义不同（这两个字段不敏感，允许直接清空覆盖）
      modelFast: config.modelFast || null,
      modelThinking: config.modelThinking || null,
      updatedAt: now,
    }

    await tx
      .insert(settings)
      .values(values)
      .onConflictDoUpdate({ target: settings.id, set: values })
  })
}
