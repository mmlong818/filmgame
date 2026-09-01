import { NextRequest } from 'next/server'
import { structureGraph } from '@/lib/ai/lg-structure'
import { withAuth } from '@/lib/server/auth'
import { guardContext } from '@/lib/server/request-guard'
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
  const guarded = guardContext(body.context)
  if (!guarded.ok) {
    return Response.json({ ok: false, error: guarded.error, errorType: 'bad_request' }, { status: 400 })
  }
  const context = guarded.context
  const mode = body.mode as AiMode | undefined
  const { worldAnchor, scalePlan, characters } = context
  const chapterCount = Number((scalePlan as Record<string, unknown>)?.chapterCount ?? 3)

  const encoder = new TextEncoder()
  const collector = new RunCollectorCallbackHandler()

  // 客户端断开有两个信号源：请求自身的 req.signal，以及 ReadableStream 的 cancel()
  // （读端关闭）。此前两个都没接，用户关页后整张图照跑到底，白烧 CLI 槽位与上游配额。
  const abort = new AbortController()
  const onReqAbort = () => abort.abort()
  req.signal.addEventListener('abort', onReqAbort, { once: true })

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: Record<string, unknown>) => {
        if (abort.signal.aborted) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(evt) + '\n'))
        } catch {
          abort.abort() // 流已被读端关闭：转为中止图执行
        }
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
            signal: abort.signal,
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
        // 流式路径不经过 runStructureGraph 的排序返回，这里必须自行按 chapterIndex 恢复章序
        // （updates 到达顺序 = 并行完成顺序，曾导致第二章排在第一章之前、跨章连接断裂）
        const ordered = [...chapters].sort(
          (a, b) => ((a as { chapterIndex?: number }).chapterIndex ?? 0) - ((b as { chapterIndex?: number }).chapterIndex ?? 0),
        )
        send({ type: 'done', chapters: ordered, errors, warnings })
      } catch (err) {
        sendRunId()
        const msg = err instanceof Error ? err.message : String(err)
        // 客户端已断开：不再往关闭的流里写错误帧（会抛 TypeError）
        if (!abort.signal.aborted) send({ type: 'error', ...classifyError(msg) })
      } finally {
        req.signal.removeEventListener('abort', onReqAbort)
        try { controller.close() } catch {}
      }
    },
    cancel() {
      // 读端关闭（用户关闭页面/取消 fetch）：中止图执行，连带杀掉 CLI 子进程
      abort.abort()
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
