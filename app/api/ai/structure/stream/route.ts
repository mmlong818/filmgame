import { NextRequest } from 'next/server'
import { structureGraph } from '@/lib/ai/lg-structure'
import { withAuth } from '@/lib/server/auth'
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'
import { getRunId } from '@/lib/ai/lc-chains'
import type { Spine, ChapterDraft } from '@/lib/ai/schemas'

type NodeUpdate = Record<string, { spine?: Spine | null; chapters?: ChapterDraft[]; errors?: string[] }>

function classifyError(msg: string): { error: string; errorType: string } {
  if (msg.startsWith('no_cli:')) return { error: msg, errorType: 'no_cli' }
  if (msg.startsWith('timeout:')) return { error: msg, errorType: 'timeout' }
  if (msg.startsWith('parse_failed:')) return { error: msg, errorType: 'parse_failed' }
  return { error: msg, errorType: 'unknown' }
}

export const POST = withAuth(async (req: NextRequest) => {
  const body = await req.json()
  const context = body.context as Record<string, unknown>
  const { worldAnchor, scalePlan, characters } = context
  const chapterCount = Number((scalePlan as Record<string, unknown>)?.chapterCount ?? 3)

  const encoder = new TextEncoder()
  const collector = new RunCollectorCallbackHandler()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'))
      }

      let runIdSent = false
      const sendRunId = () => {
        if (runIdSent) return
        send({ type: 'run', runId: getRunId(collector) })
        runIdSent = true
      }

      const chapters: ChapterDraft[] = []
      const errors: string[] = []
      let chaptersDone = 0

      try {
        const iterator = await structureGraph.stream(
          { worldAnchor, scalePlan, characters, chapterCount, chapterIndex: 0, spine: null, chapters: [], errors: [] },
          { streamMode: 'updates', callbacks: [collector] }
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
            chaptersDone += 1
            send({ type: 'chapter', done: chaptersDone, total: chapterCount })
          }
        }

        sendRunId()
        send({ type: 'done', chapters, errors })
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
