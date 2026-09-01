// BYOK（custom provider）的 Base URL 由用户提供，服务端会带着用户的 API Key 去请求它，
// 并把响应片段回显——不加约束就是一个现成的 SSRF 跳板：填 http://169.254.169.254/…
// 即可让服务端代读云元数据（含临时凭据），填内网地址可探测内网服务。
//
// 防护采取白名单式思路：只允许 https（本机开发地址额外放行 http），且解析后的 IP
// 必须全部是公网单播地址。校验发生在 DNS 解析之后而不是只看主机名字符串——
// 攻击者完全可以用一个解析到 127.0.0.1 或 169.254.169.254 的公网域名绕过字符串检查。
import { lookup } from 'dns/promises'
import net from 'net'

export interface UrlGuardResult {
  ok: boolean
  error?: string
}

/** 本机回环：仅在开发环境放行，方便对接本地推理服务（Ollama / LM Studio 等） */
function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

/** 私有/保留网段：RFC1918、回环、链路本地（含云元数据 169.254.169.254）、CGNAT、组播等 */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 10) return true                      // 10.0.0.0/8
  if (a === 127) return true                     // 回环
  if (a === 0) return true                       // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true        // 192.168.0.0/16
  if (a === 169 && b === 254) return true        // 链路本地 + 云元数据
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true          // 192.0.0.0/24 IETF 协议分配
  if (a >= 224) return true                      // 组播 224/4 与保留 240/4
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (s === '::1' || s === '::') return true
  if (s.startsWith('fc') || s.startsWith('fd')) return true // 唯一本地地址 fc00::/7
  if (s.startsWith('fe80')) return true                     // 链路本地
  if (s.startsWith('ff')) return true                       // 组播
  // IPv4 映射地址（::ffff:169.254.169.254 这类绕过）
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true // 无法识别一律拒绝
}

/**
 * 校验用户提供的上游 Base URL 可安全请求。
 * @param allowLoopback 本机模式放行回环地址（对接 Ollama / LM Studio 等本地推理服务）。
 *   判据用 DEPLOY_MODE 而非 NODE_ENV：本产品的常态是用户在自己机器上跑生产构建
 *   （NODE_ENV=production 但仍是本机场景），用 NODE_ENV 判断会把 localhost:11434
 *   这类正常配置一并拒掉。只有真正部署（DEPLOY_MODE=deploy）时才封死回环。
 */
export async function assertPublicHttpUrl(
  raw: string,
  allowLoopback = process.env.DEPLOY_MODE !== 'deploy',
): Promise<UrlGuardResult> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: '地址格式无效' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: '只支持 http/https 地址' }
  }
  if (url.username || url.password) {
    return { ok: false, error: '地址中不允许携带用户名/密码' }
  }

  const host = url.hostname
  if (isLoopbackHost(host)) {
    return allowLoopback
      ? { ok: true }
      : { ok: false, error: '不允许指向本机地址' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: '非本机地址必须使用 https' }
  }

  // 字面量 IP：直接判定
  if (net.isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, error: '不允许指向内网或保留地址' }
      : { ok: true }
  }

  // 域名：解析后逐个校验（防止公网域名解析到内网/元数据地址）
  try {
    const records = await lookup(host, { all: true })
    if (records.length === 0) return { ok: false, error: '域名无法解析' }
    for (const r of records) {
      if (isPrivateAddress(r.address)) {
        return { ok: false, error: '该域名解析到内网或保留地址，已拒绝' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '域名无法解析' }
  }
}
