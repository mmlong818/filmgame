'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { evalConditions } from '@/lib/conditions'
import type { StoryNode } from '@/lib/types/project'

const CHOICE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const ENDING_THEMES = {
  good: {
    bg: 'bg-gradient-to-b from-gray-950 via-amber-950/30 to-amber-900/20',
    border: 'border-amber-500/30',
    titleColor: 'text-amber-100',
    icon: '🌅',
    label: '完美结局',
    labelColor: 'text-amber-400',
    glow: 'shadow-[0_0_80px_rgba(217,119,6,0.15)]',
    pulse: true,
  },
  bad: {
    bg: 'bg-gradient-to-b from-gray-950 to-zinc-950',
    border: 'border-zinc-800',
    titleColor: 'text-zinc-400',
    icon: '🌑',
    label: '悲剧结局',
    labelColor: 'text-zinc-500',
    glow: '',
    pulse: false,
  },
  neutral: {
    bg: 'bg-gradient-to-b from-gray-950 via-slate-900/50 to-slate-950',
    border: 'border-slate-700/50',
    titleColor: 'text-slate-200',
    icon: '🎭',
    label: '中性结局',
    labelColor: 'text-slate-400',
    glow: 'shadow-[0_0_40px_rgba(100,116,139,0.1)]',
    pulse: false,
  },
  secret: {
    bg: 'bg-gradient-to-b from-gray-950 via-purple-950/20 to-indigo-950/30',
    border: 'border-purple-500/40',
    titleColor: 'text-purple-100',
    icon: '🔮',
    label: '隐藏结局',
    labelColor: 'text-purple-400',
    glow: 'shadow-[0_0_100px_rgba(147,51,234,0.2)]',
    pulse: true,
  },
} as const

function findStartNode(nodes: StoryNode[]): StoryNode | undefined {
  return nodes.find(n => n.type === 'start') ?? nodes[0]
}

function applyVariableEffect(state: Record<string, string | number>, effect: string): Record<string, string | number> {
  if (!effect.trim()) return state
  const next = { ...state }
  for (const part of effect.split(',')) {
    const p = part.trim()
    if (!p) continue
    // "+name" or "-name"
    if (p.startsWith('+')) {
      const name = p.slice(1)
      next[name] = typeof next[name] === 'number' ? (next[name] as number) + 1 : 1
    } else if (p.startsWith('-') && !p.includes('=')) {
      const name = p.slice(1)
      next[name] = typeof next[name] === 'number' ? (next[name] as number) - 1 : -1
    } else if (/^[a-zA-Z_]+=-?\d+$/.test(p)) {
      const [name, val] = p.split('=')
      next[name] = Number(val)
    } else if (p.includes('=')) {
      const eqIdx = p.indexOf('=')
      const name = p.slice(0, eqIdx)
      const val = p.slice(eqIdx + 1)
      next[name] = isNaN(Number(val)) ? val : Number(val)
    }
  }
  return next
}

