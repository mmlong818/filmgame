/**
 * check-schema-prompt.mjs — 回归防护:确保 prompts.ts 的 JSON 输出示例
 * 能通过 schemas.ts 中对应 SCHEMA_REGISTRY[key] 的校验。
 *
 * 原理：
 * 1. 对每个 `phase:action` key，用空 context 调用 buildPrompt() 得到实际提示词文本
 *    （复用真实运行时逻辑，而不是重新解析源码字符串，避免脚本与实现脱节）
 * 2. 在文本中定位"输出模板/输出格式"标记之后的第一个 JSON 字面量（大括号/中括号配对提取），
 *    这段文字就是模型被要求产出的示例形状
 * 3. 用对应 schema.safeParse() 校验这个示例，不通过则视为 prompt 与 schema 不一致
 *
 * 用法: node scripts/check-schema-prompt.mjs
 * 非零退出码 = 发现 prompt 示例与 schema 不匹配（打印具体 key 和字段路径）
 */

import { buildPrompt } from '../lib/ai/prompts.ts'
import { SCHEMA_REGISTRY } from '../lib/ai/schemas.ts'

// 这些 key 的提示词输出示例是根据 context 动态拼装的（章节数量、拓扑结构等），
// 不是固定的 JSON 字面量，无法用"截取字面量再 JSON.parse"的方式静态提取。
// 不硬编码假通过——这里只是跳过提取，不代表它们已被验证。
const SKIP_LIST = {
  'structure:spine': 'chapter_handoffs/character_arcs 按 chapterCount 动态生成模板片段，非固定 JSON 字面量',
  'structure:chapter': '输出内容是 JSON.stringify(chapterSkeleton) 动态骨架，无独立的固定输出示例',
}

const OUTPUT_MARKERS = ['输出模板', '输出格式']

function findMarkerIndex(text) {
  let last = -1
  for (const marker of OUTPUT_MARKERS) {
    const idx = text.lastIndexOf(marker)
    if (idx > last) last = idx
  }
  return last
}

function extractJsonAfter(text, fromIndex) {
  let start = -1
  for (let i = fromIndex; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') { start = i; break }
  }
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function formatZodIssues(issues) {
  return issues.map(iss => `    - [${iss.path.join('.') || '(root)'}] ${iss.message}`).join('\n')
}

let failed = false
const skipped = []
const passed = []
const failedKeys = []

for (const key of Object.keys(SCHEMA_REGISTRY)) {
  if (SKIP_LIST[key]) {
    skipped.push(key)
    continue
  }

  const [phase, action] = key.split(':')
  let promptText
  try {
    promptText = buildPrompt(phase, action, {})
  } catch (err) {
    failed = true
    failedKeys.push(key)
    console.error(`[FAIL] ${key}: buildPrompt() 抛出异常 — ${err.message}`)
    continue
  }

  const markerIdx = findMarkerIndex(promptText)
  if (markerIdx === -1) {
    failed = true
    failedKeys.push(key)
    console.error(`[FAIL] ${key}: 未找到"输出模板/输出格式"标记，无法定位示例 JSON`)
    continue
  }

  const jsonText = extractJsonAfter(promptText, markerIdx)
  if (!jsonText) {
    failed = true
    failedKeys.push(key)
    console.error(`[FAIL] ${key}: 标记之后未找到可配对的 JSON 字面量`)
    continue
  }

  let parsedExample
  try {
    parsedExample = JSON.parse(jsonText)
  } catch (err) {
    failed = true
    failedKeys.push(key)
    console.error(`[FAIL] ${key}: 提取出的文本不是合法 JSON — ${err.message}`)
    console.error(`  提取内容前200字符: ${jsonText.slice(0, 200)}`)
    continue
  }

  const schema = SCHEMA_REGISTRY[key]
  const result = schema.safeParse(parsedExample)
  if (!result.success) {
    failed = true
    failedKeys.push(key)
    console.error(`[FAIL] ${key}: prompt 示例未通过 schema 校验`)
    console.error(formatZodIssues(result.error.issues))
    continue
  }

  passed.push(key)
}

console.log('')
console.log(`通过 (${passed.length}): ${passed.join(', ') || '(无)'}`)
console.log(`跳过 (${skipped.length}):`)
for (const key of skipped) {
  console.log(`  - ${key}: ${SKIP_LIST[key]}`)
}

if (failed) {
  console.log('')
  console.error(`失败 (${failedKeys.length}): ${failedKeys.join(', ')}`)
  process.exit(1)
} else {
  console.log('')
  console.log('全部通过（跳过项已列出原因，未计入假通过）')
  process.exit(0)
}
