'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/app/components/toast'
import { useProjectStore } from '@/lib/store/projectStore'
import type { StoryNode, DialogueLine, EmotionFunction } from '@/lib/types/project'
import { nanoid } from 'nanoid'

type NodeDraft = {
  emotionFunction?: EmotionFunction
  sceneDesc?: string
  dialogue?: DialogueLine[]
}

function nodeCompleteness(node: StoryNode): number {
  let score = 0
  if (node.sceneDesc && node.sceneDesc.length > 20) score++
  if ((node.dialogue ?? []).length >= 3) score++
  if (node.emotionFunction?.tension > 0) score++
  if ((node.choices ?? []).length > 0 || node.type === 'ending') score++
  return score
}

function speakerColor(name: string): string {
  const colors = ['text-amber-600', 'text-blue-600', 'text-purple-600', 'text-green-700', 'text-rose-600', 'text-teal-600']
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return colors[hash % colors.length]
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

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      加载中...
    </div>
  )

  const selected = project.nodes.find(n => n.id === selectedId)
  const currentDraft = selectedId ? nodeDrafts[selectedId] : null

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
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">
              {bulkProgress.phase === 'generate' ? '第一轮：生成内容' : '第二轮：精修对白'}
            </div>
            <div className="text-xs text-gray-400 mb-4">{bulkProgress.done} / {bulkProgress.total} 个节点</div>
            <div className="w-64 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => { bulkCancelRef.current = true }}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded-lg px-4 py-1.5 transition-colors"
          >
            取消
          </button>
        </div>
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
        <div className="w-72 bg-white border-r border-zinc-200 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <input
              value={nodeSearch}
              onChange={e => setNodeSearch(e.target.value)}
              placeholder="搜索节点…"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
            />
            <DurationBar nodes={project.nodes} target={project.worldAnchor?.durationMinutes ?? 90} />
            <CompletionBar nodes={project.nodes} />
          </div>
          <div className="p-2">
            {project.chapters.sort((a, b) => a.order - b.order).map(ch => {
              const chActs = project.acts.filter(a => a.chapterId === ch.id)
              return (
                <div key={ch.id} className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 px-2 py-1.5 border-b border-gray-100 mb-1">{ch.title}</p>
                  {chActs.sort((a, b) => a.order - b.order).map(act => (
                    <div key={act.id} className="mb-1">
                      <p className="text-xs text-gray-400 px-2 py-0.5">{act.title}</p>
                      {project.nodes.filter(n => {
                        if (!act.nodeIds.includes(n.id)) return false
                        if (!nodeSearch) return true
                        if (n.title.includes(nodeSearch)) return true
                        if (n.notes.includes(nodeSearch)) return true
                        if ((n.sceneDesc ?? '').includes(nodeSearch)) return true
                        if (n.dialogue.some(d => d.text.includes(nodeSearch) || d.speaker.includes(nodeSearch))) return true
                        return false
                      }).map(node => {
                        const matchedLine = nodeSearch && !node.title.includes(nodeSearch)
                          ? node.dialogue.find(d => d.text.includes(nodeSearch))
                          : null
                        const matchedSnippet = matchedLine
                          ? matchedLine.text.slice(0, 40) + (matchedLine.text.length > 40 ? '…' : '')
                          : null
                        return (
                        <button
                          key={node.id}
                          onClick={() => { setSelectedId(node.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors mb-0.5 flex items-center gap-1.5 ${selectedId === node.id ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <NodeTypeBadge type={node.type} />
                          <span className="flex-1 text-left leading-snug min-w-0">
                            <span className="break-words line-clamp-2 block">{node.title}</span>
                            {matchedSnippet && (
                              <span className="block text-gray-400 italic mt-0.5">「{matchedSnippet}」</span>
                            )}
                          </span>
                          {nodeDrafts[node.id] && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                          <Completenessbadge score={nodeCompleteness(node)} />
                        </button>
                        )
                      })}
                      <button
                        onClick={() => { const n = addNode(act.id); setSelectedId(n.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                        className="w-full text-left px-2 py-1 rounded text-xs text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors mt-0.5"
                      >
                        + 添加节点
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {project.characters.length > 0 && (
            <div className="border-t border-gray-100 p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">角色速查</p>
              <div className="space-y-2">
                {project.characters.map(ch => (
                  <div key={ch.id} className="text-xs">
                    <span className="font-medium text-gray-700">{ch.name}</span>
                    <span className="text-gray-400 ml-1">·</span>
                    <span className="text-gray-500 ml-1">{ch.motivation || '动机未填'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {project.characters.length > 0 && (() => {
            const arcs = project.characters.map(ch => ({
              ch,
              nodes: project.nodes.filter(n => n.dialogue.some(d => d.speaker === ch.name)),
            })).filter(({ nodes }) => nodes.length > 0)
            if (arcs.length === 0) return null
            return (
              <div className="border-t border-gray-100 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">角色弧线</p>
                <div className="space-y-2.5">
                  {arcs.map(({ ch, nodes }) => (
                    <div key={ch.id}>
                      <p className="text-xs font-medium text-gray-600 mb-1">
                        {ch.name} <span className="text-gray-400 font-normal">· {nodes.length}节点</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {nodes.map(n => (
                          <button
                            key={n.id}
                            onClick={() => { setSelectedId(n.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-100 text-gray-500 hover:border-amber-200 hover:text-amber-600 transition-colors"
                          >
                            {n.title || '无标题'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {project.variables.length > 0 && (() => {
            const varUsage = project.variables.map(v => {
              const readNodes = project.nodes.filter(n => n.systemFunction.variablesRead.includes(v.name))
              const writeNodes = project.nodes.filter(n => n.systemFunction.variablesWrite.includes(v.name))
              const effectNodes = project.nodes.filter(n => n.choices.some(c => c.variableEffects.includes(v.name)))
              const total = new Set([...readNodes.map(n => n.id), ...writeNodes.map(n => n.id), ...effectNodes.map(n => n.id)]).size
              return { v, readNodes, writeNodes, effectNodes, total }
            }).filter(({ total }) => total > 0)
            if (varUsage.length === 0) return null
            return (
              <div className="border-t border-gray-100 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">变量索引</p>
                <div className="space-y-2.5">
                  {varUsage.map(({ v, readNodes, writeNodes, effectNodes }) => (
                    <div key={v.id}>
                      <p className="text-xs font-medium text-gray-600 mb-1">
                        {v.name}
                        <span className="text-gray-400 font-normal ml-1">({v.type})</span>
                      </p>
                      <div className="space-y-1">
                        {readNodes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-blue-500 w-6 shrink-0">读</span>
                            {readNodes.map(n => (
                              <button key={n.id} onClick={() => { setSelectedId(n.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-blue-100 text-blue-600 hover:bg-blue-50 transition-colors">{n.title || '无标题'}</button>
                            ))}
                          </div>
                        )}
                        {writeNodes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-amber-500 w-6 shrink-0">写</span>
                            {writeNodes.map(n => (
                              <button key={n.id} onClick={() => { setSelectedId(n.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-100 text-amber-600 hover:bg-amber-50 transition-colors">{n.title || '无标题'}</button>
                            ))}
                          </div>
                        )}
                        {effectNodes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-rose-500 w-6 shrink-0">效</span>
                            {effectNodes.map(n => (
                              <button key={n.id} onClick={() => { setSelectedId(n.id); setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null) }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-rose-100 text-rose-600 hover:bg-rose-50 transition-colors">{n.title || '无标题'}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

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
                <div className="border border-amber-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                    <span className="text-xs font-semibold text-amber-700">场景分析报告</span>
                    <button onClick={() => setSceneAnalysis(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-green-700 mb-1">有效之处</p>
                      <p className="text-xs text-green-800 leading-relaxed">{sceneAnalysis.working}</p>
                    </div>
                    {sceneAnalysis.issues.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-600">需要修改</p>
                        {sceneAnalysis.issues.map((issue, i) => (
                          <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1.5">
                            <p className="text-xs text-gray-500 italic">"{issue.line}"</p>
                            <p className="text-xs text-red-600">{issue.problem}</p>
                            <p className="text-xs text-gray-700 font-medium">→ {issue.fix}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">杀手台词建议</p>
                      <p className="text-xs text-amber-900 leading-relaxed">{sceneAnalysis.killer_line}</p>
                    </div>
                  </div>
                </div>
              )}

              {sceneTension && (
                <div className="border border-violet-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
                    <span className="text-xs font-semibold text-violet-700">⚡ 场景张力诊断</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSceneTensionOpen(o => !o)} className="text-xs text-gray-400 hover:text-gray-600">{sceneTensionOpen ? '收起' : '展开'}</button>
                      <button onClick={() => setSceneTension(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  </div>
                  {sceneTensionOpen && (
                    <div className="p-4 space-y-2 text-xs">
                      {([
                        { key: 'tension_diagnosis', label: '张力诊断' },
                        { key: 'missing_element', label: '缺失元素' },
                        { key: 'rewrite_suggestion', label: '改写建议' },
                        { key: 'upgraded_line', label: '升级台词' },
                        { key: 'mcguffin', label: '麦格芬' },
                        { key: 'dramatic_irony', label: '戏剧性反讽' },
                      ] as { key: keyof typeof sceneTension; label: string }[]).map(({ key, label }) =>
                        sceneTension[key] ? (
                          <div key={key} className="flex gap-2">
                            <span className="text-violet-500 font-medium shrink-0 w-20">{label}</span>
                            <span className="text-gray-700 leading-relaxed">{sceneTension[key]}</span>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
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
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mt-2">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-rose-700">🎯 选项后果推演</span>
                        <button onClick={() => setChoiceConsequence(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                      <div className="space-y-2 text-xs">
                        {Object.entries(choiceConsequence).map(([key, val]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-rose-500 font-medium shrink-0 w-24">{key}</span>
                            <span className="text-gray-700 leading-relaxed">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {choiceSuggestions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-amber-700">AI 建议选项</span>
                        <button onClick={() => setChoiceSuggestions(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                      <div className="space-y-2">
                        {choiceSuggestions.map((s, i) => (
                          <div key={i} className="bg-white rounded-lg p-3 border border-amber-100 space-y-1">
                            <div className="text-sm font-medium text-gray-800">{s.text}</div>
                            <div className="text-xs text-gray-500">即时：{s.consequence}</div>
                            <div className="text-xs text-gray-400">长期：{s.longterm}</div>
                            {s.dramatic_cost && <div className="text-xs text-red-500 mt-1">代价：{s.dramatic_cost}</div>}
                            {s.thematic_resonance && <div className="text-xs text-amber-600 italic">主题：{s.thematic_resonance}</div>}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600 mt-2 opacity-70">以上为参考建议，请手动在节点选择中添加</p>
                    </div>
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

const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white'

const NODE_TYPE_LABEL: Record<string, string> = {
  start:   '开场节点 · 故事起点',
  ending:  '结局节点 · 故事终点',
  branch:  '分支节点 · 玩家做出选择',
  merge:   '汇聚节点 · 多线收束',
  normal:  '推进节点 · 情节推进',
  explore: '探索节点 · 可选旁支内容',
}

const NODE_TYPE_STYLE: Record<string, {
  icon: string; label: string
  badgeBg: string; badgeText: string; badgeBorder: string
  sidebarText: string; sidebarIcon: string
}> = {
  start:   { icon: '▶', label: '开场', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', badgeBorder: 'border-emerald-200', sidebarText: 'text-emerald-600', sidebarIcon: '▶' },
  ending:  { icon: '★', label: '结局', badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700',   badgeBorder: 'border-amber-200',   sidebarText: 'text-amber-600',   sidebarIcon: '★' },
  branch:  { icon: '◆', label: '分支', badgeBg: 'bg-violet-50',  badgeText: 'text-violet-700',  badgeBorder: 'border-violet-200',  sidebarText: 'text-violet-600',  sidebarIcon: '◆' },
  merge:   { icon: '◀', label: '汇聚', badgeBg: 'bg-rose-50',    badgeText: 'text-rose-700',    badgeBorder: 'border-rose-200',    sidebarText: 'text-rose-600',    sidebarIcon: '◀' },
  normal:  { icon: '·', label: '推进', badgeBg: 'bg-zinc-50',    badgeText: 'text-zinc-600',    badgeBorder: 'border-zinc-200',    sidebarText: 'text-zinc-400',    sidebarIcon: '·' },
  explore: { icon: '◎', label: '探索', badgeBg: 'bg-teal-50',    badgeText: 'text-teal-700',    badgeBorder: 'border-teal-200',    sidebarText: 'text-teal-500',    sidebarIcon: '◎' },
}

function NodeTypeBadge({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const s = NODE_TYPE_STYLE[type] ?? NODE_TYPE_STYLE.normal
  if (size === 'md') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.badgeBg} ${s.badgeText} ${s.badgeBorder}`}>
        <span className="text-[10px]">{s.icon}</span>
        {s.label}
      </span>
    )
  }
  return (
    <span className={`text-[11px] font-bold shrink-0 w-5 text-center ${s.sidebarText}`}>{s.sidebarIcon}</span>
  )
}

function DurationBar({ nodes, target }: { nodes: StoryNode[]; target: number }) {
  const estimated = Math.round(nodes.reduce((s, n) => s + n.dialogue.length * 18, 0) / 60)
  const ratio = target > 0 ? Math.min(estimated / target, 1.5) : 0
  const pct = Math.min(ratio / 1.5 * 100, 100)
  const isOver = estimated > target * 1.2
  const isUnder = estimated < target * 0.5
  const barColor = isOver || isUnder ? 'bg-red-400' : estimated < target * 0.8 ? 'bg-amber-400' : 'bg-green-400'
  const textColor = isOver ? 'text-red-500' : isUnder ? 'text-red-400' : 'text-gray-400'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">预计时长</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {estimated} / {target} 分钟
          {isOver && ' ⚠ 超长'}{isUnder && estimated === 0 && ' · 待填充'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CompletionBar({ nodes }: { nodes: StoryNode[] }) {
  const total = nodes.length
  if (total === 0) return null
  const done = nodes.filter(n => nodeCompleteness(n) === 4).length
  const pct = Math.round((done / total) * 100)
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">已填充 {done}/{total} 节点 ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Completenessbadge({ score }: { score: number }) {
  const colorClass = score === 4
    ? 'bg-green-100 text-green-700'
    : score >= 2
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-600'
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${colorClass}`}>
      {score}/4
    </span>
  )
}

function SceneDescHint({ n }: { n: number }) {
  if (n === 0) return null
  if (n < 60) return <p className="text-gray-400 text-xs mt-1">建议 60+ 字以呈现镜头感</p>
  if (n <= 120) return <p className="text-green-500 text-xs mt-1">✓ {n} 字</p>
  return <p className="text-green-600 text-xs mt-1">✓ {n} 字 · 场景感充足</p>
}

function Section({ title, action, children }: {
  title: string
  action?: { label: string; loading: boolean; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.loading}
            className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
          >
            {action.loading && <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
