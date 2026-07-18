import { NextRequest } from 'next/server'
import { structureGraph } from '@/lib/ai/lg-structure'
import { withAuth } from '@/lib/server/auth'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { getRunId } from '@/lib/ai/lc-chains'
import type { Spine, ChapterDraft } from '@/lib/ai/schemas'
import type { AiMode } from '@/lib/types/project'

type NodeUpdate = Record<string, { spine?: Spine | null; chapters?: ChapterDraft[]; errors?: string[]; warnings?: string[] }>

function classifyError(msg: string): { error: string; errorType: string } {
  if (msg.startsWith('no_cli:')) return { error: msg, errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg, errorType: 'timeout' }
  if (msg.startsWith('parse_failed:')) return { error: msg, errorType: 'parse_failed' }
  return { error: msg, errorType: 'unknown' }
}

export const POST = withAuth(async (req: NextRequest) => {
  const body = await req.json()
  const context = body.context as Record<string, unknown>
  const mode = body.mode as AiMode | undefined
  const { worldAnchor, scalePlan, characters } = context
  const chapterCount = Number((scalePlan as Record<string, unknown>)?.chapterCount ?? 3)

  const encoder = new TextEncoder()
  const collector = new RunCollectorCallbackHandler()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'))
      }

      // RunCollectorCallbackHandler 只在 root run 结束时才写入 tracedRuns，流式期间读它
      // 恒为 null；root runId 改由 handleChainStart 在图启动瞬间捕获（见下方 callbacks），
      // collector 仅作兜底。拿不到就先不发 run 帧，留到后续时机（每个 update / done / error）重试。
      let rootRunId: string | null = null
      let runIdSent = false
      const sendRunId = () => {
        if (runIdSent) return
        const runId = getRunId(collector) ?? rootRunId
        if (!runId) return
        send({ type: 'run', runId })
        runIdSent = true
      }

      const chapters: ChapterDraft[] = []
      const errors: string[] = []
      const warnings: string[] = []
      let chaptersDone = 0

      try {
        const iterator = await structureGraph.stream(
          { worldAnchor, scalePlan, characters, chapterCount, chapterIndex: 0, spine: null, chapters: [], errors: [], warnings: [], mode },
          {
            streamMode: 'updates',
            callbacks: [collector, {
              handleChainStart: (_chain: unknown, _inputs: unknown, runId: string, parentRunId?: string) => {
                if (!parentRunId && !rootRunId) rootRunId = runId
              },
            }],
          }
        )

        for await (const update of iterator as AsyncIterable<NodeUpdate>) {
          sendRunId()

          if (update.generateSpine) {
            const part = update.generateSpine
            errors.push(...(part.errors ?? []))
            send({ type: 'spine', ok: part.spine != null && (part.errors ?? []).length === 0 })
          }

          if (update.generateChapter) {
            const part = update.generateChapter
            if (part.chapters) chapters.push(...part.chapters)
            if (part.errors) errors.push(...part.errors)
            if (part.warnings) warnings.push(...part.warnings)
            chaptersDone += 1
            send({ type: 'chapter', done: chaptersDone, total: chapterCount, warnings: part.warnings ?? [] })
          }
        }

        sendRunId()
        send({ type: 'done', chapters, errors, warnings })
      } catch (err) {
        sendRunId()
        const msg = err instanceof Error ? err.message : String(err)
        send({ type: 'error', ...classifyError(msg) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
})
