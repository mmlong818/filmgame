/**
 * watch.mjs — 启动生成脚本并自动打开进度浮窗
 * 用法:
 *   node scripts/watch.mjs gen-seeds          # 生成所有种子
 *   node scripts/watch.mjs gen-seeds 1        # 生成第1个种子
 *   node scripts/watch.mjs gen-project        # 生成完整项目
 */

import { spawn } from 'child_process'
import { appendFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dir, '../data')
const LOG_FILE = join(DATA_DIR, 'gen-log.txt')

mkdirSync(DATA_DIR, { recursive: true })

const [, , scriptName, ...args] = process.argv

const SCRIPTS = {
  'gen-seeds':   'scripts/gen-seeds.mjs',
  'gen-project': 'scripts/gen-project.mjs',
}

if (!scriptName || !SCRIPTS[scriptName]) {
  console.error('用法: node scripts/watch.mjs [gen-seeds|gen-project] [...args]')
  process.exit(1)
}

// 清空日志，写标题
writeFileSync(LOG_FILE,
  `=== ${scriptName} ${args.join(' ')} 启动于 ${new Date().toLocaleTimeString('zh-CN')} ===\n`,
  'utf8'
)

// 打开浮窗（右侧，440×680）
function openWindow() {
  const winW = 440, winH = 680, posX = 1460, posY = 60
  const url = 'http://localhost:3000/status'
  const flags = [`--app=${url}`, `--window-size=${winW},${winH}`, `--window-position=${posX},${posY}`]

  for (const bin of ['msedge', 'chrome']) {
    try {
      const p = spawn(bin, flags, { shell: true, detached: true, stdio: 'ignore' })
      p.unref()
      console.log(`✓ 浮窗已打开 (${bin}) → http://localhost:3000/status`)
      return
    } catch { /* try next */ }
  }
  console.log('⚠ 请手动访问 http://localhost:3000/status')
}

openWindow()

// 启动目标脚本，输出实时写入日志文件 + 控制台
console.log(`\n▶ 启动 ${SCRIPTS[scriptName]} ${args.join(' ')}\n`)

const child = spawn('node', [SCRIPTS[scriptName], ...args], {
  cwd: join(__dir, '..'),
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', d => {
  const t = d.toString()
  process.stdout.write(t)
  appendFileSync(LOG_FILE, t, 'utf8')
})

child.stderr.on('data', d => {
  const t = d.toString()
  if (!t.includes('DeprecationWarning')) {
    process.stderr.write(t)
    appendFileSync(LOG_FILE, t, 'utf8')
  }
})

child.on('close', code => {
  const msg = `\n=== 完成 (exit ${code}) ${new Date().toLocaleTimeString('zh-CN')} ===\n`
  process.stdout.write(msg)
  appendFileSync(LOG_FILE, msg, 'utf8')
  process.exit(code ?? 0)
})
