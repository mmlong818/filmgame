import { buildPrompt } from './prompts'
import { createModel } from './lc-providers'
import { loadServerAIConfig } from './server-config'
import { SpineSchema, ChapterDraftSchema, type Spine, type ChapterDraft } from './schemas'
import { HumanMessage } from '@langchain/core/messages'
import { RETRY_SUFFIX } from './lc-cli-model'

const SPINE_TIMEOUT = 90000
const CHAPTER_TIMEOUT = 300000

function extractJson(text: string): unknown {
  const t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      const inner = JSON.parse(t)
      if (typeof inner === 'string') {
        try { return JSON.parse(inner) } catch {}
      }
    } catch {}
  }
  const blockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()) } catch {}
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch {}
  }
  const astart = t.indexOf('[')
  const aend = t.lastIndexOf(']')
  if (astart !== -1 && aend > astart) {
    try { return JSON.parse(t.slice(astart, aend + 1)) } catch {}
  }
  return null
}

async function generateSpineWithModel(
  worldAnchor: unknown,
  scalePlan: unknown,
  characters: unknown
): Promise<Spine | null> {
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs: SPINE_TIMEOUT })
  const prompt = buildPrompt('structure', 'spine', { worldAnchor, scalePlan, characters })

  for (let i = 0; i < 3; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)])
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    const extracted = extractJson(raw)
    if (extracted !== null) {
      const parsed = SpineSchema.safeParse(extracted)
      if (parsed.success) return parsed.data
    }
  }
  return null
}

async function generateChapterWithModel(
  worldAnchor: unknown,
  scalePlan: unknown,
  characters: unknown,
  spine: Spine | null,
  chapterIndex: number
): Promise<ChapterDraft | null> {
  const config = await loadServerAIConfig()
  const model = createModel(config, { timeoutMs: CHAPTER_TIMEOUT })
  const prompt = buildPrompt('structure', 'chapter', {
    worldAnchor, scalePlan, characters, spine, chapterIndex,
  })

  for (let i = 0; i < 3; i++) {
    const input = i === 0 ? prompt : prompt + RETRY_SUFFIX
    const result = await model.invoke([new HumanMessage(input)])
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    const extracted = extractJson(raw)
    if (extracted !== null) {
      const parsed = ChapterDraftSchema.safeParse(extracted)
      if (parsed.success) return parsed.data
    }
  }
  return null
}

export interface StructureGraphInput {
  worldAnchor: unknown
  scalePlan: unknown
  characters: unknown
}

export interface StructureGraphResult {
  spine: Spine | null
  chapters: ChapterDraft[]
  errors: string[]
}

export async function runStructureGraph(input: StructureGraphInput): Promise<StructureGraphResult> {
  const { worldAnchor, scalePlan, characters } = input
  const chapterCount = Number((scalePlan as Record<string, unknown>)?.chapterCount ?? 3)
  const errors: string[] = []

  // Phase 1: generate spine
  const spine = await generateSpineWithModel(worldAnchor, scalePlan, characters)
  if (!spine) {
    // spine 解析失败时使用空骨干继续
  }

  // Phase 2: parallel chapter generation
  const chapterPromises = Array.from({ length: chapterCount }, (_, i) =>
    generateChapterWithModel(worldAnchor, scalePlan, characters, spine, i)
      .catch((err: Error) => {
        errors.push(`第${i + 1}章生成失败: ${err.message}`)
        return null
      })
  )

  const chapterResults = await Promise.all(chapterPromises)

  chapterResults.forEach((ch, i) => {
    if (ch === null) errors.push(`第${i + 1}章解析失败`)
  })

  const chapters = chapterResults.filter((ch): ch is ChapterDraft => ch !== null)

  return { spine, chapters, errors }
}
