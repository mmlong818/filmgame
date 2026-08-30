'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import { useProjectStore } from '@/lib/store/projectStore'
import { aiJson, aiStructureFetch } from '@/lib/ai/client'
import { AiActionError, isAbortError, type AiErrorType } from '@/lib/ai/errors'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { NODE_TYPES } from '@/lib/ui/nodeTypes'
import type { NodeType, Chapter, Act, StoryNode, VariableType } from '@/lib/types/project'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { ConfirmButton } from '@/app/components/ui/confirm'
import { IndexCard } from '@/app/components/ui/index-card'
import { NodeTypeBadge } from '@/app/components/ui/tag'
import { SkeletonLines } from '@/app/components/ui/skeleton'
import { StickyNote } from '@/app/components/ui/sticky-note'
import { AssistRail, AssistSection } from '@/app/components/ui/assist-rail'
import FlowView from './FlowView'
import EndingsSection from './EndingsSection'
import { TargetedFixPanel } from './TargetedFixPanel'
import { TargetedFixTrigger } from './TargetedFixTrigger'
import { SelfCheckPanel } from './SelfCheckPanel'
import { useTargetedFix } from './useTargetedFix'
import { useToast } from '@/app/components/toast'

// 结局线自动携带：把世界锚点阶段设计的结局线绑定到同名结局节点，补全「结局定义」。
// 此前二者互不相通，编剧要手动重复录入（校验 ENDING_NO_DEF），预览结局画面也会退化为中性兜底。
function importEndingDefinitions(): number {
  const store = useProjectStore.getState()
  const p = store.project
  const designs = p?.worldAnchor?.endingsDesign ?? []
  if (!p || designs.length === 0) return 0
  let imported = 0
  for (const design of designs) {
    const node = p.nodes.find(n =>
      n.type === 'ending' && (n.title === design.title || n.title.includes(design.title) || design.title.includes(n.title)),
    )
    if (!node) continue
    const current = useProjectStore.getState().project
    if (current?.endings.some(e => e.nodeId === node.id)) continue
    store.addEnding(node.id)
    const created = useProjectStore.getState().project?.endings.find(e => e.nodeId === node.id)
    if (created) {
      store.updateEnding(created.id, {
        title: design.title,
        type: design.type,
        description: design.description ?? '',
        conditions: design.triggerCondition ?? '',
      })
      imported++
    }
  }
  return imported
}

type AiNodeDraft = { title: string; type: string; notes: string }
type AiActDraft = { title: string; nodes: AiNodeDraft[] }
type AiChapterDraft = { title: string; acts: AiActDraft[] }

type AiChoice = { text: string; targetNodeTitle: string; targetNodeId?: string; variableEffects?: string; choiceWeight?: 'light' | 'heavy' | 'critical'; consequence?: string; conditions?: string }
type AiNodeChoices = { nodeTitle: string; nodeId?: string; choices: AiChoice[]; exploreReturnNodeId?: string }

type StructProgress = { phase: 'spine' | 'chapters'; done: number; total: number }
type StructStreamEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'spine'; ok: boolean }
  | { type: 'chapter'; done: number; total: number; warnings?: string[] }
  | { type: 'done'; chapters: AiChapterDraft[]; errors: string[]; warnings?: string[] }
  | { type: 'error'; error: string; errorType: string }

function normalizeChapters(chapters: AiChapterDraft[]): AiChapterDraft[] {
  return (chapters ?? []).map(ch => ({
    ...ch,
    acts: (ch.acts ?? []).map(act => ({ ...act, nodes: act.nodes ?? [] })),
  }))
}

const KNOWN_ERROR_TYPES: readonly AiErrorType[] = ['no_cli', 'timeout', 'parse_failed', 'unknown']
function toErrorType(t: string): AiErrorType {
  return (KNOWN_ERROR_TYPES as readonly string[]).includes(t) ? (t as AiErrorType) : 'unknown'
}

type Stage =
  | 'struct_loading' | 'struct_preview'
  | 'branch_loading' | 'branch_preview'
  | 'edit'

type ViewMode = 'list' | 'flow'

