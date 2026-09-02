'use client'
// 结构生成流：流式 NDJSON 消费 + 非流式回退 + 草稿落库。
// 从 structure/page.tsx 抽出（该文件曾达 939 行，超过 800 行上限），
// 与 useBranchGeneration / useTargetedFix 并列，页面只做状态装配与渲染。
import { useState, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '@/lib/store/projectStore'
import { aiStructureFetch } from '@/lib/ai/client'
import { AiActionError, isAbortError } from '@/lib/ai/errors'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { setRunningGeneration } from '@/lib/ui/pendingDraftGuard'
import type { Project, Chapter, Act, StoryNode } from '@/lib/types/project'
import {
  normalizeChapters, toErrorType, draftNodeType,
  type AiChapterDraft, type StructProgress, type StructStreamEvent, type Stage,
} from './draftTypes'

interface Params {
  project: Project | null
  setStage: (s: Stage) => void
  toast: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function useStructureGeneration({ project, setStage, toast }: Params) {
  const bulkSetStructure = useProjectStore(s => s.bulkSetStructure)
  const [structDraft, setStructDraft] = useState<AiChapterDraft[] | null>(null)
  const [structWarnings, setStructWarnings] = useState<string[]>([])
  const [structProgress, setStructProgress] = useState<StructProgress | null>(null)
  const runIdRef = useRef<string | null>(null)
  const structAi = useAiAction()

  // 处理一帧 NDJSON 事件；返回 true 表示已到达终态（done），调用方据此判断流是否正常收尾
  function handleStructStreamEvent(evt: StructStreamEvent): boolean {
    if (evt.type === 'run') {
      runIdRef.current = evt.runId
      return false
    }
    if (evt.type === 'spine') {
      setStructProgress({ phase: 'spine', done: evt.ok ? 1 : 0, total: 1 })
      return false
    }
    if (evt.type === 'chapter') {
      setStructProgress({ phase: 'chapters', done: evt.done, total: evt.total })
      if (evt.warnings && evt.warnings.length > 0) {
        setStructWarnings(prev => [...prev, ...evt.warnings!])
      }
      return false
    }
    if (evt.type === 'done') {
      const chapters = normalizeChapters(evt.chapters)
      // done ≠ 成功：并行章生成可能部分/全部失败（errors 随 done 帧返回）。
      // 空章或缺章都不得进预览态——曾先后导致「空草稿被通过后清空项目」与
      // 「三章只成功一章、部分结构被静默应用」两起事故。
      const expectedChapters = project?.scalePlanOptions.find(pl => pl.id === project.selectedScalePlanId)?.chapterCount ?? chapters.length
      if (chapters.length === 0 || chapters.length < expectedChapters) {
        throw new AiActionError(
          `结构生成不完整（${chapters.length}/${expectedChapters} 章）：${(evt.errors ?? []).join('；') || '部分章节未生成'}——请点击"重新生成"重试`,
          'unknown', runIdRef.current ?? undefined,
        )
      }
      if (evt.errors && evt.errors.length > 0) {
        setStructWarnings(prev => [...prev, ...evt.errors].filter((w, i, arr) => arr.indexOf(w) === i))
      }
      setStructDraft(chapters)
      if (evt.warnings && evt.warnings.length > 0) {
        setStructWarnings(prev => [...prev, ...evt.warnings!].filter((w, i, arr) => arr.indexOf(w) === i))
      }
      setStage('struct_preview')
      return true
    }
    throw new AiActionError(evt.error, toErrorType(evt.errorType), runIdRef.current ?? undefined)
  }

  // 消费流式 NDJSON 响应体；正常收尾返回 true。中止或截断均以抛出异常的方式交给 useAiAction 统一处理
  async function consumeStructStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<boolean> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let reachedEnd = false
    const onAbort = () => { reader.cancel().catch(() => {}) }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort)
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          reachedEnd = handleStructStreamEvent(JSON.parse(line) as StructStreamEvent) || reachedEnd
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      reader.releaseLock()
    }
    if (signal.aborted) throw new DOMException('已取消生成', 'AbortError')
    return reachedEnd
  }

  async function generateStructureFallback(context: Record<string, unknown>, signal: AbortSignal) {
    const res = await aiStructureFetch('/api/ai/structure', context, { signal })
    const data = await res.json()
    runIdRef.current = data.runId ?? runIdRef.current
    const chapters = data.result?.chapters ?? (Array.isArray(data.result) ? data.result : null)
    if (!data.ok || !Array.isArray(chapters)) {
      throw new AiActionError(data.error || `AI 返回格式错误：${String(data.raw ?? '').slice(0, 200)}`, 'unknown', runIdRef.current ?? undefined)
    }
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      setStructWarnings(prev => [...prev, ...data.warnings])
    }
    setStructDraft(normalizeChapters(chapters))
    setStage('struct_preview')
  }

  async function generateStructure() {
    setStage('struct_loading')
    setStructWarnings([])
    setStructProgress(null)
    runIdRef.current = null
    const scalePlan = project!.scalePlanOptions.find(p => p.id === project!.selectedScalePlanId)
    const context = { worldAnchor: project!.worldAnchor, scalePlan, characters: project!.characters }

    setRunningGeneration('结构生成')
    const result = await structAi.run('生成结构', async (signal) => {
      let streamStarted = false
      try {
        const res = await aiStructureFetch('/api/ai/structure/stream', context, { signal })
        if (res.ok && res.body) {
          streamStarted = true
          const reachedEnd = await consumeStructStream(res.body, signal)
          if (!reachedEnd) {
            throw new AiActionError('生成中断（可能超出请求时长上限），请减少章节数、改用更快的 BYOK 模型，或在本地模式运行', 'unknown', runIdRef.current ?? undefined)
          }
          return true
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        if (streamStarted) {
          if (err instanceof AiActionError) throw err
          // 流已经开始消费后中途失败（服务器崩溃/连接中断）：不能静默吞掉，
          // 否则用户会一直停留在加载态转圈，看不到任何反馈（这正是曾导致上一轮真实检查
          // 会话在等待生成时被误判为"卡死"的体验缺陷）。此时明确报错。
          throw new AiActionError('生成过程中连接中断（服务器可能重启或网络波动），请点击"重新生成"重试', 'unknown', runIdRef.current ?? undefined)
        }
        // 流式连接在建立阶段就失败（网络/代理不透传）：走非流式回退
      }
      await generateStructureFallback(context, signal)
      return true
    })

    setRunningGeneration(null)
    if (result === null) setStage('edit')
  }

  function commitStructure(draft: AiChapterDraft[]) {
    // 空草稿防线：绝不能用空结构覆盖项目（bulkSetStructure 会清空全部章幕节点）
    if (!draft || draft.length === 0 || draft.every(ch => (ch.acts ?? []).every(a => (a.nodes ?? []).length === 0))) {
      toast('结构草稿为空，已取消应用——请重新生成', 'error')
      return null
    }
    const chapters: Chapter[] = []
    const acts: Act[] = []
    const nodes: StoryNode[] = []
    ;(draft ?? []).forEach((ch, ci) => {
      const chapterId = nanoid(8)
      chapters.push({ id: chapterId, title: ch.title ?? `第${ci + 1}章`, order: ci })
      ;(ch.acts ?? []).forEach((act, ai) => {
        const actId = nanoid(8)
        const actNodeIds: string[] = []
        ;(act.nodes ?? []).forEach((node, ni) => {
          const nodeId = nanoid(8)
          actNodeIds.push(nodeId)
          nodes.push({
            id: nodeId, actId, title: node.title, type: draftNodeType(node.type), order: ni,
            position: { x: ni * 200, y: ai * 120 },
            emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: node.type === 'explore' ? 2 : 5 },
            systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
            sceneDesc: '', dialogue: [], choices: [], durationSeconds: 120, notes: node.notes || '',
          })
        })
        acts.push({ id: actId, chapterId, title: act.title, order: ai, nodeIds: actNodeIds })
      })
    })
    bulkSetStructure(chapters, acts, nodes)
    return nodes
  }

  return {
    structAi, structDraft, setStructDraft, structWarnings, structProgress,
    generateStructure, commitStructure,
  }
}