export default function PreviewPage() {
  const params = useParams()
  const projectId = params.id as string
  const project = useProjectStore(s => s.project)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [varState, setVarState] = useState<Record<string, string | number>>({})

  const nodes = project?.nodes ?? []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const startNode = findStartNode(nodes)
  const activeId = currentNodeId ?? startNode?.id
  const currentNode = activeId ? nodeMap.get(activeId) : undefined

  const navigateTo = useCallback((nodeId: string, choiceEffect?: string, fromExplore?: boolean) => {
    setHistory(prev => {
      const current = currentNodeId ?? startNode?.id
      if (!current) return prev
      // 从探索节点返回时，不再压栈（已在进入时记录）
      if (fromExplore) return prev
      return [...prev, current]
    })
    if (choiceEffect) setVarState(s => applyVariableEffect(s, choiceEffect))
    setCurrentNodeId(nodeId)
  }, [currentNodeId, startNode?.id])

  // 进入探索节点：记录返回点
  const enterExplore = useCallback((exploreNodeId: string, choiceEffect?: string) => {
    setHistory(prev => {
      const current = currentNodeId ?? startNode?.id
      if (!current) return prev
      return [...prev, current]
    })
    if (choiceEffect) setVarState(s => applyVariableEffect(s, choiceEffect))
    setCurrentNodeId(exploreNodeId)
  }, [currentNodeId, startNode?.id])

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setCurrentNodeId(last)
      return prev.slice(0, -1)
    })
  }, [])

  const jumpTo = useCallback((nodeId: string) => {
    const idx = history.indexOf(nodeId)
    if (idx === -1) return
    setCurrentNodeId(nodeId)
    setHistory(prev => prev.slice(0, idx))
  }, [history])

  const reset = useCallback(() => {
    setCurrentNodeId(null)
    setHistory([])
    const init: Record<string, string | number> = {}
    project?.variables?.forEach(v => { init[v.name] = v.defaultValue ?? 0 })
    setVarState(init)
  }, [project?.variables])

  useEffect(() => {
    if (!project) return
    setVarState(s => {
      if (Object.keys(s).length > 0) return s
      const init: Record<string, string | number> = {}
      project.variables?.forEach(v => { init[v.name] = v.defaultValue ?? 0 })
      return init
    })
  }, [project?.id])

  if (!project) return null

  if (nodes.length === 0) {
    return (
      <div className="min-h-full bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 text-5xl mb-6">🎬</div>
          <h2 className="text-gray-300 text-lg font-medium mb-2">暂无内容可预览</h2>
          <p className="text-gray-500 text-sm mb-6">请先在编辑器中创建节点和对白</p>
          <Link
            href={`/project/${projectId}/structure`}
            className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
          >
            前往结构编辑 →
          </Link>
        </div>
      </div>
    )
  }

  if (!currentNode) return null

  const visitedCount = new Set([...(history), activeId]).size
  const isEnding = currentNode.type === 'ending'
  const isExploreNode = currentNode.type === 'explore'
  const ending = isEnding ? project.endings.find(e => e.nodeId === currentNode.id) : null
  const allChoices = currentNode.choices.filter(c =>
    c.targetNodeId && nodeMap.has(c.targetNodeId) && evalConditions(c.conditions, varState)
  )
  const exploreChoices = allChoices.filter(c => nodeMap.get(c.targetNodeId)?.type === 'explore')
  const mainChoices = allChoices.filter(c => nodeMap.get(c.targetNodeId)?.type !== 'explore')
  const isDeadEnd = !isEnding && !isExploreNode && mainChoices.length === 0 && exploreChoices.length === 0
  const emotionFunction = currentNode.emotionFunction ?? {}

  return (
    <div className="min-h-full bg-gray-950 flex flex-col">
      <div className="bg-gray-900/80 border-b border-gray-800 px-6 py-2.5 flex items-center gap-4">
        <Link
          href={`/project/${projectId}/${project.currentPhase === 'workshop' || project.currentPhase === 'validate' ? 'workshop' : 'structure'}`}
          className="text-gray-400 hover:text-gray-200 text-xs transition-colors"
        >
          ← 返回编辑
        </Link>
        <span className="text-gray-700">|</span>
        <span className="text-gray-200 text-xs font-medium flex-1 truncate">
          {currentNode.title}
        </span>
        <span className="text-gray-500 text-xs">
          {visitedCount} / {nodes.length} 节点
        </span>
        <button
          onClick={reset}
          className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          重置
        </button>
      </div>

      {history.length > 0 && (
        <div className="bg-gray-900/50 border-b border-gray-800/50 px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {history.map((hId, i) => {
            const hNode = nodeMap.get(hId)
            if (!hNode) return null
            return (
              <span key={`${hId}-${i}`} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => jumpTo(hId)}
                  className="text-gray-500 hover:text-purple-400 text-xs transition-colors"
                >
                  {hNode.title}
                </button>
                <span className="text-gray-700 text-xs">→</span>
              </span>
            )
          })}
          <span className="text-purple-400 text-xs font-medium shrink-0">{currentNode.title}</span>
        </div>
      )}

      {isEnding ? (() => {
        const theme = ENDING_THEMES[ending?.type ?? 'neutral'] ?? ENDING_THEMES.neutral
        return (
          <div className={`flex-1 flex flex-col items-center justify-center px-6 py-12 relative transition-all duration-1000 ${theme.bg}`}>
            <div className={`max-w-lg w-full text-center border ${theme.border} rounded-2xl p-10 ${theme.glow} bg-black/20 backdrop-blur-sm`}>
              <div className={`text-6xl mb-6 ${theme.pulse ? 'animate-pulse' : ''}`}>
                {theme.icon}
              </div>
              <div className={`text-xs uppercase tracking-[0.3em] mb-4 font-medium ${theme.labelColor}`}>
                {theme.label}
              </div>
              <h2 className={`text-2xl font-light mb-6 leading-relaxed ${theme.titleColor}`}>
                {ending?.title ?? currentNode.title}
              </h2>
              {ending?.description && (
                <p className={`text-sm leading-loose mb-6 opacity-70 ${theme.titleColor}`}>
                  {ending.description}
                </p>
              )}
              {currentNode.sceneDesc && (
                <p className="text-gray-500 italic text-xs leading-relaxed mb-8">
                  {currentNode.sceneDesc}
                </p>
              )}
              {currentNode.dialogue.length > 0 && (
                <div className="border-t border-white/5 pt-6 mb-6 space-y-3">
                  {currentNode.dialogue.map(line => (
                    <div key={line.id} className="text-center">
                      <div className={`text-xs font-medium uppercase tracking-wider mb-0.5 opacity-60 ${theme.labelColor}`}>{line.speaker}</div>
                      <div className={`text-sm leading-relaxed opacity-80 ${theme.titleColor}`}>{line.text}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={reset}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm rounded-lg transition-all border border-white/10"
                >
                  重新开始
                </button>
                {history.length > 0 && (
                  <button
                    onClick={goBack}
                    className="px-6 py-2.5 bg-transparent hover:bg-white/5 text-white/40 hover:text-white/60 text-sm rounded-lg transition-all border border-white/5"
                  >
                    返回上一步
                  </button>
                )}
              </div>
            </div>
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="text-xs text-gray-700">
                {history.length + 1} 步到达此结局 · {nodes.length} 个节点探索了 {visitedCount} 个
              </span>
            </div>
          </div>
        )
      })() : (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {(
          <div className="max-w-2xl w-full">

            {currentNode.sceneDesc && (
              <p className="text-gray-500 italic text-sm text-center mb-10 leading-relaxed">
                {currentNode.sceneDesc}
              </p>
            )}

            {currentNode.dialogue.length > 0 && (
              <div className="space-y-6 mb-12">
                {currentNode.dialogue.map(line => (
                  <div key={line.id} className="text-center">
                    <div className="text-amber-400 text-xs font-medium uppercase tracking-wider mb-1">
                      {line.speaker}
                    </div>
                    <div className="text-gray-100 text-sm leading-relaxed">
                      {line.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isDeadEnd && (
              <div className="text-center mb-8">
                <div className="text-gray-600 text-sm mb-4">此路不通 — 该节点没有可用的选择分支</div>
                {history.length > 0 && (
                  <button
                    onClick={goBack}
                    className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
                  >
                    ← 返回上一步
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!isEnding && (
          <div className="absolute bottom-6 right-6 bg-gray-900/90 border border-gray-800 rounded-lg px-4 py-3 max-w-[220px] space-y-2">
            {(emotionFunction.emotionIn || emotionFunction.emotionOut) && (
              <div className="text-gray-500 text-xs">
                <span className="text-gray-400">{emotionFunction.emotionIn || '—'}</span>
                <span className="text-gray-600 mx-1">→</span>
                <span className="text-gray-400">{emotionFunction.emotionOut || '—'}</span>
              </div>
            )}
            {emotionFunction.tension > 0 && (
              <div>
                <div className="text-gray-600 text-xs mb-1">紧张度 {emotionFunction.tension}/10</div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full transition-all"
                    style={{ width: `${emotionFunction.tension * 10}%` }}
                  />
                </div>
              </div>
            )}
            {project.variables.length > 0 && (
              <div className="border-t border-gray-800 pt-2 space-y-1">
                {project.variables.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{v.name}</span>
                    <span className="text-amber-500/80 font-mono">{String(varState[v.name] ?? v.defaultValue ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* 探索节点：自动返回按钮 */}
      {isExploreNode && (
        <div className="bg-teal-950/60 border-t border-teal-800/40 px-6 py-4 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-xs text-teal-600 italic">此为可选探索内容</p>
            {currentNode.exploreReturnNodeId && nodeMap.has(currentNode.exploreReturnNodeId) && (
              <button
                onClick={() => navigateTo(currentNode.exploreReturnNodeId!, undefined, true)}
                className="px-4 py-2 bg-teal-900/60 border border-teal-700/50 text-teal-300 text-sm rounded-lg hover:bg-teal-800/60 transition-colors"
              >
                ← 返回故事主线
              </button>
            )}
          </div>
        </div>
      )}

      {!isEnding && !isExploreNode && (mainChoices.length > 0 || exploreChoices.length > 0) && (
        <div className="bg-zinc-950/80 border-t border-zinc-800 px-6 py-6 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* 主线选项 */}
            {mainChoices.length > 0 && (
              <div>
                <p className="text-xs text-zinc-600 uppercase tracking-widest mb-3 text-center">你的选择</p>
                <div className="space-y-2">
                  {mainChoices
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((choice, i) => {
                      const isLoop = history.includes(choice.targetNodeId)
                      const visitCount = history.filter(id => id === choice.targetNodeId).length
                      const targetNode = nodes.find(n => n.id === choice.targetNodeId)
                      const leadsToEnding = targetNode?.type === 'ending'
                      const isCritical = choice.choiceWeight === 'critical'
                      const isHeavy = choice.choiceWeight === 'heavy'
                      return (
                        <button
                          key={choice.id}
                          onClick={() => navigateTo(choice.targetNodeId, choice.variableEffects)}
                          className={`w-full flex items-start gap-4 px-5 py-4 border rounded-xl transition-all duration-200 group text-left relative overflow-hidden
                            ${leadsToEnding
                              ? 'bg-amber-950/30 border-amber-800/40 hover:bg-amber-950/50 hover:border-amber-600/60'
                              : isCritical
                              ? 'bg-zinc-900/50 border-red-900/40 hover:bg-zinc-800/60 hover:border-red-700/60'
                              : 'bg-zinc-900/50 border-zinc-800/60 hover:bg-zinc-800/60 hover:border-zinc-600/60'
                            }`}
                        >
                          <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors mt-0.5
                            ${leadsToEnding
                              ? 'bg-amber-900/60 text-amber-400 group-hover:bg-amber-600 group-hover:text-white'
                              : isCritical
                              ? 'bg-red-900/50 text-red-400 group-hover:bg-red-700 group-hover:text-white'
                              : 'bg-zinc-800 text-zinc-400 group-hover:bg-purple-700 group-hover:text-white'
                            }`}>
                            {CHOICE_LABELS[i] ?? i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium transition-colors leading-relaxed
                              ${leadsToEnding ? 'text-amber-200 group-hover:text-amber-100' :
                                isCritical ? 'text-red-200 group-hover:text-red-100' :
                                'text-zinc-200 group-hover:text-white'}`}>
                              {choice.text}
                            </div>
                            {leadsToEnding && <div className="text-xs text-amber-600/70 mt-0.5">→ 故事终局</div>}
                            {isCritical && <div className="text-xs text-red-700/70 mt-0.5">⚡ 关键抉择 · 不可撤回</div>}
                            {isHeavy && !isCritical && <div className="text-xs text-orange-700/60 mt-0.5">此选择将影响后续剧情</div>}
                            {isLoop && <div className="text-xs text-zinc-600 italic mt-0.5">↩ 回到之前的节点</div>}
                            {visitCount >= 3 && <div className="text-xs text-amber-600/70 mt-0.5">已探索 {visitCount} 次</div>}
                          </div>
                          {choice.variableEffects && (
                            <div className="shrink-0 text-xs text-violet-500/60 font-mono mt-0.5">{choice.variableEffects}</div>
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* 探索选项（可选，灰色次要显示） */}
            {exploreChoices.length > 0 && (
              <div className="border-t border-zinc-800/50 pt-3">
                <p className="text-[10px] text-zinc-700 uppercase tracking-widest mb-2 text-center">探索（可选）</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {exploreChoices.map(choice => (
                    <button
                      key={choice.id}
                      onClick={() => enterExplore(choice.targetNodeId, choice.variableEffects)}
                      className="px-3 py-1.5 bg-teal-950/30 border border-teal-800/30 text-teal-400/70 text-xs rounded-lg hover:bg-teal-900/40 hover:text-teal-300 transition-colors"
                    >
                      ◎ {choice.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
