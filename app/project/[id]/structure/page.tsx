'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import { useProjectStore } from '@/lib/store/projectStore'
import type { NodeType, Chapter, Act, StoryNode } from '@/lib/types/project'
import FlowView from './FlowView'
import EndingsSection from './EndingsSection'

type AiNodeDraft = { title: string; type: string; notes: string }
type AiActDraft = { title: string; nodes: AiNodeDraft[] }
type AiChapterDraft = { title: string; acts: AiActDraft[] }

type AiChoice = { text: string; targetNodeTitle: string; targetNodeId?: string; variableEffects?: string; choiceWeight?: 'light' | 'heavy' | 'critical'; consequence?: string }
type AiNodeChoices = { nodeTitle: string; nodeId?: string; choices: AiChoice[]; exploreReturnNodeId?: string }

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
  const { project, updateNode, deleteNode, addNode, addChapter, addAct, updateAct, addVariable, updateVariable, bulkSetStructure, advancePhase, clearDownstream, clearStaleFlag, addEnding, updateEnding, deleteEnding } = useProjectStore()

  const [stage, setStage] = useState<Stage>(() => {
    if (!project || project.nodes.length === 0) return 'struct_loading'
    return 'edit'
  })

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [structDraft, setStructDraft] = useState<AiChapterDraft[] | null>(null)
  const [branchDraft, setBranchDraft] = useState<AiNodeChoices[] | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
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

  async function generateStructure() {
    setStage('struct_loading')
    setAiError(null)
    const scalePlan = project!.scalePlanOptions.find(p => p.id === project!.selectedScalePlanId)
    try {
      const res = await fetch('/api/ai/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { worldAnchor: project!.worldAnchor, scalePlan, characters: project!.characters },
        }),
      })
      const data = await res.json()
      let chapters = data.result?.chapters ?? (Array.isArray(data.result) ? data.result : null)
      if (!data.ok || !Array.isArray(chapters)) {
        setAiError(data.error || `AI 返回格式错误：${String(data.raw ?? '').slice(0, 200)}`)
        setStage('edit')
        return
      }
      chapters = chapters.map((ch: AiChapterDraft) => ({
        ...ch,
        acts: (ch.acts ?? []).map((act: AiActDraft) => ({ ...act, nodes: act.nodes ?? [] })),
      }))
      setStructDraft(chapters)
      setStage('struct_preview')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '请求失败')
      setStage('edit')
    }
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

  function commitBranches(draft: AiNodeChoices[]) {
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
        conditions: '',
        variableEffects: c.variableEffects ?? '',
        choiceWeight: c.choiceWeight,
        consequence: c.consequence,
      })).filter(ch => ch.targetNodeId)
      if (choices.length > 0) patchMap.set(nodeId, { choices })
    })

    // 为所有无出口的非结局节点补顺序连接（跨幕跨章）
    const orderedNodes: StoryNode[] = []
    project!.chapters.sort((a, b) => a.order - b.order).forEach(ch => {
      project!.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).forEach(act => {
        act.nodeIds.forEach(nid => { const n = nodeById.get(nid); if (n) orderedNodes.push(n) })
      })
    })

    nodes.forEach(node => {
      const pending = patchMap.get(node.id)
      const pendingChoices = pending?.choices
      const alreadyHasChoices = pendingChoices ? pendingChoices.length > 0 : node.choices.length > 0
      if (node.type === 'ending' || node.type === 'explore' || alreadyHasChoices) return
      const idx = orderedNodes.findIndex(n => n.id === node.id)
      const nextNode = orderedNodes[idx + 1]
      if (nextNode) {
        patchMap.set(node.id, {
          ...pending,
          choices: [{ id: nanoid(8), nodeId: node.id, text: '继续', order: 0, targetNodeId: nextNode.id, conditions: '', variableEffects: '' }]
        })
      }
    })

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
        <p className="text-sm text-gray-500">AI 正在生成节点结构...</p>
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
  if (stage === 'branch_preview' && branchDraft) return (
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
    </div>
  )

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
                <button onClick={() => { bulkSetStructure([], [], []); setConfirmReset(false); generateStructure() }} className="text-xs px-2 py-1 bg-amber-600 text-white rounded">确认</button>
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
              onClick={() => { clearDownstream(); generateStructure() }}
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
