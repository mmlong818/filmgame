import { spawn } from 'child_process'
import { createReadStream, existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import path from 'path'
import os from 'os'

type ClaudeCommand = { exe: string; args: string[] }

function resolveClaudeCommand(): ClaudeCommand {
  const isWin = process.platform === 'win32'
  const home = os.homedir()

  // 1) Standalone exe (new install method) — prefer local bin
  const standaloneCandidates = isWin
    ? [
        process.env.CLAUDE_CLI_PATH,
        path.join(home, '.local', 'bin', 'claude.exe'),
        path.join(home, '.claude', 'bin', 'claude.exe'),
      ]
    : [
        process.env.CLAUDE_CLI_PATH,
        path.join(home, '.local', 'bin', 'claude'),
        path.join(home, '.claude', 'bin', 'claude'),
        '/usr/local/bin/claude',
      ]
  for (const p of standaloneCandidates) {
    if (p && existsSync(p)) return { exe: p, args: ['--print', '--output-format', 'text'] }
  }

  // 2) Legacy npm-global install — run via node
  const npmJs = path.join(home, 'AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js')
  if (existsSync(npmJs)) {
    return { exe: process.execPath, args: [npmJs, '--print', '--output-format', 'text'] }
  }

  // 3) Fallback: trust PATH (shell-resolved)
  return { exe: isWin ? 'claude.exe' : 'claude', args: ['--print', '--output-format', 'text'] }
}

export async function callClaude(prompt: string, timeoutMs: number): Promise<string> {
  const tmpDir = process.env.TEMP || process.env.TMP || os.tmpdir()
  const promptFile = join(tmpDir, `claude_prompt_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`)
  await writeFile(promptFile, prompt, 'utf8')

  return new Promise((resolve, reject) => {
    const spawnEnv = { ...process.env }
    delete spawnEnv.CLAUDECODE
    delete spawnEnv.CLAUDE_CODE_ENTRYPOINT
    delete spawnEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    if (spawnEnv.ANTHROPIC_API_KEY && !spawnEnv.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      delete spawnEnv.ANTHROPIC_API_KEY
    }

    const cmd = resolveClaudeCommand()
    const proc = spawn(cmd.exe, cmd.args, {
      shell: false,
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => unlink(promptFile).catch(() => { /* ignore */ })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
      cleanup()
      reject(new Error(`timeout: claude process timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      if (code !== 0) {
        const msg = (stderr || stdout).slice(0, 500)
        if (code === null) reject(new Error(`timeout: claude process timed out after ${timeoutMs}ms`))
        else if (msg.includes('not found') || msg.includes('ENOENT') || code === 127) reject(new Error(`no_cli: claude CLI not found`))
        else reject(new Error(`claude exit ${code}: ${msg}`))
      } else {
        resolve(stdout)
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'no_cli: claude CLI not found'
        : err.message
      reject(new Error(msg))
    })

    const fileStream = createReadStream(promptFile, { encoding: 'utf8' })
    fileStream.on('error', (err) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })
    if (!proc.stdin) {
      cleanup()
      reject(new Error('stdin not available'))
      return
    }
    fileStream.pipe(proc.stdin)
  })
}

export function extractJson(text: string): unknown {
  const t = text.trim()

  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      const inner = JSON.parse(t)
      if (typeof inner === 'string') {
        try { return JSON.parse(inner) } catch { /* fall through */ }
      }
    } catch { /* fall through */ }
  }

  const blockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()) } catch { /* fall through */ }
  }

  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch { /* fall through */ }
  }

  const astart = t.indexOf('[')
  const aend = t.lastIndexOf(']')
  if (astart !== -1 && aend > astart) {
    try { return JSON.parse(t.slice(astart, aend + 1)) } catch { /* fall through */ }
  }

  return { raw: t }
}

export const RETRY_SUFFIX = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

export function isFallback(json: unknown): boolean {
  return typeof json === 'object' && json !== null && 'raw' in json
}

export async function callClaudeWithRetry(prompt: string, timeoutMs: number): Promise<{ raw: string; json: unknown }> {
  let raw = ''
  let json: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    raw = await callClaude(attempt === 0 ? prompt : prompt + RETRY_SUFFIX, timeoutMs)
    json = extractJson(raw)
    if (!isFallback(json)) break
  }
  return { raw, json }
}
