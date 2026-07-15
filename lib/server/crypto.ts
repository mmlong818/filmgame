import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/**
 * 全用 node:crypto，零新依赖。
 * - encryptSecret/decryptSecret：AES-256-GCM，用于 BYOK apiKey 落库加密。
 * - signSession/verifySession：HMAC-SHA256 无状态会话 token（不是 JWT，格式更简单）。
 * - verifyPassword：与 APP_PASSWORD 常量时间比对（scrypt 派生定长摘要，避免变长比较的时序泄漏）。
 */

const ENCRYPTION_ALGO = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM 推荐 96-bit IV

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) throw new Error('ENCRYPTION_KEY 未设置')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY 必须是 32 字节（64 位 hex）')
  return key
}

function getAuthSecret(): Buffer {
  const hex = process.env.AUTH_SECRET
  if (!hex) throw new Error('AUTH_SECRET 未设置')
  return Buffer.from(hex, 'hex')
}

/** AES-256-GCM 加密，输出 `iv:tag:ciphertext`（各段 base64） */
export function encryptSecret(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

/** 解密 encryptSecret 的输出；格式不对或密钥/tag 校验失败均抛错 */
export function decryptSecret(enc: string): string {
  const key = getEncryptionKey()
  const parts = enc.split(':')
  if (parts.length !== 3) throw new Error('加密串格式非法')
  const [ivB64, tagB64, ciphertextB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const decipher = createDecipheriv(ENCRYPTION_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

export interface SessionPayload {
  /** 过期时间，unix 毫秒 */
  exp: number
}

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

/** 签发会话 token：`base64url(json payload).base64url(hmac签名)` */
export function signSession(payload: SessionPayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = createHmac('sha256', getAuthSecret()).update(body).digest()
  return `${body}.${base64url(sig)}`
}

/** 校验会话 token：签名 + 过期时间均需通过，签名比对用 timingSafeEqual */
export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false
  const dotIndex = token.indexOf('.')
  if (dotIndex <= 0) return false
  const body = token.slice(0, dotIndex)
  const sig = token.slice(dotIndex + 1)
  if (!body || !sig) return false

  let actualSig: Buffer
  try {
    actualSig = Buffer.from(sig, 'base64url')
  } catch {
    return false
  }
  const expectedSig = createHmac('sha256', getAuthSecret()).update(body).digest()
  if (actualSig.length !== expectedSig.length) return false
  if (!timingSafeEqual(actualSig, expectedSig)) return false

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return false
    if (Date.now() > payload.exp) return false
    return true
  } catch {
    return false
  }
}

/** 与 APP_PASSWORD 常量时间比对（scrypt 派生成定长摘要后再 timingSafeEqual） */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) throw new Error('APP_PASSWORD 未设置')
  const salt = getAuthSecret()
  const inputHash = scryptSync(input, salt, 32)
  const expectedHash = scryptSync(expected, salt, 32)
  return timingSafeEqual(inputHash, expectedHash)
}
