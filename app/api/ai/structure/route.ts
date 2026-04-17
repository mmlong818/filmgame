import { NextRequest, NextResponse } from 'next/server'
import { buildPrompt } from '@/lib/ai/prompts'
import { callClaudeWithRetry, isFallback } from '@/lib/ai/claude'

const SPINE_TIMEOUT = 90000       // 90s — 骨干 prompt 小，应该很快
const CHAPTER_TIMEOUT = 300000    // 5min per chapter — 并行后总时间 ≈ 此值

type ChapterDraft = {
  title: string
  acts: Array<{ title: string; nodes: Array<{ title: string; type: string; notes: string }> }>
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const context = body.context as Record<string, unknown>
    const { worldAnchor, scalePlan, characters } = context
    const chapterCount = Number((scalePlan as Record<string,unknown>)?.chapterCount ?? 3)

    console.log(`[structure/route] 开始两阶段生成，${chapterCount}章并行`)

    // ── 第一阶段：生成故事骨干 ──────────────────────────────
    const spinePrompt = buildPrompt('structure', 'spine', { worldAnchor, scalePlan, characters })
    const { json: spineJson } = await callClaudeWithRetry(spinePrompt, SPINE_TIMEOUT)

    if (isFallback(spineJson)) {
      console.warn('[structure/route] spine 解析失败，使用空骨干继续')
    }
    const spine = isFallback(spineJson) ? {} : spineJson

    console.log(`[structure/route] 骨干完成，开始并行生成${chapterCount}章`)

    // ── 第二阶段：并行生成各章节点 ──────────────────────────
    const chapterPromises = Array.from({ length: chapterCount }, (_, i) => {
      const prompt = buildPrompt('structure', 'chapter', {
        worldAnchor, scalePlan, characters, spine, chapterIndex: i,
      })
      return callClaudeWithRetry(prompt, CHAPTER_TIMEOUT).then(({ json }) => {
        if (isFallback(json)) {
          console.warn(`[structure/route] 第${i+1}章解析失败`)
          return null
        }
        console.log(`[structure/route] 第${i+1}章完成`)
        return json as ChapterDraft
      })
    })

    const chapterResults = await Promise.all(chapterPromises)

    // 检查是否有章节失败
    const failedIdx = chapterResults.findIndex(r => r === null)
    if (failedIdx !== -1) {
      return NextResponse.json({
        ok: false,
        error: `parse_failed: 第${failedIdx + 1}章 AI 响应无法解析`,
        errorType: 'parse_failed',
      }, { status: 502 })
    }

    const chapters = chapterResults as ChapterDraft[]
    console.log(`[structure/route] 全部完成，共${chapters.reduce((s, ch) => s + ch.acts.reduce((ss, a) => ss + a.nodes.length, 0), 0)}个节点`)

    return NextResponse.json({ ok: true, result: { chapters } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errorType = msg.startsWith('no_cli:') ? 'no_cli' : msg.startsWith('timeout:') ? 'timeout' : 'unknown'
    return NextResponse.json({ ok: false, error: msg, errorType }, { status: 500 })
  }
}
