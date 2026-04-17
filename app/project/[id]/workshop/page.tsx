'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/app/components/toast'
import { useProjectStore } from '@/lib/store/projectStore'
import type { StoryNode, DialogueLine, EmotionFunction } from '@/lib/types/project'
import { nanoid } from 'nanoid'
import {
  inputClass,
  NODE_TYPE_LABEL,
  NODE_TYPE_STYLE,
  speakerColor,
  NodeTypeBadge,
  SceneDescHint,
  Section,
  BulkProgressOverlay,
} from './components/widgets'
import {
  SceneAnalysisPanel,
  SceneTensionPanel,
  ChoiceConsequencePanel,
  ChoiceSuggestionsPanel,
} from './components/AIPanels'
import { NodeTreeSidebar } from './components/NodeTreeSidebar'

type NodeDraft = {
  emotionFunction?: EmotionFunction
  sceneDesc?: string
  dialogue?: DialogueLine[]
}

function WorkshopPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { project, updateNode, updateChoice, advancePhase, addNode, addChoice } = useProjectStore()
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('node'))
  const [loading, setLoading] = useState<string | null>(null)
  const [nodeDrafts, setNodeDrafts] = useState<Record<string, NodeDraft>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; phase: 'generate' | 'refine' } | null>(null)
  const bulkCancelRef = useRef(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [choiceSuggestions, setChoiceSuggestions] = useState<Array<{text:string;consequence:string;longterm:string;dramatic_cost?:string;thematic_resonance?:string}> | null>(null)
  const [sceneAnalysis, setSceneAnalysis] = useState<{working:string;issues:Array<{line:string;problem:string;fix:string}>;killer_line:string} | null>(null)
  const [sceneTension, setSceneTension] = useState<{tension_diagnosis:string;missing_element:string;rewrite_suggestion:string;upgraded_line:string;mcguffin:string;dramatic_irony:string} | null>(null)
  const [sceneTensionOpen, setSceneTensionOpen] = useState(true)
  const [choiceConsequence, setChoiceConsequence] = useState<{immediate:string;chapter_impact:string;regret_factor:string;[key:string]:string} | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')

  const hasPendingDraft = Object.keys(nodeDrafts).length > 0

  useEffect(() => {
    if (!hasPendingDraft) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasPendingDraft])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      const nodes = project?.nodes ?? []
      const currentIdx = nodes.findIndex(n => n.id === selectedId)

      if (e.key === 'j' || e.key === 'ArrowDown') {
        const next = nodes[currentIdx + 1]
        if (next) { setSelectedId(next.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const prev = nodes[currentIdx - 1]
        if (prev) { setSelectedId(prev.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }
      } else if (e.key === 'Escape') {
        setSelectedId(null); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, project?.nodes])

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      加载中...
    </div>
  )

  const selected = project.nodes.find(n => n.id === selectedId)
  const currentDraft = selectedId ? nodeDrafts[selectedId] : null

  function linkExploreNode(fromNodeId: string, exploreNodeId: string) {
    if (!exploreNodeId || !project) return
    const exploreNode = project.nodes.find(n => n.id === exploreNodeId)
    const sourceNode = project.nodes.find(n => n.id === fromNodeId)
    if (!exploreNode || !sourceNode) return
    const newChoice = {
      id: nanoid(8), nodeId: fromNodeId,
      text: `查看${exploreNode.title}`,
      order: sourceNode.choices.length,
      targetNodeId: exploreNodeId,
      conditions: '', variableEffects: '',
    }
    updateNode(fromNodeId, { choices: [...sourceNode.choices, newChoice] })
    updateNode(exploreNodeId, { exploreReturnNodeId: fromNodeId })
  }

  async function callAiForNode(action: string, node: StoryNode) {
    setLoading(action)
    setAiError(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'workshop', action, context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables } }),
      })
      const data = await res.json()
      if (!data.ok) { setAiError(data.error ?? 'AI 请求失败'); return }

      const prev = nodeDrafts[node.id] || {}
      if (action === 'fill_emotion' && data.result) {
        setNodeDrafts(d => ({ ...d, [node.id]: { ...prev, emotionFunction: data.result } }))
      } else if (action === 'write_dialogue' && data.result?.dialogue) {
        const dialogue = data.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) }))
        const sceneDesc = data.result.sceneDesc as string | undefined
        setNodeDrafts(d => ({ ...d, [node.id]: { ...prev, dialogue, ...(sceneDesc ? { sceneDesc } : {}) } }))
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function callAiForSuggestChoices(node: StoryNode) {
    setLoading('suggest_choices')
    setAiError(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'workshop', action: 'suggest_choices', context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables } }),
      })
      const data = await res.json()
      if (!data.ok) { setAiError(data.error ?? 'AI 请求失败'); return }
      if (data.result?.choices) {
        setChoiceSuggestions(data.result.choices as Array<{text:string;consequence:string;longterm:string}>)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function callAiSceneAnalysis(node: StoryNode) {
    setLoading('scene_analysis')
    setAiError(null)
    setSceneAnalysis(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'workshop', action: 'scene_analysis', context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables } }),
      })
      const data = await res.json()
      if (!data.ok) { setAiError(data.error ?? 'AI 请求失败'); return }
      if (data.result) {
        setSceneAnalysis(data.result as {working:string;issues:Array<{line:string;problem:string;fix:string}>;killer_line:string})
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function callAiSceneTension(node: StoryNode) {
    setLoading('scene_tension')
    setAiError(null)
    setSceneTension(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'workshop', action: 'scene_tension', context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters } }),
      })
      const data = await res.json()
      if (!data.ok) { setAiError(data.error ?? 'AI 请求失败'); return }
      if (data.result) {
        setSceneTension(data.result)
        setSceneTensionOpen(true)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function callAiChoiceConsequence(node: StoryNode, choiceIndex = 0) {
    setLoading(`choice_consequence_${choiceIndex}`)
    setAiError(null)
    setChoiceConsequence(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'workshop', action: 'choice_consequence', context: { choice: node.choices[choiceIndex] ?? null, currentNode: node, worldAnchor: project!.worldAnchor, characters: project!.characters, nodes: project!.nodes.slice(0, 20) } }),
      })
      const data = await res.json()
      if (!data.ok) { setAiError(data.error ?? 'AI 请求失败'); return }
      if (data.result) {
        setChoiceConsequence(data.result)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function callAiDesignNode(node: StoryNode) {
    setLoading('design_node')
    setAiError(null)
    try {
      const [emotionRes, dialogueRes] = await Promise.all([
        fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'workshop', action: 'fill_emotion', context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables } }),
        }),
        fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'workshop', action: 'write_dialogue', context: { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables } }),
        }),
      ])
      const [eData, dData] = await Promise.all([emotionRes.json(), dialogueRes.json()])
      const draft: NodeDraft = {}
      if (eData.ok && eData.result) draft.emotionFunction = eData.result
      if (dData.ok && dData.result?.dialogue) {
        draft.dialogue = dData.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) }))
        if (dData.result.sceneDesc) draft.sceneDesc = dData.result.sceneDesc as string
      }
      if (draft.emotionFunction || draft.dialogue) {
        setNodeDrafts(d => ({ ...d, [node.id]: draft }))
        toast('AI 设计草稿已生成，请确认', 'info')
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(null)
    }
  }

  async function runBulkAi() {
    bulkCancelRef.current = false
    setBulkLoading(true)
    const nodes = project!.nodes
    const ctx = { worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables }

    // Pass 1: Generate — fill_emotion + write_dialogue for all nodes
    setBulkProgress({ done: 0, total: nodes.length, phase: 'generate' })
    const patches: Record<string, Partial<StoryNode>> = {}
    for (const node of nodes) {
      if (bulkCancelRef.current) break
      try {
        const [eRes, dRes] = await Promise.all([
          fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'workshop', action: 'fill_emotion', context: { node, ...ctx } }) }),
          fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'workshop', action: 'write_dialogue', context: { node, ...ctx } }) }),
        ])
        const [eData, dData] = await Promise.all([eRes.json(), dRes.json()])
        const patch: Partial<StoryNode> = {}
        if (eData.ok && eData.result) patch.emotionFunction = eData.result
        if (dData.ok && dData.result?.dialogue) {
          patch.dialogue = dData.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) }))
          if (dData.result.sceneDesc) patch.sceneDesc = dData.result.sceneDesc as string
        }
        if (Object.keys(patch).length > 0) {
          patches[node.id] = patch
          updateNode(node.id, patch)
        }
      } catch { /* continue */ }
      setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null)
    }

    // Pass 2: Refine — critique thin nodes (<6 lines) and auto-revise
    const thinNodes = nodes.filter(n => {
      const dl = (patches[n.id]?.dialogue ?? n.dialogue ?? []).length
      return n.type !== 'ending' && dl < 6
    })
    if (!bulkCancelRef.current && thinNodes.length > 0) {
      setBulkProgress({ done: 0, total: thinNodes.length, phase: 'refine' })
      for (const node of thinNodes) {
        if (bulkCancelRef.current) break
        try {
          const updatedNode = { ...node, ...(patches[node.id] ?? {}) }
          const critiqueRes = await fetch('/api/ai', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'workshop', action: 'scene_analysis', context: { node: updatedNode, ...ctx } }),
          })
          const critiqueData = await critiqueRes.json()
          if (!critiqueData.ok) { setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null); continue }
          const reviseRes = await fetch('/api/ai', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'workshop', action: 'revise_dialogue', context: { node: updatedNode, critique: critiqueData.result, ...ctx } }),
          })
          const reviseData = await reviseRes.json()
          if (reviseData.ok && reviseData.result?.dialogue) {
            const revised: Partial<StoryNode> = { dialogue: reviseData.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) })) }
            if (reviseData.result.sceneDesc) revised.sceneDesc = reviseData.result.sceneDesc as string
            updateNode(node.id, revised)
          }
        } catch { /* continue */ }
        setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null)
      }
    }

    setBulkLoading(false)
    setBulkProgress(null)
    if (bulkCancelRef.current) {
      toast('批量生成已取消', 'error')
    } else {
      const refined = thinNodes.length > 0 ? `，其中 ${thinNodes.length} 个节点经过精修` : ''
      toast(`批量 AI 设计完成，${nodes.length} 个节点已生成${refined}`, 'success')
    }
  }

  function commitDraft(nodeId: string) {
    const draft = nodeDrafts[nodeId]
    if (!draft) return
    const patch: Partial<StoryNode> = {}
    if (draft.emotionFunction) patch.emotionFunction = draft.emotionFunction
    if (draft.sceneDesc !== undefined) patch.sceneDesc = draft.sceneDesc
    if (draft.dialogue) patch.dialogue = draft.dialogue
    updateNode(nodeId, patch)
    setNodeDrafts(d => { const n = { ...d }; delete n[nodeId]; return n })
  }

  function discardDraft(nodeId: string) {
    setNodeDrafts(d => { const n = { ...d }; delete n[nodeId]; return n })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] relative">
      {bulkLoading && bulkProgress && (
        <BulkProgressOverlay progress={bulkProgress} onCancel={() => { bulkCancelRef.current = true }} />
      )}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <button
          onClick={runBulkAi}
          disabled={bulkLoading}
          className="text-sm text-amber-600 hover:text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
        >
          {bulkLoading && <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
          批量 AI 设计全部节点
        </button>
        <span className="text-xs text-gray-400">生成后仍可逐节点审核修改</span>
        {project.variables.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            {project.variables.slice(0, 4).map(v => (
              <span key={v.id} className="px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-gray-500">
                {v.name}
              </span>
            ))}
            {project.variables.length > 4 && <span>+{project.variables.length - 4}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <NodeTreeSidebar
          project={project}
          nodeSearch={nodeSearch}
          onSearchChange={setNodeSearch}
          selectedId={selectedId}
          onSelectNode={(id) => {
            setSelectedId(id)
            setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null)
          }}
          hasDraft={(id) => !!nodeDrafts[id]}
          onAddNode={(actId) => {
            const n = addNode(actId)
            setSelectedId(n.id)
            setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null)
          }}
        />

        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-2xl mb-2">✏️</p>
                <p className="text-sm">从左侧选择一个节点开始编辑</p>
              </div>
            </div>
          ) : (() => {
            // 计算当前节点所在的章幕位置
            const nodeAct = project.acts.find(a => a.nodeIds.includes(selected.id))
            const nodeChapter = nodeAct ? project.chapters.find(c => c.id === nodeAct.chapterId) : null
            const chapterIdx = nodeChapter ? project.chapters.sort((a,b)=>a.order-b.order).findIndex(c=>c.id===nodeChapter.id) : -1
            const totalChapters = project.chapters.length
            const nodeIdxInAll = project.nodes.findIndex(n => n.id === selected.id)
            const totalNodes = project.nodes.length
            const storyPct = totalNodes > 1 ? Math.round((nodeIdxInAll / (totalNodes - 1)) * 100) : 0

            return (
            <div className="max-w-2xl mx-auto px-8 py-6 space-y-6">
              {/* 叙事位置导航仪 */}
              {nodeChapter && (
                <div className="flex items-center gap-3 py-2 border-b border-zinc-100">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <span className="text-zinc-300">{nodeChapter.title}</span>
                    {nodeAct && <><span>›</span><span>{nodeAct.title}</span></>}
                  </div>
                  <div className="flex-1 h-px bg-zinc-100 relative">
                    <div className="absolute h-2 w-2 -top-0.5 bg-amber-500 rounded-full transition-all" style={{ left: `${storyPct}%`, transform: 'translateX(-50%)' }} />
                  </div>
                  <span className="text-xs text-zinc-300 shrink-0">{storyPct}%</span>
                </div>
              )}

              {aiError && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{aiError}</div>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <NodeTypeBadge type={selected.type} size="md" />
                    <span className="text-xs text-gray-400">{NODE_TYPE_LABEL[selected.type]}</span>
                    <span className="text-xs text-gray-300 ml-auto">
                      {selected.dialogue.length > 0 && `约 ${Math.round(selected.dialogue.length * 18)}s · ${selected.dialogue.length} 行对白`}
                    </span>
                  </div>
                  <input
                    value={selected.title}
                    onChange={e => updateNode(selected.id, { title: e.target.value })}
                    className="text-xl font-semibold text-gray-900 border-none outline-none bg-transparent w-full"
                    placeholder="节点标题"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => callAiSceneAnalysis(selected)}
                    disabled={loading === 'scene_analysis'}
                    className="text-sm text-amber-500 hover:text-amber-600 border border-amber-100 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {loading === 'scene_analysis' && <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
                    场景分析
                  </button>
                  <button
                    onClick={() => callAiSceneTension(selected)}
                    disabled={loading === 'scene_tension'}
                    className="text-sm text-violet-500 hover:text-violet-600 border border-violet-100 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {loading === 'scene_tension' && <span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />}
                    ⚡ 场景张力诊断
                  </button>
                  <button
                    onClick={() => callAiDesignNode(selected)}
                    disabled={loading === 'design_node'}
                    className="text-sm text-amber-600 hover:text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {loading === 'design_node' && <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
                    AI 设计此节点
                  </button>
                </div>
              </div>

              {currentDraft && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-amber-700">AI 已生成设计方案</p>
                    <div className="flex gap-2">
                      <button onClick={() => discardDraft(selected.id)} className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2.5 py-1 hover:bg-gray-50">丢弃</button>
                      <button
                        onClick={() => {
                          const node = project!.nodes.find(n => n.id === selected.id)
                          if (node) callAiDesignNode(node)
                        }}
                        className="text-xs border border-gray-300 text-gray-600 rounded-lg px-2.5 py-1 hover:bg-gray-50"
                      >
                        重新生成
                      </button>
                      <button onClick={() => commitDraft(selected.id)} className="text-xs bg-amber-600 text-white rounded-lg px-2.5 py-1 hover:bg-amber-700">通过</button>
                    </div>
                  </div>
                  {currentDraft.sceneDesc && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-amber-600 mb-1">场景描述预览</p>
                      <p className="text-xs text-amber-800 bg-white rounded-lg p-2 leading-relaxed">{currentDraft.sceneDesc}</p>
                    </div>
                  )}
                  {currentDraft.emotionFunction && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-amber-600 mb-1">情感函数预览</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs text-amber-800 bg-white rounded-lg p-2">
                        <span>进入：{currentDraft.emotionFunction.emotionIn}</span>
                        <span>离开：{currentDraft.emotionFunction.emotionOut}</span>
                        <span>玩家情感：{currentDraft.emotionFunction.playerEmotion}</span>
                        <span>紧张度：{currentDraft.emotionFunction.tension}/10</span>
                      </div>
                    </div>
                  )}
                  {currentDraft.dialogue && (
                    <div>
                      <p className="text-xs font-medium text-amber-600 mb-1">对白预览</p>
                      <div className="space-y-1 bg-white rounded-lg p-2">
                        {currentDraft.dialogue.map((line, i) => (
                          <div key={i} className="text-xs text-amber-800">
                            <span className="font-medium">{line.speaker}</span>
                            <span className="text-amber-500 mx-1">·</span>
                            <span>{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <select
                  value={selected.sceneHeader?.interior ?? 'INT'}
                  onChange={e => updateNode(selected.id, { sceneHeader: { ...selected.sceneHeader ?? { location: '', timeOfDay: 'DAY', interior: 'INT' }, interior: e.target.value as 'INT' | 'EXT' | 'INT/EXT' } })}
                  className="text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white font-mono font-bold text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  <option>INT</option>
                  <option>EXT</option>
                  <option>INT/EXT</option>
                </select>
                <span className="text-zinc-300 text-xs">.</span>
                <input
                  value={selected.sceneHeader?.location ?? ''}
                  onChange={e => updateNode(selected.id, { sceneHeader: { interior: 'INT', timeOfDay: 'DAY', ...selected.sceneHeader, location: e.target.value } })}
                  placeholder="地点（如：废弃仓库）"
                  className="flex-1 text-xs font-mono font-bold text-zinc-700 uppercase border border-zinc-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <span className="text-zinc-300 text-xs">-</span>
                <select
                  value={selected.sceneHeader?.timeOfDay ?? 'DAY'}
                  onChange={e => updateNode(selected.id, { sceneHeader: { interior: 'INT', location: '', ...selected.sceneHeader, timeOfDay: e.target.value as 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'CONTINUOUS' } })}
                  className="text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white font-mono font-bold text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  <option value="DAY">DAY</option>
                  <option value="NIGHT">NIGHT</option>
                  <option value="DAWN">DAWN</option>
                  <option value="DUSK">DUSK</option>
                  <option value="CONTINUOUS">CONTINUOUS</option>
                </select>
              </div>

              <Section title="场景描述">
                <textarea
                  value={selected.sceneDesc ?? ''}
                  onChange={e => updateNode(selected.id, { sceneDesc: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-none text-sm leading-relaxed`}
                  placeholder="镜头语言描述：交代环境、氛围、角色位置关系…"
                />
                <SceneDescHint n={(selected.sceneDesc ?? '').length} />
              </Section>

              <Section title="情感函数" action={{ label: 'AI 填写', loading: loading === 'fill_emotion', onClick: () => callAiForNode('fill_emotion', selected) }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">进入情绪</label>
                    <input value={selected.emotionFunction?.emotionIn ?? ''} onChange={e => updateNode(selected.id, { emotionFunction: { ...selected.emotionFunction, emotionIn: e.target.value } })} className={inputClass} placeholder="例：焦虑" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">离开情绪</label>
                    <input value={selected.emotionFunction?.emotionOut ?? ''} onChange={e => updateNode(selected.id, { emotionFunction: { ...selected.emotionFunction, emotionOut: e.target.value } })} className={inputClass} placeholder="例：震惊" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">玩家情感目标</label>
                    <input value={selected.emotionFunction?.playerEmotion ?? ''} onChange={e => updateNode(selected.id, { emotionFunction: { ...selected.emotionFunction, playerEmotion: e.target.value } })} className={inputClass} placeholder="例：紧张期待" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">紧张度 ({selected.emotionFunction?.tension ?? 0}/10)</label>
                    <input type="range" min={0} max={10} value={selected.emotionFunction?.tension ?? 0} onChange={e => updateNode(selected.id, { emotionFunction: { ...selected.emotionFunction, tension: Number(e.target.value) } })} className="w-full mt-2" />
                  </div>
                </div>
              </Section>

              {project.characters.length > 0 && (() => {
                const speakersInNode = [...new Set(selected.dialogue.map(d => d.speaker).filter(Boolean))]
                const relevantChars = project.characters.filter(c =>
                  speakersInNode.includes(c.name) || project.characters.length <= 3
                )
                if (relevantChars.length === 0) return null
                return (
                  <div className="mb-2 space-y-1.5">
                    {relevantChars.map(ch => (
                      <div key={ch.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold ${speakerColor(ch.name)}`}>{ch.name}</span>
                          <span className="text-[10px] text-gray-400">{ch.role}</span>
                        </div>
                        {ch.wound && <p className="text-[11px] text-gray-500 leading-snug"><span className="text-red-400 font-medium">伤痛：</span>{ch.wound}</p>}
                        {ch.lie && <p className="text-[11px] text-gray-500 leading-snug"><span className="text-orange-400 font-medium">谎言：</span>{ch.lie}</p>}
                        {ch.voiceProfile?.sample_lines && ch.voiceProfile.sample_lines.length > 0 && (
                          <p className="text-[11px] text-gray-400 italic mt-0.5">"{ch.voiceProfile.sample_lines[0]}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}

              <Section title="对白" action={{ label: 'AI 生成', loading: loading === 'write_dialogue', onClick: () => callAiForNode('write_dialogue', selected) }}>
                <div className="space-y-2">
                  {selected.dialogue.map((line, i) => (
                    <div key={line.id} className="group relative py-3 border-b border-gray-50 last:border-0">
                      {/* 角色名行 */}
                      <div className="flex items-center justify-center gap-2 mb-1.5">
                        <input
                          value={line.speaker}
                          onChange={e => { const d = [...selected.dialogue]; d[i] = { ...line, speaker: e.target.value }; updateNode(selected.id, { dialogue: d }) }}
                          className={`text-xs font-bold tracking-widest uppercase bg-transparent border-none outline-none text-center w-32 ${line.speaker ? speakerColor(line.speaker) : 'text-amber-600'}`}
                          placeholder="角色名"
                        />
                        <span className="text-gray-300 text-xs">·</span>
                        <input
                          value={line.emotion}
                          onChange={e => { const d = [...selected.dialogue]; d[i] = { ...line, emotion: e.target.value }; updateNode(selected.id, { dialogue: d }) }}
                          className="text-xs text-gray-400 italic bg-transparent border-none outline-none w-20"
                          placeholder="情绪"
                        />
                        <button
                          onClick={() => { const d = selected.dialogue.filter((_, j) => j !== i); updateNode(selected.id, { dialogue: d }) }}
                          className="absolute right-0 top-3 text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >✕</button>
                      </div>
                      {/* 台词 */}
                      <div className="px-8">
                        <input
                          value={line.text}
                          onChange={e => { const d = [...selected.dialogue]; d[i] = { ...line, text: e.target.value }; updateNode(selected.id, { dialogue: d }) }}
                          className="text-sm text-gray-800 w-full bg-transparent border-none outline-none leading-relaxed"
                          placeholder="台词..."
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => { const d = [...selected.dialogue, { id: nanoid(6), speaker: '', text: '', emotion: '' }]; updateNode(selected.id, { dialogue: d }) }}
                    className="w-full text-xs text-gray-300 hover:text-amber-500 py-3 border border-dashed border-gray-100 hover:border-amber-200 rounded-lg transition-colors mt-2"
                  >
                    + 添加台词
                  </button>
                </div>
              </Section>

              {sceneAnalysis && (
                <SceneAnalysisPanel data={sceneAnalysis} onClose={() => setSceneAnalysis(null)} />
              )}

              {sceneTension && (
                <SceneTensionPanel
                  data={sceneTension}
                  open={sceneTensionOpen}
                  onToggle={() => setSceneTensionOpen(o => !o)}
                  onClose={() => setSceneTension(null)}
                />
              )}

              {selected.type === 'explore' && (
                <Section title="探索节点设置">
                  <div className="space-y-3">
                    <p className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 leading-relaxed">
                      探索节点是<strong>可选旁支内容</strong>——玩家自愿进入，看完后通过"返回主线"按钮回到主故事。
                      它不占用主线选项，也不影响剧情走向，适合放置档案、日记、隐藏线索等内容。
                    </p>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">
                        探索完成后返回的节点
                        <span className="ml-1 text-gray-400">（玩家点击"返回主线"后跳转到这里）</span>
                      </label>
                      {selected.exploreReturnNodeId ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                            <span className="text-xs text-teal-600">◎ 返回至：</span>
                            <span className="text-sm font-medium text-teal-800">
                              {project.nodes.find(n => n.id === selected.exploreReturnNodeId)?.title ?? '（节点已删除）'}
                            </span>
                          </div>
                          <button
                            onClick={() => updateNode(selected.id, { exploreReturnNodeId: undefined })}
                            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 border border-gray-200 rounded-lg"
                          >
                            清除
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            ⚠ 未设置返回节点——玩家进入此探索节点后将无法返回主线
                          </div>
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) updateNode(selected.id, { exploreReturnNodeId: e.target.value }) }}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                          >
                            <option value="" disabled>选择返回目标节点…</option>
                            {project.nodes
                              .filter(n => n.id !== selected.id && n.type !== 'explore' && n.type !== 'ending')
                              .map(n => (
                                <option key={n.id} value={n.id}>{n.title || '（无标题）'}</option>
                              ))
                            }
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {(selected.choices.length > 0 || selected.type === 'branch') && (
                <Section title="节点选择" action={{ label: 'AI 建议选项', loading: loading === 'suggest_choices', onClick: () => callAiForSuggestChoices(selected) }}>
                  <div className="space-y-2">
                    {selected.choices.map((choice, i) => {
                      const targetNode = project.nodes.find(n => n.id === choice.targetNodeId)
                      const isAnalyzing = loading === `choice_consequence_${i}`
                      return (
                        <div key={choice.id}>
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 group">
                            <span className="text-xs text-gray-400 font-medium w-5 shrink-0">{i + 1}</span>
                            <input
                              value={choice.text}
                              onChange={e => {
                                const updated = selected.choices.map((c, j) => j === i ? { ...c, text: e.target.value } : c)
                                updateNode(selected.id, { choices: updated })
                              }}
                              className="text-sm text-gray-800 bg-transparent border-none outline-none flex-1"
                              placeholder="选项文字..."
                            />
                            {choice.choiceWeight && (
                              <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded ${
                                choice.choiceWeight === 'critical' ? 'bg-red-50 text-red-500' :
                                choice.choiceWeight === 'heavy' ? 'bg-orange-50 text-orange-500' :
                                'bg-gray-50 text-gray-400'
                              }`}>
                                {choice.choiceWeight === 'critical' ? '关键' : choice.choiceWeight === 'heavy' ? '重要' : '轻'}
                              </span>
                            )}
                            <button
                              onClick={() => callAiChoiceConsequence(selected, i)}
                              disabled={!!loading}
                              title="推演此选项后果"
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-600 px-1.5 py-0.5 rounded border border-rose-100 hover:border-rose-300 transition-all disabled:opacity-30 shrink-0"
                            >
                              {isAnalyzing ? <span className="w-2 h-2 border border-rose-400 border-t-transparent rounded-full animate-spin inline-block" /> : '🎯'}
                            </button>
                            <span className="text-gray-300 text-xs shrink-0">→</span>
                            <span className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5 shrink-0 max-w-32 truncate">
                              {targetNode?.title ?? '未连接'}
                            </span>
                          </div>
                          {choice.consequence && (
                            <div className="mt-1 px-3">
                              <span className="text-[11px] text-gray-400 italic">↳ {choice.consequence}</span>
                            </div>
                          )}
                          {project.variables.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1 px-3">
                              {project.variables.map(v => {
                                const isActive = choice.variableEffects.includes(v.name)
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => {
                                      const effects = choice.variableEffects
                                      const newEffects = isActive
                                        ? effects.replace(new RegExp(`[+-]?${v.name}[^,]*,?\\s*`), '').trim()
                                        : effects ? `${effects}, +${v.name}` : `+${v.name}`
                                      updateChoice(choice.id, { variableEffects: newEffects.replace(/,\s*$/, '') })
                                    }}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                      isActive
                                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                                  >
                                    {v.type === 'counter' ? (isActive ? `+${v.name}` : v.name) : v.name}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 探索节点入口：显示已连接的探索节点，并允许连接更多 */}
                  {selected.type !== 'explore' && selected.type !== 'ending' && (() => {
                    const linkedExplores = selected.choices
                      .map(c => project.nodes.find(n => n.id === c.targetNodeId && n.type === 'explore'))
                      .filter((n): n is NonNullable<typeof n> => !!n)
                    const unlinkedExplores = project.nodes.filter(n =>
                      n.type === 'explore' && !selected.choices.some(c => c.targetNodeId === n.id)
                    )
                    if (linkedExplores.length === 0 && unlinkedExplores.length === 0) return null
                    return (
                      <div className="mt-3 pt-3 border-t border-dashed border-teal-100">
                        <div className="text-xs text-teal-600 font-medium mb-2">◎ 可选探索入口</div>
                        {linkedExplores.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {linkedExplores.map(n => (
                              <span key={n.id} className="text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-2.5 py-0.5">
                                ◎ {n.title}
                              </span>
                            ))}
                          </div>
                        )}
                        {unlinkedExplores.length > 0 && (
                          <select
                            value=""
                            onChange={e => linkExploreNode(selected.id, e.target.value)}
                            className="w-full text-xs border border-teal-200 rounded-lg px-2.5 py-1.5 bg-teal-50 text-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="" disabled>+ 连接探索节点（可选内容）…</option>
                            {unlinkedExplores.map(n => (
                              <option key={n.id} value={n.id}>{n.title || '（无标题）'}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })()}

                  {choiceConsequence && (
                    <ChoiceConsequencePanel data={choiceConsequence} onClose={() => setChoiceConsequence(null)} />
                  )}

                  {choiceSuggestions && (
                    <ChoiceSuggestionsPanel data={choiceSuggestions} onClose={() => setChoiceSuggestions(null)} />
                  )}
                </Section>
              )}

              <Section title="设计备注">
                <textarea
                  value={selected.notes}
                  onChange={e => updateNode(selected.id, { notes: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="节点的创作意图、技术要求、注意事项..."
                />
              </Section>
            </div>
          )})()}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-4 flex justify-end">
        <button
          onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/validate`) }}
          className="px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          下一步：全局校验 →
        </button>
      </div>

      <div className="fixed bottom-20 right-6 text-xs text-gray-300 space-y-0.5">
        <div>J / ↓ 下一节点</div>
        <div>K / ↑ 上一节点</div>
        <div>Esc 取消选择</div>
      </div>
    </div>
  )
}

export default function WorkshopPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">加载中...</div>}>
      <WorkshopPageInner />
    </Suspense>
  )
}
