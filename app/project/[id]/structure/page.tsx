'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import { useProjectStore } from '@/lib/store/projectStore'
import type { NodeType, Chapter, Act, StoryNode } from '@/lib/types/project'
import FlowView from './FlowView'
import EndingsSection from './EndingsSection'

type AiNodeDraft = { title: string; type: string; notes: string }
type AiActDraft = { title: string; nodes: AiNodeDraft[] }
type AiChapterDraft = { title: string; acts: AiActDraft[] }

type AiChoice = { text: string; targetNodeTitle: string; targetNodeId?: string; variableEffects?: string; choiceWeight?: 'light' | 'heavy' | 'critical'; consequence?: string; conditions?: string }
type AiNodeChoices = { nodeTitle: string; nodeId?: string; choices: AiChoice[]; exploreReturnNodeId?: string }

type StructProgress = { phase: 'spine' | 'chapters'; done: number; total: number }
type StructStreamEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'spine'; ok: boolean }
  | { type: 'chapter'; done: number; total: number }
  | { type: 'done'; chapters: AiChapterDraft[]; errors: string[] }
  | { type: 'error'; error: string; errorType: string }

function normalizeChapters(chapters: AiChapterDraft[]): AiChapterDraft[] {
  return (chapters ?? []).map(ch => ({
    ...ch,
    acts: (ch.acts ?? []).map(act => ({ ...act, nodes: act.nodes ?? [] })),
  }))
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

const NODE_TYPES = [
  { value: 'start',   label: '开场', color: 'bg-green-100 text-green-700' },
  { value: 'normal',  label: '推进', color: 'bg-gray-100 text-gray-600' },
  { value: 'branch',  label: '分支', color: 'bg-blue-100 text-blue-700' },
  { value: 'merge',   label: '汇聚', color: 'bg-purple-100 text-purple-700' },
  { value: 'ending',  label: '结局', color: 'bg-amber-100 text-amber-700' },
  { value: 'explore', label: '探索', color: 'bg-teal-100 text-teal-700' },
]
const nodeTypeColor = (t: string) => NODE_TYPES.find(x => x.value === t)?.color ?? 'bg-gray-100 text-gray-600'
const nodeTypeLabel = (t: string) => NODE_TYPES.find(x => x.value === t)?.label ?? t

export default function StructurePage() {
  const router = useRouter()
  const { project, updateNode, deleteNode, addNode, addChapter, addAct, updateAct, addVariable, updateVariable, bulkSetStructure, advancePhase, goToPhase, clearDownstream, clearStaleFlag, addEnding, updateEnding, deleteEnding } = useProjectStore()

  const [stage, setStage] = useState<Stage>(() => {
    if (!project || project.nodes.length === 0) return 'struct_loading'
    return 'edit'
  })

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [structDraft, setStructDraft] = useState<AiChapterDraft[] | null>(null)
  const [branchDraft, setBranchDraft] = useState<AiNodeChoices[] | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [structProgress, setStructProgress] = useState<StructProgress | null>(null)
  const runIdRef = useRef<string | null>(null)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set())
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!project) return
    if (stage === 'struct_loading' && project.nodes.length === 0) generateStructure()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">加载中...</div>
  )

  function appendRunId(msg: string): string {
    return runIdRef.current ? `${msg}（trace: ${runIdRef.current}）` : msg
  }

  // 处理一帧 NDJSON 事件；返回 true 表示已到达终态（done/error），调用方据此判断流是否正常收尾
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
      return false
    }
    if (evt.type === 'done') {
      setStructDraft(normalizeChapters(evt.chapters))
      setStage('struct_preview')
      return true
    }
    setAiError(appendRunId(evt.error))
    setStage('edit')
    return true
  }

  // 消费流式 NDJSON 响应体；若流中途中断（未收到 done/error）返回 false，调用方展示超限提示
  async function consumeStructStream(body: ReadableStream<Uint8Array>): Promise<boolean> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let reachedEnd = false
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
      reader.releaseLock()
    }
    return reachedEnd
  }

  async function generateStructureFallback(payload: string) {
    try {
      const res = await fetch('/api/ai/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      const data = await res.json()
      runIdRef.current = data.runId ?? runIdRef.current
      const chapters = data.result?.chapters ?? (Array.isArray(data.result) ? data.result : null)
      if (!data.ok || !Array.isArray(chapters)) {
        setAiError(appendRunId(data.error || `AI 返回格式错误：${String(data.raw ?? '').slice(0, 200)}`))
        setStage('edit')
        return
      }
      setStructDraft(normalizeChapters(chapters))
      setStage('struct_preview')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '请求失败')
      setStage('edit')
    }
  }

  async function generateStructure() {
    setStage('struct_loading')
    setAiError(null)
    setStructProgress(null)
    runIdRef.current = null
    const scalePlan = project!.scalePlanOptions.find(p => p.id === project!.selectedScalePlanId)
    const payload = JSON.stringify({
      context: { worldAnchor: project!.worldAnchor, scalePlan, characters: project!.characters },
    })

    let streamStarted = false
    try {
      const res = await fetch('/api/ai/structure/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      if (res.ok && res.body) {
        streamStarted = true
        const reachedEnd = await consumeStructStream(res.body)
        if (!reachedEnd) {
          setAiError(appendRunId('生成中断（可能超出请求时长上限），请减少章节数、改用更快的 BYOK 模型，或在本地模式运行'))
          setStage('edit')
        }
        return
      }
    } catch {
      // 流已经开始消费后中途失败（服务器崩溃/连接中断）：不能静默吞掉，
      // 否则用户会一直停留在加载态转圈，看不到任何反馈（这正是曾导致上一轮真实检查
      // 会话在等待生成时被误判为"卡死"的体验缺陷）。此时明确报错并回到可操作的编辑态。
      if (streamStarted) {
        setAiError(appendRunId('生成过程中连接中断（服务器可能重启或网络波动），请点击"重新生成"重试'))
        setStage('edit')
        return
      }
      // 流式连接在建立阶段就失败（网络/代理不透传）：走非流式回退
    }
    if (!streamStarted) await generateStructureFallback(payload)
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
            id: nodeId, actId, title: node.title, type: isValidNodeType(node.type) ? node.type : 'normal', order: ni,
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
    setAiError(null)
    const nodeList = nodes ?? project!.nodes
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'branches', action: 'generate',
          context: {
            worldAnchor: project!.worldAnchor,
            characters: project!.characters,
            variables: project!.variables,
            nodes: nodeList.map(n => ({ id: n.id, title: n.title, type: n.type, notes: n.notes })),
          },
        }),
      })
      const data = await res.json()
      const nodeChoices = data.result?.nodeChoices
      if (!data.ok || !Array.isArray(nodeChoices)) {
        setAiError(data.error || 'AI 分支返回格式错误')
        setStage('edit')
        return
      }
      setBranchDraft(nodeChoices)
      setStage('branch_preview')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '请求失败')
      setStage('edit')
    }
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

  // ── 结构生成中 ──
  if (stage === 'struct_loading') return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">结构与分支</h2>
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">
          {!structProgress && 'AI 正在生成叙事骨干...'}
          {structProgress?.phase === 'spine' && '骨干生成完成，正在规划章节...'}
          {structProgress?.phase === 'chapters' && `骨干完成，正在生成第 ${structProgress.done}/${structProgress.total} 章`}
        </p>
        {aiError && <p className="mt-4 text-xs text-red-500">{aiError}</p>}
      </div>
    </div>
  )

  // ── 结构预览 ──
  if (stage === 'struct_preview' && structDraft) return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">结构与分支</h2>
          <p className="text-sm text-gray-500 mt-1">第 1/2 步：确认节点结构</p>
        </div>
        <div className="flex gap-2">
          <button onClick={generateStructure} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">重新生成</button>
          <button onClick={() => { setStructDraft(null); setStage('edit') }} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">修改</button>
          <button
            onClick={() => {
              const nodes = commitStructure(structDraft)
              setStructDraft(null)
              generateBranches(nodes)
            }}
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >通过 → 生成分支</button>
        </div>
      </div>
      <div className="space-y-3">
        {(structDraft ?? []).map((ch, ci) => (
          <div key={ci} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">{ch.title}</span>
            </div>
            <div className="px-4 py-2 space-y-2">
              {(ch.acts ?? []).map((act, ai) => (
                <div key={ai} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">{act.title}</span>
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {(act.nodes ?? []).map((node, ni) => (
                      <div key={ni} className="flex items-center gap-2 py-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${nodeTypeColor(node.type)}`}>{nodeTypeLabel(node.type)}</span>
                        <span className="text-sm text-gray-700">{node.title}</span>
                        {node.notes && <span className="text-xs text-gray-400 truncate flex-1">{node.notes}</span>}
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
      <h2 className="text-xl font-semibold text-gray-900 mb-2">结构与分支</h2>
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">AI 正在生成分支选项...</p>
        {aiError && <p className="mt-4 text-xs text-red-500">{aiError}</p>}
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
          <h2 className="text-xl font-semibold text-gray-900">结构与分支</h2>
          <p className="text-sm text-gray-500 mt-1">第 2/2 步：确认分支选项</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => generateBranches()} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">重新生成</button>
          <button onClick={() => { setBranchDraft(null); setStage('edit') }} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">修改</button>
          <button
            onClick={() => { commitBranches(branchDraft); setBranchDraft(null); setStage('edit') }}
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >通过</button>
        </div>
      </div>
      <div className="space-y-2">
        {branchDraft.map((nc, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-800 mb-2">{nc.nodeTitle}</p>
            <div className="space-y-1 pl-3">
              {(nc.choices ?? []).map((c, j) => (
                <div key={j} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-gray-300">→</span>
                  <span className="font-medium">{c.text}</span>
                  <span className="text-xs text-gray-400">跳转到：{c.targetNodeTitle || project.nodes.find(n => n.id === c.targetNodeId)?.title || c.targetNodeId || '未设置'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {autoConnectEdges.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-700 mb-2">
            将自动补连 {autoConnectEdges.length} 条顺序推进边
          </p>
          <p className="text-xs text-amber-600 mb-3">以下节点未获得 AI 分支且非结局/探索节点，通过后将自动添加"继续"选项以保证故事可推进：</p>
          <div className="space-y-1 pl-3">
            {autoConnectEdges.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-800">
                <span className="text-amber-300">→</span>
                <span className="font-medium">{e.fromTitle}</span>
                <span className="text-amber-400">继续</span>
                <span className="text-xs text-amber-500">跳转到：{e.toTitle}</span>
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
      {/* 顶部：标题 + 操作按钮 */}
      <div className="max-w-3xl mx-auto px-6 py-8 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">结构与分支</h2>
            <p className="text-sm text-gray-500 mt-1">建立章幕节点与分支连接</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 视图切换 */}
            <div className="flex text-xs border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                列表
              </button>
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${viewMode === 'flow' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                流程图
              </button>
            </div>
            {project.nodes.length > 0 && (
              <button onClick={() => generateBranches()} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                {project.nodes.some(n => n.choices.length > 0) ? '重新生成分支' : 'AI 生成分支选项'}
              </button>
            )}
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600">确认重新设计？</span>
                <button onClick={() => setConfirmReset(false)} className="text-xs px-2 py-1 border border-gray-300 rounded">取消</button>
                <button
                  onClick={() => {
                    bulkSetStructure([], [], [])
                    // 清空结构内容后，若阶段已领先到 workshop/validate，必须回退到 structure，
                    // 否则会出现"阶段显示 workshop 但节点数为 0"的阶段与内容脱节的不一致状态。
                    if (project!.currentPhase === 'workshop' || project!.currentPhase === 'validate') goToPhase('structure')
                    setConfirmReset(false)
                    generateStructure()
                  }}
                  className="text-xs px-2 py-1 bg-amber-600 text-white rounded"
                >确认</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="text-xs text-gray-400 hover:text-amber-500 underline">重新 AI 设计</button>
            )}
            {viewMode === 'list' && (
              <button onClick={() => addChapter(`第${project.chapters.length + 1}章`)} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">+ 添加章</button>
            )}
          </div>
        </div>

        {project.downstreamStale && (
          <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-amber-600 text-sm flex-1">世界设定已修改，当前结构基于旧版本，建议重新生成</span>
            <button
              onClick={() => { clearDownstream('structure'); generateStructure() }}
              className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >重新生成</button>
            <button
              onClick={() => clearStaleFlag()}
              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
            >继续使用旧版本</button>
          </div>
        )}
        {aiError && <p className="mb-4 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{aiError}</p>}
      </div>

      {/* 内容区 */}
      {isFlowMode ? (
        <div className="flex-1 min-h-0 mx-4 mb-4">
          <FlowView project={project} />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-6 pb-8 w-full">
          {project.chapters.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
              <p className="text-sm">点击「添加章」开始构建，或「重新 AI 设计」</p>
            </div>
          ) : (
            <div className="space-y-3">
              {project.chapters.sort((a, b) => a.order - b.order).map(chapter => {
                const isOpen = expandedChapters.has(chapter.id)
                const acts = project.acts.filter(a => a.chapterId === chapter.id)
                return (
                  <div key={chapter.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleChapter(chapter.id)}>
                      <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                      <span className="text-sm font-medium text-gray-800">{chapter.title}</span>
                      <span className="text-xs text-gray-400 ml-auto">{acts.length} 幕 · {acts.reduce((a, act) => a + act.nodeIds.length, 0)} 节点</span>
                    </div>
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                        {acts.sort((a, b) => a.order - b.order).map(act => {
                          const isActOpen = expandedActs.has(act.id)
                          const nodes = project.nodes.filter(n => act.nodeIds.includes(n.id))
                          return (
                            <div key={act.id} className="bg-gray-50 rounded-lg overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100" onClick={() => toggleAct(act.id)}>
                                <span className="text-gray-400 text-xs">{isActOpen ? '▼' : '▶'}</span>
                                <span className="text-xs font-medium text-gray-700">{act.title}</span>
                                <select
                                  value={act.dramaticFunction ?? ''}
                                  onChange={e => updateAct(act.id, { dramaticFunction: e.target.value as import('@/lib/types/project').Act['dramaticFunction'] || undefined })}
                                  onClick={e => e.stopPropagation()}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-500 focus:outline-none"
                                >
                                  <option value="">功能</option>
                                  <option value="setup">建置</option>
                                  <option value="conflict">冲突</option>
                                  <option value="turn">转折</option>
                                  <option value="resolution">解决</option>
                                </select>
                                <span className="text-xs text-gray-400 ml-auto">{nodes.length} 节点</span>
                              </div>
                              {isActOpen && (
                                <div className="px-3 pb-2 space-y-1.5">
                                  {nodes.map(node => (
                                    <div key={node.id} className="flex items-center gap-2 bg-white rounded px-3 py-2">
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${nodeTypeColor(node.type)}`}>{nodeTypeLabel(node.type)}</span>
                                      <input value={node.title} onChange={e => updateNode(node.id, { title: e.target.value })} className="flex-1 text-sm text-gray-800 bg-transparent border-none outline-none" />
                                      <select value={node.type} onChange={e => updateNode(node.id, { type: e.target.value as NodeType })} className="text-xs text-gray-500 border-none bg-transparent outline-none cursor-pointer">
                                        {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                      </select>
                                      <button onClick={() => deleteNode(node.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                                    </div>
                                  ))}
                                  <button onClick={() => addNode(act.id)} className="w-full text-xs text-amber-500 hover:text-amber-600 py-1.5 border border-dashed border-amber-200 rounded">+ 添加节点</button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        <button onClick={() => addAct(chapter.id, `第${acts.length + 1}幕`)} className="w-full text-xs text-gray-500 py-2 border border-dashed border-gray-200 rounded hover:border-gray-300">+ 添加幕</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">变量系统</h3>
              <button onClick={() => addVariable('新变量')} className="text-xs text-amber-500 hover:text-amber-600">+ 添加变量</button>
            </div>
            {project.variables.length === 0 ? (
              <p className="text-xs text-gray-400 italic">暂无变量。变量用于追踪玩家选择对故事的影响。</p>
            ) : (
              <div className="space-y-2">
                {project.variables.map(v => (
                  <div key={v.id} className="flex items-center gap-2">
                    <input value={v.name} onChange={e => updateVariable(v.id, { name: e.target.value })} className="text-sm border border-gray-200 rounded px-2 py-1 flex-1" />
                    <select value={v.type} onChange={e => updateVariable(v.id, { type: e.target.value as import('@/lib/types/project').VariableType })} className="text-xs border border-gray-200 rounded px-2 py-1">
                      <option value="flag">开关</option>
                      <option value="counter">计数</option>
                      <option value="relationship">关系值</option>
                      <option value="item">道具</option>
                    </select>
                    <input value={v.description} onChange={e => updateVariable(v.id, { description: e.target.value })} placeholder="描述" className="text-xs border border-gray-200 rounded px-2 py-1 w-32 text-gray-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <EndingsSection
              project={project}
              addEnding={addEnding}
              updateEnding={updateEnding}
              deleteEnding={deleteEnding}
            />
          </div>

          <div className="flex justify-between items-center mt-8">
            <div className="text-sm text-gray-500">共 {project.chapters.length} 章 · {project.acts.length} 幕 · {project.nodes.length} 节点</div>
            <button
              onClick={() => { advancePhase(); router.push(`/project/${project!.id}/workshop`) }}
              disabled={project.nodes.length === 0}
              className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一步：场景填充 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