const VALID_NODE_TYPES = ['start', 'normal', 'branch', 'merge', 'ending', 'explore'] as const
function isValidNodeType(t: string): t is NodeType {
  return (VALID_NODE_TYPES as readonly string[]).includes(t)
}
function draftNodeType(t: string): NodeType {
  return isValidNodeType(t) ? t : 'normal'
}

export default function StructurePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { project, updateNode, deleteNode, addNode, addChapter, addAct, updateAct, addVariable, updateVariable, bulkSetStructure, advancePhase, resetStructure, clearDownstream, clearStaleFlag, addEnding, updateEnding, deleteEnding } = useProjectStore()

  const [stage, setStage] = useState<Stage>(() => {
    if (!project || project.nodes.length === 0) return 'struct_loading'
    return 'edit'
  })

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [structDraft, setStructDraft] = useState<AiChapterDraft[] | null>(null)
  const [branchDraft, setBranchDraft] = useState<AiNodeChoices[] | null>(null)
  const [structWarnings, setStructWarnings] = useState<string[]>([])
  const [structProgress, setStructProgress] = useState<StructProgress | null>(null)
  const runIdRef = useRef<string | null>(null)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set())

  const structAi = useAiAction()
  const branchAi = useAiAction()
  const { fixAi, fixDraft, selfCheck, runTargetedFix, applyFix, closeFixDraft } = useTargetedFix(project, stage, toast)

  useEffect(() => {
    if (!project) return
    if (stage === 'struct_loading' && project.nodes.length === 0) generateStructure()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-pencil text-sm">加载中...</div>
  )

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
      setStructDraft(normalizeChapters(evt.chapters))
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

    if (result === null) setStage('edit')
  }

  function commitStructure(draft: AiChapterDraft[]) {
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

  async function generateBranches(nodes?: StoryNode[]) {
    setStage('branch_loading')
    const nodeList = nodes ?? project!.nodes

    const result = await branchAi.run('生成分支', async (signal) => {
      const data = await aiJson<{ result?: { nodeChoices?: AiNodeChoices[] } }>('branches', 'generate', {
        worldAnchor: project!.worldAnchor,
        characters: project!.characters,
        variables: project!.variables,
        nodes: nodeList.map(n => ({ id: n.id, title: n.title, type: n.type, notes: n.notes })),
      }, signal)
      const nodeChoices = data.result?.nodeChoices
      if (!Array.isArray(nodeChoices)) throw new AiActionError('AI 分支返回格式错误')
      setBranchDraft(nodeChoices)
      setStage('branch_preview')
      return true
    })

    if (result === null) setStage('edit')
  }

  // 解析 AI 返回的分支选择为 patch（key = nodeId），不含自动补连
  function resolveChoicePatches(draft: AiNodeChoices[]): Map<string, Partial<StoryNode>> {
    const nodes = project!.nodes
    const nodeByTitle = new Map(nodes.map(n => [n.title, n.id]))
    const nodeById = new Map(nodes.map(n => [n.id, n]))

    function resolveTargetId(c: AiChoice): string {
      if (c.targetNodeId && nodeById.has(c.targetNodeId)) return c.targetNodeId
      const exact = nodeByTitle.get(c.targetNodeTitle)
      if (exact) return exact
      const fuzzy = nodes.find(n =>
        n.title.includes(c.targetNodeTitle) || c.targetNodeTitle.includes(n.title)
      )
      return fuzzy?.id ?? ''
    }

    // 收集所有节点的 patch，key = nodeId
    const patchMap = new Map<string, Partial<StoryNode>>()

    // 按 nodeId 优先（AI 新 prompt 返回 nodeId），fallback 到 title
    draft.forEach(nc => {
      const nodeId = (nc.nodeId && nodeById.has(nc.nodeId)) ? nc.nodeId : nodeByTitle.get(nc.nodeTitle)
      if (!nodeId) return
      // explore节点：设置 exploreReturnNodeId，不设choices
      if (nc.exploreReturnNodeId && nodeById.has(nc.exploreReturnNodeId)) {
        patchMap.set(nodeId, { exploreReturnNodeId: nc.exploreReturnNodeId, choices: [] })
        return
      }
      const choices = (nc.choices ?? []).map((c, i) => ({
        id: nanoid(8), nodeId,
        text: c.text, order: i,
        targetNodeId: resolveTargetId(c),
        // AI 在 branches:generate 提示词中被要求为门控节点（如"路线门控"）填写具体变量条件，
        // 后端 ChoiceDraftSchema 也支持该字段——此前这里硬编码空字符串，等于把 AI 返回的
        // conditions 值原样丢弃，导致门控条件在所有分支上都形同虚设。
        conditions: c.conditions ?? '',
        variableEffects: c.variableEffects ?? '',
        choiceWeight: c.choiceWeight,
        consequence: c.consequence,
      })).filter(ch => ch.targetNodeId)
      if (choices.length > 0) patchMap.set(nodeId, { choices })
    })

    return patchMap
  }

  // 为所有无出口的非结局/非探索节点补顺序连接（跨幕跨章），返回补连边列表 + 合并后的 patchMap
  function computeAutoConnectEdges(patchMap: Map<string, Partial<StoryNode>>): {
    edges: { fromId: string; fromTitle: string; toId: string; toTitle: string }[]
    patchMap: Map<string, Partial<StoryNode>>
  } {
    const nodes = project!.nodes
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const mergedPatchMap = new Map(patchMap)

    const orderedNodes: StoryNode[] = []
    project!.chapters.sort((a, b) => a.order - b.order).forEach(ch => {
      project!.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).forEach(act => {
        act.nodeIds.forEach(nid => { const n = nodeById.get(nid); if (n) orderedNodes.push(n) })
      })
    })

    const edges: { fromId: string; fromTitle: string; toId: string; toTitle: string }[] = []
    nodes.forEach(node => {
      const pending = mergedPatchMap.get(node.id)
      const pendingChoices = pending?.choices
      const alreadyHasChoices = pendingChoices ? pendingChoices.length > 0 : node.choices.length > 0
      if (node.type === 'ending' || node.type === 'explore' || alreadyHasChoices) return
      const idx = orderedNodes.findIndex(n => n.id === node.id)
      const nextNode = orderedNodes[idx + 1]
      if (nextNode) {
        edges.push({ fromId: node.id, fromTitle: node.title, toId: nextNode.id, toTitle: nextNode.title })
        mergedPatchMap.set(node.id, {
          ...pending,
          choices: [{ id: nanoid(8), nodeId: node.id, text: '继续', order: 0, targetNodeId: nextNode.id, conditions: '', variableEffects: '' }]
        })
      }
    })

    return { edges, patchMap: mergedPatchMap }
  }

  function commitBranches(draft: AiNodeChoices[]) {
    const nodes = project!.nodes
    const choicePatchMap = resolveChoicePatches(draft)
    const { patchMap } = computeAutoConnectEdges(choicePatchMap)

    // 一次性批量写入
    const store = useProjectStore.getState()
    const updatedNodes = nodes.map(n => {
      const patch = patchMap.get(n.id)
      return patch ? { ...n, ...patch } : n
    })
    store.bulkSetStructure(project!.chapters, project!.acts, updatedNodes)
  }

  function toggleChapter(id: string) {
    setExpandedChapters(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAct(id: string) {
    setExpandedActs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const currentAiError = structAi.error ?? branchAi.error
  function retryCurrentError() {
    if (structAi.error) generateStructure()
    else if (branchAi.error) generateBranches()
  }

  // ── 结构生成中 ──
  if (stage === 'struct_loading') return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-ink mb-2">结构与分支</h2>
      <div className="flex flex-col items-center py-16 gap-5">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-vermilion animate-spin" />
        <StickyNote title="AI 助理" tone="yellow" className="w-full max-w-sm">
          {!structProgress && 'AI 正在生成叙事骨干...'}
          {structProgress?.phase === 'spine' && '骨干生成完成，正在规划章节...'}
          {structProgress?.phase === 'chapters' && `骨干完成，正在生成第 ${structProgress.done}/${structProgress.total} 章`}
          {structProgress?.phase === 'chapters' && structProgress.total > 0 && (
            <div className="mt-2.5 h-1 bg-line/40">
              <div
                className="h-full bg-vermilion transition-all duration-300"
                style={{ width: `${Math.min(100, (structProgress.done / structProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </StickyNote>
        <SkeletonLines lines={4} className="w-full max-w-sm" />
        <Button variant="secondary" size="sm" onClick={() => structAi.cancel()}>中止生成</Button>
      </div>
    </div>
  )

  // ── 结构预览 ──
  if (stage === 'struct_preview' && structDraft) return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">结构与分支</h2>
          <p className="text-sm text-pencil mt-1">第 1/2 步：确认节点结构</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={generateStructure}>重新生成</Button>
          <Button variant="secondary" size="sm" onClick={() => { setStructDraft(null); setStage('edit') }}>修改</Button>
          <Button
            variant="primary" size="sm"
            onClick={() => {
              const nodes = commitStructure(structDraft)
              setStructDraft(null)
              generateBranches(nodes)
            }}
          >通过 → 生成分支</Button>
        </div>
      </div>
      {structWarnings.length > 0 && (
        <div className="mb-4 text-xs text-amberink bg-paper border-l-[3px] border-amberink px-3 py-2 space-y-1">
          {structWarnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}
      <div className="space-y-3">
        {(structDraft ?? []).map((ch, ci) => (
          <div key={ci} className="bg-paper border border-line" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-4 py-3 border-b border-line-soft">
              <span className="tape-label text-sm text-ink">{ch.title}</span>
            </div>
            <div className="px-4 py-2 space-y-2">
              {(ch.acts ?? []).map((act, ai) => (
                <div key={ai} className="bg-paper-dim border border-line-soft">
                  <div className="px-3 py-2 border-b border-line-soft">
                    <span className="text-xs font-medium text-ink-soft">{act.title}</span>
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {(act.nodes ?? []).map((node, ni) => (
                      <div key={ni} className="flex items-center gap-2 py-1">
                        <NodeTypeBadge type={draftNodeType(node.type)} />
                        <span className="text-sm text-ink">{node.title}</span>
                        {node.notes && <span className="text-xs text-pencil truncate flex-1">{node.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── 分支生成中 ──
  if (stage === 'branch_loading') return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-ink mb-2">结构与分支</h2>
      <div className="flex flex-col items-center py-16 gap-5">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-vermilion animate-spin" />
        <StickyNote title="AI 助理" tone="yellow" className="w-full max-w-sm">AI 正在生成分支选项...</StickyNote>
        <SkeletonLines lines={4} className="w-full max-w-sm" />
        <Button variant="secondary" size="sm" onClick={() => branchAi.cancel()}>中止生成</Button>
      </div>
    </div>
  )

  // ── 分支预览 ──
  if (stage === 'branch_preview' && branchDraft) {
    const autoConnectEdges = computeAutoConnectEdges(resolveChoicePatches(branchDraft)).edges
    return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">结构与分支</h2>
          <p className="text-sm text-pencil mt-1">第 2/2 步：确认分支选项</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => generateBranches()}>重新生成</Button>
          <Button variant="secondary" size="sm" onClick={() => { setBranchDraft(null); setStage('edit') }}>修改</Button>
          <Button
            variant="primary" size="sm"
            onClick={() => {
              commitBranches(branchDraft)
              setBranchDraft(null)
              setStage('edit')
              const n = importEndingDefinitions()
              if (n > 0) toast(`已从世界锚点自动导入 ${n} 条结局定义`)
            }}
          >通过</Button>
        </div>
      </div>
      <div className="space-y-2">
        {branchDraft.map((nc, i) => (
          <div key={i} className="bg-paper border border-line p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
            <p className="text-sm font-medium text-ink mb-2">{nc.nodeTitle}</p>
            <div className="space-y-1 pl-3">
              {(nc.choices ?? []).map((c, j) => (
                <div key={j} className="flex items-center gap-2 text-sm text-ink-soft">
                  <span className="text-pencil">→</span>
                  <span className="font-medium">{c.text}</span>
                  <span className="text-xs text-pencil">跳转到：{c.targetNodeTitle || project.nodes.find(n => n.id === c.targetNodeId)?.title || c.targetNodeId || '未设置'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {autoConnectEdges.length > 0 && (
        <div className="mt-4 bg-paper border-l-[3px] border-amberink p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <p className="text-sm font-medium text-amberink mb-2">
            将自动补连 {autoConnectEdges.length} 条顺序推进边
          </p>
          <p className="text-xs text-amberink/80 mb-3">以下节点未获得 AI 分支且非结局/探索节点，通过后将自动添加"继续"选项以保证故事可推进：</p>
          <div className="space-y-1 pl-3">
            {autoConnectEdges.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amberink">
                <span className="text-amberink/50">→</span>
                <span className="font-medium">{e.fromTitle}</span>
                <span className="text-amberink/70">继续</span>
                <span className="text-xs text-amberink/70">跳转到：{e.toTitle}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
  }

  // ── 编辑模式 ──
  const isFlowMode = viewMode === 'flow'

  return (
    <div className={isFlowMode ? 'flex flex-col h-[calc(100vh-112px)]' : ''}>
      {/* 顶部：标题 */}
      <div className="max-w-6xl mx-auto px-6 py-8 pb-0 flex-shrink-0 w-full">
        <h2 className="text-xl font-semibold text-ink">结构与分支</h2>
        <p className="text-sm text-pencil mt-1">建立章幕节点与分支连接</p>
      </div>

      <div className={isFlowMode
        ? 'flex-1 min-h-0 flex flex-col lg:flex-row gap-6 items-start px-4 pt-4 pb-4 w-full'
        : 'max-w-6xl mx-auto px-6 pt-4 pb-8 w-full flex flex-col lg:flex-row gap-6 items-start'}
      >
        {/* ── 核心产出区 ── */}
        <section aria-label="核心产出区" className={isFlowMode ? 'flex-1 min-w-0 h-full flex flex-col gap-3' : 'flex-1 min-w-0'}>
          {project.downstreamStale && (
            <div className="mb-4 flex items-center gap-3 bg-paper border-l-[3px] border-amberink px-4 py-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <span className="text-amberink text-sm flex-1">世界设定已修改，当前结构基于旧版本，建议重新生成</span>
              <Button size="sm" variant="primary" onClick={() => { clearDownstream('structure'); generateStructure() }}>重新生成</Button>
              <Button size="sm" variant="secondary" onClick={() => clearStaleFlag()}>继续使用旧版本</Button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            {/* 视图切换 */}
            <div className="flex text-xs border border-line">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 cursor-pointer transition-colors ${viewMode === 'list' ? 'bg-paper-dim text-ink font-medium' : 'text-pencil hover:bg-paper-dim/60'}`}
              >
                列表
              </button>
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1.5 border-l border-line cursor-pointer transition-colors ${viewMode === 'flow' ? 'bg-paper-dim text-ink font-medium' : 'text-pencil hover:bg-paper-dim/60'}`}
              >
                流程图
              </button>
            </div>
            {viewMode === 'list' && (
              <Button variant="primary" size="sm" onClick={() => addChapter(`第${project.chapters.length + 1}章`)}>+ 添加章</Button>
            )}
          </div>

          {isFlowMode ? (
            <div className="flex-1 min-h-0">
              <FlowView project={project} />
            </div>
          ) : (
            <>
              {project.chapters.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-line text-pencil">
                  <p className="text-sm">点击「添加章」开始构建，或「重新 AI 设计」</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {project.chapters.sort((a, b) => a.order - b.order).map(chapter => {
                    const isOpen = expandedChapters.has(chapter.id)
                    const acts = project.acts.filter(a => a.chapterId === chapter.id)
                    return (
                      <div key={chapter.id} className="bg-paper border border-line" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-paper-dim" onClick={() => toggleChapter(chapter.id)}>
                          <span className="text-pencil text-xs">{isOpen ? '▼' : '▶'}</span>
                          <span className="tape-label text-sm text-ink">{chapter.title}</span>
                          <span className="text-xs text-pencil ml-auto">{acts.length} 幕 · {acts.reduce((a, act) => a + act.nodeIds.length, 0)} 节点</span>
                        </div>
                        {isOpen && (
                          <div className="border-t border-line-soft px-4 py-3 space-y-2">
                            {acts.sort((a, b) => a.order - b.order).map(act => {
                              const isActOpen = expandedActs.has(act.id)
                              const nodes = project.nodes.filter(n => act.nodeIds.includes(n.id))
                              return (
                                <div key={act.id} className="bg-paper-dim border border-line-soft">
                                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-kraft/30" onClick={() => toggleAct(act.id)}>
                                    <span className="text-pencil text-xs">{isActOpen ? '▼' : '▶'}</span>
                                    <span className="text-xs font-medium text-ink-soft">{act.title}</span>
                                    <select
                                      value={act.dramaticFunction ?? ''}
                                      onChange={e => updateAct(act.id, { dramaticFunction: e.target.value as Act['dramaticFunction'] || undefined })}
                                      onClick={e => e.stopPropagation()}
                                      className="text-xs border border-line px-1.5 py-1 bg-paper text-pencil focus:outline-none cursor-pointer"
                                    >
                                      <option value="">功能</option>
                                      <option value="setup">建置</option>
                                      <option value="conflict">冲突</option>
                                      <option value="turn">转折</option>
                                      <option value="resolution">解决</option>
                                    </select>
                                    <span className="text-xs text-pencil ml-auto">{nodes.length} 节点</span>
                                  </div>
                                  {isActOpen && (
                                    <div className="px-3 pb-2 space-y-1.5">
                                      {nodes.map(node => (
                                        <IndexCard key={node.id} pinned={false} className="flex items-center gap-2">
                                          <NodeTypeBadge type={node.type} />
                                          <input value={node.title} onChange={e => updateNode(node.id, { title: e.target.value })} className="flex-1 text-sm text-ink bg-transparent border-none outline-none" />
                                          <select value={node.type} onChange={e => updateNode(node.id, { type: e.target.value as NodeType })} className="text-xs text-pencil border-none bg-transparent outline-none cursor-pointer">
                                            {Object.entries(NODE_TYPES).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
                                          </select>
                                          <button onClick={() => deleteNode(node.id)} className="text-pencil/60 hover:text-vermilion text-xs cursor-pointer">✕</button>
                                        </IndexCard>
                                      ))}
                                      <button onClick={() => addNode(act.id)} className="w-full text-xs text-vermilion hover:text-vermilion-deep py-1.5 border border-dashed border-vermilion/40 cursor-pointer">+ 添加节点</button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            <button onClick={() => addAct(chapter.id, `第${acts.length + 1}幕`)} className="w-full text-xs text-pencil py-2 border border-dashed border-line hover:border-ink-soft cursor-pointer">+ 添加幕</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 bg-paper border border-line p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink-soft">变量系统</h3>
                  <Button variant="link" size="sm" onClick={() => addVariable('新变量')}>+ 添加变量</Button>
                </div>
                {project.variables.length === 0 ? (
                  <p className="text-xs text-pencil italic">暂无变量。变量用于追踪玩家选择对故事的影响。</p>
                ) : (
                  <div className="space-y-2">
                    {project.variables.map(v => (
                      <div key={v.id} className="flex items-center gap-2">
                        <Input value={v.name} onChange={e => updateVariable(v.id, { name: e.target.value })} className="flex-1" />
                        <select value={v.type} onChange={e => updateVariable(v.id, { type: e.target.value as VariableType })} className="text-xs border border-line px-2 py-2 bg-paper text-ink cursor-pointer">
                          <option value="flag">开关</option>
                          <option value="counter">计数</option>
                          <option value="relationship">关系值</option>
                          <option value="item">道具</option>
                        </select>
                        <Input value={v.description} onChange={e => updateVariable(v.id, { description: e.target.value })} placeholder="描述" className="w-32 text-xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                {project.endings.length === 0 && (project.worldAnchor?.endingsDesign?.length ?? 0) > 0 && (
                  <div className="bg-paper border-l-[3px] border-inkblue px-3 py-2 mb-3 flex items-center gap-3 text-[12.5px] text-ink-soft">
                    <span className="flex-1">世界锚点已设计 {project.worldAnchor!.endingsDesign!.length} 条结局线，可直接绑定到同名结局节点</span>
                    <Button size="sm" variant="secondary" onClick={() => {
                      const n = importEndingDefinitions()
                      toast(n > 0 ? `已导入 ${n} 条结局定义` : '未找到可匹配的结局节点', n > 0 ? 'success' : 'info')
                    }}>从世界锚点导入</Button>
                  </div>
                )}
                <EndingsSection
                  project={project}
                  addEnding={addEnding}
                  updateEnding={updateEnding}
                  deleteEnding={deleteEnding}
                />
              </div>

              <div className="flex justify-between items-center mt-8">
                <div className="text-sm text-pencil">共 {project.chapters.length} 章 · {project.acts.length} 幕 · {project.nodes.length} 节点</div>
                <Button
                  variant="primary"
                  onClick={() => { advancePhase(); router.push(`/project/${project!.id}/workshop`) }}
                  disabled={project.nodes.length === 0}
                >
                  下一步：场景填充 →
                </Button>
              </div>
            </>
          )}
        </section>

        {/* ── 辅助区 ── */}
        <AssistRail>
          <AssistSection title="AI 协作">
            <div className="bg-paper border border-line-soft p-3.5 space-y-3">
              {project.nodes.length > 0 && (
                <Button variant="primary" size="sm" className="w-full" onClick={() => generateBranches()}>
                  {project.nodes.some(n => n.choices.length > 0) ? '重新生成分支' : 'AI 生成分支选项'}
                </Button>
              )}
              <ConfirmButton
                variant="danger" size="sm" className="w-full"
                confirmLabel="确认重新设计？"
                onConfirm={() => {
                  // 清空结构 + 阶段回退 + 重锁后续阶段收敛在单个 store action（一次保存）里：
                  // 拆成"清空 + goToPhase"两个 action 会各自武装一条带同一 expectedVersion
                  // 的项目级保存，且 goToPhase 不会重新锁定 workshop/validate。
                  resetStructure()
                  generateStructure()
                }}
              >重新 AI 设计</ConfirmButton>
              {currentAiError && (
                <div className="text-xs text-vermilion bg-vermilion/5 border-l-[3px] border-vermilion px-2.5 py-2 space-y-1.5">
                  <p>{currentAiError}</p>
                  <Button size="sm" variant="danger" className="w-full" onClick={retryCurrentError}>重试</Button>
                </div>
              )}
              {structWarnings.length > 0 && (
                <div className="text-[11px] text-amberink bg-amberink/5 border-l-[3px] border-amberink px-2.5 py-2 space-y-1">
                  {structWarnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
              <TargetedFixTrigger hasValidation={!!project.lastValidation} fixAi={fixAi} onRun={runTargetedFix} />
            </div>
          </AssistSection>

          <AssistSection title="结构体检">
            <SelfCheckPanel selfCheck={selfCheck} />
          </AssistSection>

          <AssistSection title="分析">
            <Link href={`/project/${project.id}/branches`}>
              <Button variant="secondary" size="sm" className="w-full">分支路径分析</Button>
            </Link>
          </AssistSection>

          <AssistSection title="说明">
            <div className="bg-paper border border-line-soft p-3.5 space-y-3">
              <div className="space-y-1.5">
                {Object.entries(NODE_TYPES).map(([value, s]) => (
                  <div key={value} className="flex items-center gap-2 text-xs text-ink-soft">
                    <span className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: s.hex }} />
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11.5px] text-pencil leading-relaxed space-y-1.5 pt-2 border-t border-line-soft">
                <p>本阶段产出：章、幕、节点树及其分支连接、变量系统、结局定义——共同构成完整的分支剧情结构。</p>
                <p>变量用于追踪玩家选择对故事的影响；结局节点可在「结局定义」中绑定类型与触发条件。</p>
              </div>
            </div>
          </AssistSection>
        </AssistRail>
      </div>
      <TargetedFixPanel draft={fixDraft} nodes={project.nodes} onClose={closeFixDraft} onApply={applyFix} />
    </div>
  )
}
