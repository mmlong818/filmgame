import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { type BaseMessage, AIMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { spawn } from 'child_process'
import { createReadStream, existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import os from 'os'
import path from 'path'

export const RETRY_SUFFIX = '\n\n【重要】上次输出格式不正确，请严格按照模板输出纯JSON对象，不要包含任何额外说明、Markdown代码块或引号包裹。'

function resolveClaudePath(): { exe: string; args: string[] } {
  const isWin = process.platform === 'win32'
  const home = os.homedir()
  const candidates = isWin
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
  for (const p of candidates) {
    if (p && existsSync(p)) return { exe: p, args: ['--print', '--output-format', 'text'] }
  }
  const npmJs = path.join(home, 'AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js')
  if (existsSync(npmJs)) {
    return { exe: process.execPath, args: [npmJs, '--print', '--output-format', 'text'] }
  }
  return { exe: isWin ? 'claude.exe' : 'claude', args: ['--print', '--output-format', 'text'] }
}

async function spawnClaude(prompt: string, timeoutMs: number): Promise<string> {
  const tmpDir = process.env.TEMP || process.env.TMP || os.tmpdir()
  const promptFile = join(tmpDir, `claude_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`)
  await writeFile(promptFile, prompt, 'utf8')

  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      delete env.ANTHROPIC_API_KEY
    }

    const cmd = resolveClaudePath()
    const proc = spawn(cmd.exe, cmd.args, {
      shell: false,
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => unlink(promptFile).catch(() => {})

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill('SIGKILL') } catch {}
      cleanup()
      reject(new Error(`timeout: claude CLI timed out after ${timeoutMs}ms`))
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
        if (code === null) reject(new Error(`timeout: claude CLI timed out after ${timeoutMs}ms`))
        else if (msg.includes('not found') || msg.includes('ENOENT') || code === 127)
          reject(new Error('no_cli: claude CLI not found'))
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
      reject(new Error(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'no_cli: claude CLI not found'
          : err.message
      ))
    })

    const fileStream = createReadStream(promptFile, { encoding: 'utf8' })
    fileStream.on('error', (err) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })
    if (!proc.stdin) { cleanup(); reject(new Error('stdin not available')); return }
    fileStream.pipe(proc.stdin)
  })
}

export interface ClaudeCLIModelParams extends BaseChatModelParams {
  timeoutMs?: number
}

export class ClaudeCLIModel extends BaseChatModel {
  timeoutMs: number

  constructor(params: ClaudeCLIModelParams = {}) {
    super(params)
    this.timeoutMs = params.timeoutMs ?? 120000
  }

  _llmType(): string { return 'claude_cli' }

  async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const prompt = messages.map(m => m.content as string).join('\n')
    const text = await spawnClaude(prompt, this.timeoutMs)
    return {
      generations: [{ message: new AIMessage(text), text }],
      llmOutput: {},
    }
  }
}
