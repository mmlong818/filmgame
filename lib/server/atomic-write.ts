import { copyFile, rename, unlink, writeFile } from 'fs/promises'

/**
 * 原子写入 JSON 文件，并保留上一版本的备份。
 *
 * 流程：写入 `${targetPath}.tmp` → 若目标已存在则复制为 `${targetPath}.bak` → rename 覆盖目标。
 * Windows 上 fs.rename 覆盖已存在文件在极少数情况下（文件被占用等）会抛错，
 * 因此失败时先 unlink 目标再重试一次，确保覆盖语义正确。
 */
export async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  const bakPath = `${targetPath}.bak`
  const content = JSON.stringify(data, null, 2)

  await writeFile(tmpPath, content, 'utf8')

  try {
    await copyFile(targetPath, bakPath)
  } catch {
    // 目标文件不存在（首次写入），无需备份
  }

  try {
    await rename(tmpPath, targetPath)
  } catch {
    // Windows 上目标文件被占用等情况下 rename 可能失败，先删除目标再重试
    await unlink(targetPath).catch(() => {})
    await rename(tmpPath, targetPath)
  }
}
