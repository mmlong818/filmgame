'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/app/components/toast'
import { useProjectStore } from '@/lib/store/projectStore'
import { pushUndo, undo } from '@/lib/store/history'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { aiJson } from '@/lib/ai/client'
import { formatAiError } from '@/lib/ai/errors'
import type { StoryNode, DialogueLine, EmotionFunction, Character } from '@/lib/types/project'
import { nanoid } from 'nanoid'
import { Button } from '@/app/components/ui/button'
import { ConfirmButton } from '@/app/components/ui/confirm'
import { NodeTypeBadge, Tag } from '@/app/components/ui/tag'
import {
  inputClass,
  NODE_TYPE_HINT,
  speakerColor,
  Section,
  SceneDescHint,
  BulkProgressOverlay,
  BufferedInput,
} from './components/widgets'
import { useBufferedField } from '@/lib/hooks/useBufferedField'
import { NodeTreeSidebar } from './components/NodeTreeSidebar'
import { BulkAiScopeBar, BulkFailureReport } from './components/BulkAiControls'
import { useBulkAi } from './hooks/useBulkAi'
import { NodeAssistRail } from './components/NodeAssistRail'
import type { NodeDraft, SceneAnalysisResult, SceneTensionResult, ChoiceSuggestion, ChoiceConsequenceResult } from './components/types'
import { setPendingDrafts } from '@/lib/ui/pendingDraftGuard'

// 场景描述文本框 + 字数提示需共享同一份本地缓冲值（提示要随打字实时变化，而不是等回写 store 才更新）。
/** 变量名进正则前必须转义：含 . ( ) + 等字符会抛异常使该次点击静默失效；
    配合调用处的 \b 词边界，避免变量名互为前缀时误吃（如 trust 吃掉 trustLevel） */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function SceneDescField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { value: local, onChange, onBlur } = useBufferedField(value, onCommit)
  return (
    <div>
      <textarea
        value={local}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        rows={3}
        className="w-full bg-transparent border-none outline-none resize-none text-[12.5px] leading-relaxed text-ink placeholder:text-pencil/70 focus:bg-paper-dim/40"
        placeholder="镜头语言描述：交代环境、氛围、角色位置关系…"
      />
      <SceneDescHint n={local.length} />
    </div>
  )
}

function WorkshopPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { project, updateNode, updateChoice, updateCharacter, advancePhase, addNode, addChoice, deleteNode, deleteChoice } = useProjectStore()
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('node'))
  const [nodeDrafts, setNodeDrafts] = useState<Record<string, NodeDraft>>({})
  const {
    bulkLoading, bulkProgress, bulkScope, setBulkScope, bulkFailedIds, setBulkFailedIds,
    getScopedNodes, runBulkAi, retryFailedNodes, cancelBulk,
  } = useBulkAi({ project, selectedId, updateNode, toast })

  // 8 个单节点 AI 动作各自独立的状态机：各自 loading / error / 取消 / 重试，互不禁用。
  const aiEmotion = useAiAction()
  const aiDialogue = useAiAction()
  const aiChoices = useAiAction()
  const aiSceneAnalysis = useAiAction()
  const aiSceneTension = useAiAction()
  const aiChoiceConsequence = useAiAction()
  const aiDesignNode = useAiAction()
  const aiReviseDialogue = useAiAction()

  const [voiceOpenCharId, setVoiceOpenCharId] = useState<string | null>(null)
  // 多个角色可并发生成声纹：此前用单一 string 记录，后点的会覆盖前一个的 loading 标记，
  // 前一个按钮误显示空闲（可被重复点击），且任一 resolve 都会把仍在跑的那个置为空闲
  const [voiceLoadingIds, setVoiceLoadingIds] = useState<Set<string>>(new Set())
  const [choiceSuggestions, setChoiceSuggestions] = useState<ChoiceSuggestion[] | null>(null)
  const [sceneAnalysis, setSceneAnalysis] = useState<SceneAnalysisResult | null>(null)
  const [sceneTension, setSceneTension] = useState<SceneTensionResult | null>(null)
  const [sceneTensionOpen, setSceneTensionOpen] = useState(true)
  const [choiceConsequence, setChoiceConsequence] = useState<ChoiceConsequenceResult | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')
  const [kbdHintDismissed, setKbdHintDismissed] = useState(true)

  const hasPendingDraft = Object.keys(nodeDrafts).length > 0

  // 记录当前选中节点，异步 AI 结果 resolve 时校验节点未切换，避免串号
  const selectedIdRef = useRef<string | null>(selectedId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    setKbdHintDismissed(localStorage.getItem('workshop-kbd-hint-dismissed') === '1')
  }, [])

  // 命令面板以 /workshop?node=<id> 跳入时，页面已挂载也要响应（不止首次加载）。
  useEffect(() => {
    const n = searchParams.get('node')
    if (n && n !== selectedIdRef.current) {
      setSelectedId(n)
      resetPanels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // beforeunload 只覆盖关页/刷新；应用内跳转（顶栏返回、阶段切换）走客户端路由会绕过，
  // 因此同时登记到跨组件守卫，由 layout 的导航入口在跳转前询问（见 lib/ui/pendingDraftGuard）
  useEffect(() => {
    const n = Object.keys(nodeDrafts).length
    setPendingDrafts(n, n > 0 ? `${n} 处 AI 草稿尚未采纳` : '')
    return () => setPendingDrafts(0)
  }, [nodeDrafts])

  useEffect(() => {
    if (!hasPendingDraft) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasPendingDraft])

  function cancelAllAi() {
    aiEmotion.cancel(); aiDialogue.cancel(); aiChoices.cancel()
    aiSceneAnalysis.cancel(); aiSceneTension.cancel(); aiChoiceConsequence.cancel()
    aiDesignNode.cancel(); aiReviseDialogue.cancel()
  }

  function resetPanels() {
    setChoiceSuggestions(null); setSceneAnalysis(null); setSceneTension(null); setChoiceConsequence(null)
    setVoiceOpenCharId(null)
    cancelAllAi()
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      const nodes = project?.nodes ?? []
      const currentIdx = nodes.findIndex(n => n.id === selectedId)

      if (e.key === 'j' || e.key === 'ArrowDown') {
        const next = nodes[currentIdx + 1]
        if (next) { setSelectedId(next.id); resetPanels() }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const prev = nodes[currentIdx - 1]
        if (prev) { setSelectedId(prev.id); resetPanels() }
      } else if (e.key === 'Escape') {
        setSelectedId(null); resetPanels()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, project?.nodes])

  // 稳定引用的回调，配合 NodeTreeSidebar 的 memo() 避免每次渲染都因内联函数导致 sidebar 重渲染
  const handleSelectNode = useCallback((id: string) => {
    setSelectedId(id)
    resetPanels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const handleHasDraft = useCallback((id: string) => !!nodeDrafts[id], [nodeDrafts])
  const handleAddNode = useCallback((actId: string) => {
    const n = addNode(actId)
    setSelectedId(n.id)
    resetPanels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNode])

  function dismissKbdHint() {
    localStorage.setItem('workshop-kbd-hint-dismissed', '1')
    setKbdHintDismissed(true)
  }

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-pencil text-sm">
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

  function aiContext(node: StoryNode) {
    return { node, worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables }
  }

  function callAiFillEmotion(node: StoryNode) {
    const nodeId = node.id
    aiEmotion.run('fill_emotion', async signal => {
      const data = await aiJson<{ result?: EmotionFunction }>('workshop', 'fill_emotion', aiContext(node), signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result) setNodeDrafts(d => ({ ...d, [node.id]: { ...(d[node.id] || {}), emotionFunction: data.result } }))
    })
  }

  function callAiWriteDialogue(node: StoryNode) {
    const nodeId = node.id
    aiDialogue.run('write_dialogue', async signal => {
      const data = await aiJson<{ result?: { dialogue?: DialogueLine[]; sceneDesc?: string } }>('workshop', 'write_dialogue', aiContext(node), signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result?.dialogue) {
        const dialogue = data.result.dialogue.map(d => ({ ...d, id: nanoid(6) }))
        const sceneDesc = data.result.sceneDesc
        setNodeDrafts(d => ({ ...d, [node.id]: { ...(d[node.id] || {}), dialogue, ...(sceneDesc ? { sceneDesc } : {}) } }))
      }
    })
  }

  function callAiSuggestChoices(node: StoryNode) {
    const nodeId = node.id
    aiChoices.run('suggest_choices', async signal => {
      const data = await aiJson<{ result?: { choices?: ChoiceSuggestion[] } }>('workshop', 'suggest_choices', aiContext(node), signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result?.choices) setChoiceSuggestions(data.result.choices)
    })
  }

  function callAiSceneAnalysis(node: StoryNode) {
    const nodeId = node.id
    aiSceneAnalysis.run('scene_analysis', async signal => {
      const data = await aiJson<{ result?: SceneAnalysisResult }>('workshop', 'scene_analysis', aiContext(node), signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result) setSceneAnalysis(data.result)
    })
  }

  function callAiSceneTension(node: StoryNode) {
    const nodeId = node.id
    aiSceneTension.run('scene_tension', async signal => {
      const data = await aiJson<{ result?: SceneTensionResult }>('workshop', 'scene_tension', { node, worldAnchor: project!.worldAnchor, characters: project!.characters }, signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result) { setSceneTension(data.result); setSceneTensionOpen(true) }
    })
  }

  function callAiChoiceConsequence(node: StoryNode, choiceIndex = 0) {
    const nodeId = node.id
    aiChoiceConsequence.run(`choice_consequence:${choiceIndex}`, async signal => {
      const data = await aiJson<{ result?: ChoiceConsequenceResult }>('workshop', 'choice_consequence', {
        choice: node.choices[choiceIndex] ?? null, currentNode: node,
        worldAnchor: project!.worldAnchor, characters: project!.characters, nodes: project!.nodes.slice(0, 20),
      }, signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result) setChoiceConsequence(data.result)
    })
  }

  function callAiDesignNode(node: StoryNode) {
    const nodeId = node.id
    aiDesignNode.run('design_node', async signal => {
      const [eData, dData] = await Promise.all([
        aiJson<{ result?: EmotionFunction }>('workshop', 'fill_emotion', aiContext(node), signal),
        aiJson<{ result?: { dialogue?: DialogueLine[]; sceneDesc?: string } }>('workshop', 'write_dialogue', aiContext(node), signal),
      ])
      if (selectedIdRef.current !== nodeId) return
      const draft: NodeDraft = {}
      if (eData.result) draft.emotionFunction = eData.result
      if (dData.result?.dialogue) {
        draft.dialogue = dData.result.dialogue.map(d => ({ ...d, id: nanoid(6) }))
        if (dData.result.sceneDesc) draft.sceneDesc = dData.result.sceneDesc
      }
      if (draft.emotionFunction || draft.dialogue) {
        setNodeDrafts(d => ({ ...d, [node.id]: draft }))
        toast('AI 设计草稿已生成，请确认', 'info')
      }
    })
  }

  // 单节点"AI 修改对白"：一句话指令走 revise_dialogue，结果复用 write_dialogue 的
  // draft 预览/采纳流程（nodeDrafts），selectedIdRef 防串号写法与其余 callAi* 一致。
  function callAiReviseDialogue(node: StoryNode, instruction: string) {
    const nodeId = node.id
    aiReviseDialogue.run('revise_dialogue', async signal => {
      const data = await aiJson<{ result?: { dialogue?: DialogueLine[]; sceneDesc?: string } }>('workshop', 'revise_dialogue', {
        node, critique: { issues: [], killer_line: '' }, instruction,
        worldAnchor: project!.worldAnchor, characters: project!.characters, variables: project!.variables,
      }, signal)
      if (selectedIdRef.current !== nodeId) return
      if (data.result?.dialogue) {
        const dialogue = data.result.dialogue.map(d => ({ ...d, id: nanoid(6) }))
        const sceneDesc = data.result.sceneDesc
        setNodeDrafts(d => ({ ...d, [node.id]: { ...(d[node.id] || {}), dialogue, ...(sceneDesc ? { sceneDesc } : {}) } }))
        toast('AI 修改后的对白草稿已生成，请确认', 'info')
      }
    })
  }

  // 角色声纹（与 world 页角色卡相同的 character_voice 动作）。写回走 updateCharacter
  // -> saveProjectMeta 保存路径，与 world 页一致。生成成功后自动弹出声纹卡。
  // 不属于本页统一的 8 个单节点动作（按角色而非按节点触发），沿用独立的 loading/toast 处理。
  async function callAiCharacterVoice(character: Character) {
    setVoiceLoadingIds(prev => new Set(prev).add(character.id))
    try {
      const data = await aiJson<{ result?: Character['voiceProfile'] }>('workshop', 'character_voice', { character, worldAnchor: project!.worldAnchor })
      if (data.result) {
        updateCharacter(character.id, { voiceProfile: data.result })
        setVoiceOpenCharId(character.id)
      }
    } catch (err) {
      toast(formatAiError(err), 'error')
    } finally {
      setVoiceLoadingIds(prev => { const n = new Set(prev); n.delete(character.id); return n })
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

  const aiErrorEntries = [
    { key: 'fill_emotion', hook: aiEmotion },
    { key: 'write_dialogue', hook: aiDialogue },
    { key: 'suggest_choices', hook: aiChoices },
    { key: 'scene_analysis', hook: aiSceneAnalysis },
    { key: 'scene_tension', hook: aiSceneTension },
    { key: 'choice_consequence', hook: aiChoiceConsequence },
    { key: 'design_node', hook: aiDesignNode },
    { key: 'revise_dialogue', hook: aiReviseDialogue },
  ].filter(e => e.hook.error)

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] relative corkboard">
      {bulkLoading && bulkProgress && (
        <BulkProgressOverlay progress={bulkProgress} onCancel={cancelBulk} />
      )}
      <div className="flex-shrink-0 px-6 py-3 border-b border-line bg-paper flex items-center gap-3">
        <BulkAiScopeBar
          scope={bulkScope}
          onScopeChange={setBulkScope}
          scopeDisabled={!selectedId}
          scopeFallback={bulkScope !== 'all' && !selectedId}
          nodeCount={getScopedNodes(bulkScope).length}
          bulkLoading={bulkLoading}
          onStart={runBulkAi}
          onCancel={cancelBulk}
        />
        {project.variables.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            {project.variables.slice(0, 4).map(v => (
              <Tag key={v.id} tone="pencil">{v.name}</Tag>
            ))}
            {project.variables.length > 4 && <span className="text-xs text-pencil">+{project.variables.length - 4}</span>}
          </div>
        )}
      </div>

      <BulkFailureReport
        nodes={bulkFailedIds.map(id => ({ id, title: project.nodes.find(n => n.id === id)?.title ?? '' }))}
        retrying={bulkLoading}
        onRetry={retryFailedNodes}
        onDismiss={() => setBulkFailedIds([])}
      />

      <div className="flex flex-1 overflow-hidden">
        <NodeTreeSidebar
          project={project}
          nodeSearch={nodeSearch}
          onSearchChange={setNodeSearch}
          selectedId={selectedId}
          onSelectNode={handleSelectNode}
          hasDraft={handleHasDraft}
          onAddNode={handleAddNode}
        />

        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-pencil">
              <div className="text-center">
                <p className="text-2xl mb-2">✏️</p>
                <p className="text-sm">从左侧选择一个节点开始编辑</p>
              </div>
            </div>
          ) : (() => {
            // 计算当前节点所在的章幕位置
            const nodeAct = project.acts.find(a => a.nodeIds.includes(selected.id))
            const nodeChapter = nodeAct ? project.chapters.find(c => c.id === nodeAct.chapterId) : null
            const nodeIdxInAll = project.nodes.findIndex(n => n.id === selected.id)
            const totalNodes = project.nodes.length
            const storyPct = totalNodes > 1 ? Math.round((nodeIdxInAll / (totalNodes - 1)) * 100) : 0

            return (
            <div className="max-w-2xl mx-auto px-8 py-6 space-y-4">
              {/* 叙事位置导航仪 */}
              {nodeChapter && (
                <div className="flex items-center gap-3 py-2 border-b border-line-soft">
                  <div className="flex items-center gap-1.5 text-xs text-pencil">
                    <span>{nodeChapter.title}</span>
                    {nodeAct && <><span>›</span><span>{nodeAct.title}</span></>}
                  </div>
                  <div className="flex-1 h-px bg-line-soft relative">
                    <div className="absolute h-2 w-2 -top-0.5 bg-vermilion rounded-full transition-all" style={{ left: `${storyPct}%`, transform: 'translateX(-50%)' }} />
                  </div>
                  <span className="text-xs text-pencil shrink-0">{storyPct}%</span>
                </div>
              )}

              <div className="flex justify-end">
                <ConfirmButton
                  size="sm"
                  variant="danger"
                  confirmLabel="确认删除节点"
                  onConfirm={() => {
                    const title = selected.title
                    const deletedId = selected.id
                    deleteNode(deletedId)
                    // 连带丢弃该节点的未确认草稿：留下就是孤儿，hasPendingDraft 永久为真，
                    // 此后每次离开/刷新都弹「未保存草稿」确认框，只能整页刷新才清得掉
                    discardDraft(deletedId)
                    setSelectedId(null)
                    resetPanels()
                    toast(`已删除节点「${title || '无标题'}」`, 'info', { action: { label: '撤销', onClick: () => undo() } })
                  }}
                >
                  删除节点
                </ConfirmButton>
              </div>

              <div className="paper-sheet paper-sheet-ruled courier px-8 py-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tracking-[0.2em] text-pencil">场景 {String(nodeIdxInAll + 1).padStart(2, '0')}</span>
                  <NodeTypeBadge type={selected.type} />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selected.sceneHeader?.interior ?? 'INT'}
                    onChange={e => updateNode(selected.id, { sceneHeader: { ...selected.sceneHeader ?? { location: '', timeOfDay: 'DAY', interior: 'INT' }, interior: e.target.value as 'INT' | 'EXT' | 'INT/EXT' } })}
                    className="courier text-xs uppercase font-bold text-ink border border-line bg-paper px-2 py-1.5 focus:border-inkblue focus:outline-none"
                  >
                    <option>INT</option>
                    <option>EXT</option>
                    <option>INT/EXT</option>
                  </select>
                  <span className="text-pencil text-xs">.</span>
                  <input
                    value={selected.sceneHeader?.location ?? ''}
                    onChange={e => updateNode(selected.id, { sceneHeader: { interior: 'INT', timeOfDay: 'DAY', ...selected.sceneHeader, location: e.target.value } })}
                    placeholder="地点（如：废弃仓库）"
                    className="courier flex-1 text-xs font-bold text-ink uppercase border border-line bg-paper px-2 py-1.5 focus:border-inkblue focus:outline-none"
                  />
                  <span className="text-pencil text-xs">-</span>
                  <select
                    value={selected.sceneHeader?.timeOfDay ?? 'DAY'}
                    onChange={e => updateNode(selected.id, { sceneHeader: { interior: 'INT', location: '', ...selected.sceneHeader, timeOfDay: e.target.value as 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'CONTINUOUS' } })}
                    className="courier text-xs uppercase font-bold text-ink border border-line bg-paper px-2 py-1.5 focus:border-inkblue focus:outline-none"
                  >
                    <option value="DAY">DAY</option>
                    <option value="NIGHT">NIGHT</option>
                    <option value="DAWN">DAWN</option>
                    <option value="DUSK">DUSK</option>
                    <option value="CONTINUOUS">CONTINUOUS</option>
                  </select>
                </div>

                <div className="flex items-baseline gap-2">
                  <BufferedInput
                    key={selected.id}
                    value={selected.title}
                    onCommit={v => updateNode(selected.id, { title: v })}
                    className="font-sans text-xl font-bold text-ink border-none outline-none bg-transparent flex-1 min-w-0"
                    placeholder="节点标题"
                  />
                  <span className="font-sans text-xs font-normal text-pencil shrink-0">（{NODE_TYPE_HINT[selected.type]}）</span>
                </div>

                <SceneDescField
                  key={`desc-${selected.id}`}
                  value={selected.sceneDesc ?? ''}
                  onCommit={v => updateNode(selected.id, { sceneDesc: v })}
                />

                <Section title="对白">
                  <div className="space-y-1">
                    {selected.dialogue.map((line, i) => (
                      <div key={line.id} className="group relative py-3">
                        <div className="flex items-center justify-center gap-2">
                          <BufferedInput
                            value={line.speaker}
                            onCommit={v => { const d = [...selected.dialogue]; d[i] = { ...line, speaker: v }; updateNode(selected.id, { dialogue: d }) }}
                            className={`text-[13px] font-bold tracking-[0.2em] uppercase bg-transparent border-none outline-none text-center w-32 ${line.speaker ? speakerColor(line.speaker) : 'text-pencil'}`}
                            placeholder="角色名"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-0.5 text-[11px] text-pencil italic">
                          <span>（</span>
                          <BufferedInput
                            value={line.emotion}
                            onCommit={v => { const d = [...selected.dialogue]; d[i] = { ...line, emotion: v }; updateNode(selected.id, { dialogue: d }) }}
                            className="bg-transparent border-none outline-none text-center w-20"
                            placeholder="情绪"
                          />
                          <span>）</span>
                        </div>
                        <div className="px-6 mt-1">
                          <BufferedInput
                            value={line.text}
                            onCommit={v => { const d = [...selected.dialogue]; d[i] = { ...line, text: v }; updateNode(selected.id, { dialogue: d }) }}
                            className="text-[13px] text-ink w-full bg-transparent border-none outline-none text-center leading-relaxed"
                            placeholder="台词..."
                          />
                        </div>
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          confirmLabel="确认删除"
                          className="absolute right-0 top-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5"
                          onConfirm={() => {
                            pushUndo('删除台词', project)
                            const d = selected.dialogue.filter((_, j) => j !== i)
                            updateNode(selected.id, { dialogue: d })
                            toast('已删除台词', 'info', { action: { label: '撤销', onClick: () => undo() } })
                          }}
                        >
                          ✕
                        </ConfirmButton>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => { const d = [...selected.dialogue, { id: nanoid(6), speaker: '', text: '', emotion: '' }]; updateNode(selected.id, { dialogue: d }) }}
                      className="cursor-pointer w-full text-xs text-pencil hover:text-vermilion py-2.5 border border-dashed border-line hover:border-vermilion/40 transition-colors mt-1"
                    >
                      + 添加台词
                    </button>
                  </div>
                </Section>

                {(selected.choices.length > 0 || selected.type === 'branch') && (
                  <Section title="节点选择">
                    <div className="flex flex-wrap gap-3">
                      {selected.choices.map((choice, i) => {
                        const targetNode = project.nodes.find(n => n.id === choice.targetNodeId)
                        const critical = choice.choiceWeight === 'critical'
                        const letter = String.fromCharCode(65 + i)
                        return (
                          <div
                            key={choice.id}
                            className={`group relative flex-1 min-w-[200px] bg-paper border-t-[3px] px-3 pt-4 pb-3 ${critical ? 'border-t-vermilion' : 'border-t-pencil'}`}
                            style={{ boxShadow: 'var(--shadow-card)' }}
                          >
                            <span
                              aria-hidden
                              className={`courier absolute -top-3 left-2.5 w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold text-paper ${critical ? 'bg-vermilion' : 'bg-pencil'}`}
                            >
                              {letter}
                            </span>
                            <BufferedInput
                              value={choice.text}
                              onCommit={v => {
                                const updated = selected.choices.map((c, j) => j === i ? { ...c, text: v } : c)
                                updateNode(selected.id, { choices: updated })
                              }}
                              className="text-sm font-semibold text-ink bg-transparent border-none outline-none w-full"
                              placeholder="选项文字..."
                            />
                            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-pencil flex-wrap">
                              {choice.choiceWeight && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                                  critical ? 'bg-vermilion/10 text-vermilion' :
                                  choice.choiceWeight === 'heavy' ? 'bg-amberink/10 text-amberink' :
                                  'bg-pencil/10 text-pencil'
                                }`}>
                                  {critical ? '关键' : choice.choiceWeight === 'heavy' ? '重要' : '轻'}
                                </span>
                              )}
                              <span>→</span>
                              <span className="text-inkblue truncate max-w-[9rem]">{targetNode?.title ?? '未连接'}</span>
                              {critical && <span className="text-vermilion">⚠ 不可逆</span>}
                              <ConfirmButton
                                size="sm"
                                variant="ghost"
                                confirmLabel="确认删除"
                                className="ml-auto text-[10px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onConfirm={() => {
                                  deleteChoice(choice.id)
                                  toast('已删除选项', 'info', { action: { label: '撤销', onClick: () => undo() } })
                                }}
                              >
                                ✕
                              </ConfirmButton>
                            </div>
                            {choice.consequence && (
                              <p className="text-[11px] text-pencil italic mt-1">↳ {choice.consequence}</p>
                            )}
                            {project.variables.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {project.variables.map(v => {
                                  const isActive = choice.variableEffects.includes(v.name)
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        const effects = choice.variableEffects
                                        const newEffects = isActive
                                          ? effects.replace(new RegExp(`[+-]?${escapeRegExp(v.name)}\\b[^,]*,?\\s*`), '').trim()
                                          : effects ? `${effects}, +${v.name}` : `+${v.name}`
                                        updateChoice(choice.id, { variableEffects: newEffects.replace(/,\s*$/, '') })
                                      }}
                                      className={`cursor-pointer text-[10px] px-2 py-0.5 border transition-colors ${
                                        isActive
                                          ? 'bg-vermilion/10 border-vermilion/40 text-vermilion'
                                          : 'border-line text-pencil hover:border-vermilion/30'
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
                        <div className="mt-3 pt-3 border-t border-dashed border-inkblue/20">
                          <div className="text-xs text-inkblue font-medium mb-2">◎ 可选探索入口</div>
                          {linkedExplores.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {linkedExplores.map(n => (
                                <span key={n.id} className="text-xs bg-inkblue/10 border border-inkblue/30 text-inkblue px-2.5 py-0.5">
                                  ◎ {n.title}
                                </span>
                              ))}
                            </div>
                          )}
                          {unlinkedExplores.length > 0 && (
                            <select
                              value=""
                              onChange={e => linkExploreNode(selected.id, e.target.value)}
                              className={`${inputClass} text-xs focus:border-inkblue`}
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
                  </Section>
                )}
              </div>
            </div>
          )})()}
        </div>

        {selected && (
          <NodeAssistRail
            key={selected.id}
            project={project}
            selected={selected}
            updateNode={updateNode}
            aiEmotion={aiEmotion}
            aiDialogue={aiDialogue}
            aiChoices={aiChoices}
            aiSceneAnalysis={aiSceneAnalysis}
            aiSceneTension={aiSceneTension}
            aiChoiceConsequence={aiChoiceConsequence}
            aiDesignNode={aiDesignNode}
            aiReviseDialogue={aiReviseDialogue}
            onFillEmotion={() => callAiFillEmotion(selected)}
            onWriteDialogue={() => callAiWriteDialogue(selected)}
            onSuggestChoices={() => callAiSuggestChoices(selected)}
            onSceneAnalysis={() => callAiSceneAnalysis(selected)}
            onSceneTension={() => callAiSceneTension(selected)}
            onDesignNode={() => callAiDesignNode(selected)}
            onReviseDialogue={instruction => callAiReviseDialogue(selected, instruction)}
            onChoiceConsequence={idx => callAiChoiceConsequence(selected, idx)}
            aiErrorEntries={aiErrorEntries}
            currentDraft={currentDraft}
            onCommitDraft={() => commitDraft(selected.id)}
            onDiscardDraft={() => discardDraft(selected.id)}
            onRegenerateDraft={() => callAiDesignNode(selected)}
            sceneAnalysis={sceneAnalysis}
            onCloseSceneAnalysis={() => setSceneAnalysis(null)}
            sceneTension={sceneTension}
            sceneTensionOpen={sceneTensionOpen}
            onToggleSceneTension={() => setSceneTensionOpen(o => !o)}
            onCloseSceneTension={() => setSceneTension(null)}
            choiceConsequence={choiceConsequence}
            onCloseChoiceConsequence={() => setChoiceConsequence(null)}
            choiceSuggestions={choiceSuggestions}
            onCloseChoiceSuggestions={() => setChoiceSuggestions(null)}
            voiceOpenCharId={voiceOpenCharId}
            voiceLoadingIds={voiceLoadingIds}
            onToggleVoice={charId => setVoiceOpenCharId(id => id === charId ? null : charId)}
            onGenerateVoice={callAiCharacterVoice}
            onCloseVoice={() => setVoiceOpenCharId(null)}
          />
        )}
      </div>

      <div className="flex-shrink-0 border-t border-line bg-paper px-6 py-4 flex justify-end">
        <Button variant="primary" size="md" onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/validate`) }}>
          下一步：全局校验 →
        </Button>
      </div>

      {!kbdHintDismissed && (
        <div className="fixed bottom-4 left-6 bg-paper border border-line text-[11px] text-pencil px-3 py-2 space-y-0.5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={dismissKbdHint}
            className="cursor-pointer absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-paper border border-line text-pencil hover:text-vermilion text-[10px] leading-none flex items-center justify-center"
          >
            ×
          </button>
          <div>J / ↓ 下一节点</div>
          <div>K / ↑ 上一节点</div>
          <div>Esc 取消选择</div>
        </div>
      )}
    </div>
  )
}

export default function WorkshopPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-pencil text-sm">加载中...</div>}>
      <WorkshopPageInner />
    </Suspense>
  )
}
