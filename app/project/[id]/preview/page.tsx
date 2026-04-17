'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { evalConditions } from '@/lib/conditions'
import type { StoryNode } from '@/lib/types/project'

type PreviewMode = 'author' | 'player'

const CHOICE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const ENDING_THEMES = {
  good: {
    bg: 'bg-gradient-to-b from-amber-50 via-amber-100/60 to-orange-50',
    border: 'border-amber-300',
    titleColor: 'text-amber-900',
    icon: '🌅',
    label: '完美结局',
    labelColor: 'text-amber-600',
    glow: 'shadow-[0_0_80px_rgba(217,119,6,0.12)]',
    pulse: true,
  },
  bad: {
    bg: 'bg-gradient-to-b from-slate-100 to-slate-200',
    border: 'border-slate-300',
    titleColor: 'text-slate-600',
    icon: '🌑',
    label: '悲剧结局',
    labelColor: 'text-slate-400',
    glow: '',
    pulse: false,
  },
  neutral: {
    bg: 'bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-50',
    border: 'border-slate-300',
    titleColor: 'text-slate-700',
    icon: '🎭',
    label: '中性结局',
    labelColor: 'text-slate-500',
    glow: 'shadow-[0_0_40px_rgba(100,116,139,0.08)]',
    pulse: false,
  },
  secret: {
    bg: 'bg-gradient-to-b from-purple-50 via-purple-100/30 to-indigo-50',
    border: 'border-purple-300',
    titleColor: 'text-purple-900',
    icon: '🔮',
    label: '隐藏结局',
    labelColor: 'text-purple-600',
    glow: 'shadow-[0_0_100px_rgba(147,51,234,0.15)]',
    pulse: true,
  },
} as const

function findStartNode(nodes: StoryNode[]): StoryNode | undefined {
  return nodes.find(n => n.type === 'start') ?? nodes[0]
}

const themeKey = (projectId: string) => `filmgame:preview-theme:${projectId}`
const unlockedKey = (projectId: string) => `filmgame:unlocked:${projectId}`

function loadTheme(projectId: string): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  try { return localStorage.getItem(themeKey(projectId)) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

function persistTheme(projectId: string, theme: 'dark' | 'light'): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(themeKey(projectId), theme) } catch { /* ignore */ }
}

function loadUnlockedEndings(projectId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(unlockedKey(projectId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistUnlockedEndings(projectId: string, ids: string[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(unlockedKey(projectId), JSON.stringify(ids)) } catch { /* ignore */ }
}

function applyVariableEffect(state: Record<string, string | number>, effect: string): Record<string, string | number> {
  if (!effect.trim()) return state
  const next = { ...state }
  for (const part of effect.split(',')) {
    const p = part.trim()
    if (!p) continue
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const projectId = params.id as string
  const project = useProjectStore(s => s.project)
  const mode: PreviewMode = searchParams.get('mode') === 'player' ? 'player' : 'author'

  const setMode = useCallback((next: PreviewMode) => {
    const usp = new URLSearchParams(searchParams.toString())
    if (next === 'player') usp.set('mode', 'player')
    else usp.delete('mode')
    const qs = usp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, searchParams])
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [varState, setVarState] = useState<Record<string, string | number>>({})
  const [unlockedEndings, setUnlockedEndings] = useState<string[]>([])
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      if (projectId) persistTheme(projectId, next)
      return next
    })
  }, [projectId])

  const nodes = project?.nodes ?? []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const startNode = findStartNode(nodes)
  const activeId = currentNodeId ?? startNode?.id
  const currentNode = activeId ? nodeMap.get(activeId) : undefined

  const navigateTo = useCallback((nodeId: string, choiceEffect?: string, fromExplore?: boolean) => {
    setHistory(prev => {
      const current = currentNodeId ?? startNode?.id
      if (!current) return prev
      if (fromExplore) return prev
      return [...prev, current]
    })
    if (choiceEffect) setVarState(s => applyVariableEffect(s, choiceEffect))
    setCurrentNodeId(nodeId)
  }, [currentNodeId, startNode?.id])

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
    setUnlockedEndings(loadUnlockedEndings(project.id))
    setThemeState(loadTheme(project.id))
  }, [project?.id])

  useEffect(() => {
    if (!project || !currentNodeId) return
    const node = project.nodes.find(n => n.id === currentNodeId)
    if (node?.type !== 'ending') return
    if (unlockedEndings.includes(node.id)) return
    const next = [...unlockedEndings, node.id]
    setUnlockedEndings(next)
    persistUnlockedEndings(project.id, next)
  }, [currentNodeId, project?.id])

  if (!project) return null

  if (nodes.length === 0) {
    return (
      <div className={`min-h-full bg-slate-50 flex items-center justify-center ${theme === 'dark' ? 'preview-dark' : ''}`}>
        <div className="text-center">
          <div className="text-slate-300 text-5xl mb-6">🎬</div>
          <h2 className="text-slate-700 text-lg font-medium mb-2">暂无内容可预览</h2>
          <p className="text-slate-400 text-sm mb-6">请先在编辑器中创建节点和对白</p>
          <Link
            href={`/project/${projectId}/structure`}
            className="text-amber-500 hover:text-amber-400 text-sm transition-colors"
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
    <div className={`min-h-full bg-slate-50 flex flex-col ${theme === 'dark' ? 'preview-dark' : ''}`}>
      <div className="bg-white/80 border-b border-slate-200 px-6 py-2.5 flex items-center gap-4">
        <Link
          href={`/project/${projectId}/${project.currentPhase === 'workshop' || project.currentPhase === 'validate' ? 'workshop' : 'structure'}`}
          className="text-slate-400 hover:text-slate-700 text-xs transition-colors"
        >
          ← 返回编辑
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-700 text-xs font-medium flex-1 truncate">
          {currentNode.title}
        </span>
        <span className="text-slate-400 text-xs">
          {visitedCount} / {nodes.length} 节点
        </span>
        <div className="flex items-center border border-slate-200 rounded overflow-hidden text-[11px]">
          <button
            onClick={() => setMode('author')}
            className={`px-2 py-0.5 transition-colors ${mode === 'author' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}
            title="编辑预览：显示调试信息"
          >
            编辑
          </button>
          <button
            onClick={() => setMode('player')}
            className={`px-2 py-0.5 transition-colors ${mode === 'player' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}
            title="玩家视角：隐藏调试，仅叙事"
          >
            玩家
          </button>
        </div>
        <button
          onClick={toggleTheme}
          className="text-slate-400 hover:text-slate-700 text-xs transition-colors"
          title={theme === 'dark' ? '切换到浅色' : '切换到影院模式'}
        >
          {theme === 'dark' ? '☾ 影院' : '☀ 浅色'}
        </button>
        <button
          onClick={reset}
          className="text-slate-400 hover:text-slate-700 text-xs transition-colors"
        >
          重置
        </button>
      </div>

      {history.length > 0 && (
        <div className="bg-slate-100/60 border-b border-slate-200 px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {history.map((hId, i) => {
            const hNode = nodeMap.get(hId)
            if (!hNode) return null
            return (
              <span key={`${hId}-${i}`} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => jumpTo(hId)}
                  className="text-slate-400 hover:text-purple-600 text-xs transition-colors"
                >
                  {hNode.title}
                </button>
                <span className="text-slate-300 text-xs">→</span>
              </span>
            )
          })}
          <span className="text-purple-600 text-xs font-medium shrink-0">{currentNode.title}</span>
        </div>
      )}

      {isEnding ? (() => {
        const theme = ENDING_THEMES[ending?.type ?? 'neutral'] ?? ENDING_THEMES.neutral
        return (
          <div className={`flex-1 flex flex-col items-center justify-center px-6 py-12 relative transition-all duration-1000 ${theme.bg}`}>
            <div className={`max-w-lg w-full text-center border ${theme.border} rounded-2xl p-10 ${theme.glow} bg-white/60 backdrop-blur-sm`}>
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
                <p className="text-slate-400 italic text-xs leading-relaxed mb-8">
                  {currentNode.sceneDesc}
                </p>
              )}
              {currentNode.dialogue.length > 0 && (
                <div className="border-t border-slate-200 pt-6 mb-6 space-y-3">
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
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg transition-all border border-slate-700"
                >
                  重新开始
                </button>
                {history.length > 0 && (
                  <button
                    onClick={goBack}
                    className="px-6 py-2.5 bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-sm rounded-lg transition-all border border-slate-200"
                  >
                    返回上一步
                  </button>
                )}
              </div>
            </div>
            <div className="absolute bottom-6 left-0 right-0 text-center space-y-1">
              {project.endings.length > 0 && (
                <div className="text-xs font-medium" style={{ color: 'var(--tw-amber, #d97706)' }}>
                  <span className={theme.labelColor}>
                    已解锁结局 {unlockedEndings.length} / {project.endings.length}
                  </span>
                  {unlockedEndings.length < project.endings.length && (
                    <span className="text-slate-400 ml-2">· 还有 {project.endings.length - unlockedEndings.length} 条路径未发现</span>
                  )}
                </div>
              )}
              <div className="text-xs text-slate-400">
                {history.length + 1} 步到达此结局 · {nodes.length} 个节点探索了 {visitedCount} 个
              </div>
            </div>
          </div>
        )
      })() : (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {(
          <div className="max-w-2xl w-full">

            {currentNode.sceneDesc && (
              <p className="text-slate-400 italic text-sm text-center mb-10 leading-relaxed">
                {currentNode.sceneDesc}
              </p>
            )}

            {currentNode.dialogue.length > 0 && (
              <div className="space-y-6 mb-12">
                {currentNode.dialogue.map(line => (
                  <div key={line.id} className="text-center">
                    <div className="text-amber-600 text-xs font-medium uppercase tracking-wider mb-1">
                      {line.speaker}
                    </div>
                    <div className="text-slate-800 text-sm leading-relaxed">
                      {line.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isDeadEnd && (
              <div className="text-center mb-8">
                <div className="text-slate-400 text-sm mb-4 leading-relaxed">
                  {mode === 'player'
                    ? '…故事在此戛然而止。'
                    : '此路不通 — 该节点没有可用的选择分支'}
                </div>
                {history.length > 0 && (
                  <button
                    onClick={goBack}
                    className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm rounded transition-colors"
                  >
                    ← 返回上一步
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!isEnding && (mode === 'author' || project.variables.length > 0) && (
          <div className="absolute bottom-6 right-6 bg-white/90 border border-slate-200 rounded-lg px-4 py-3 max-w-[220px] space-y-2">
            {mode === 'author' && (emotionFunction.emotionIn || emotionFunction.emotionOut) && (
              <div className="text-slate-400 text-xs">
                <span className="text-slate-600">{emotionFunction.emotionIn || '—'}</span>
                <span className="text-slate-300 mx-1">→</span>
                <span className="text-slate-600">{emotionFunction.emotionOut || '—'}</span>
              </div>
            )}
            {mode === 'author' && emotionFunction.tension > 0 && (
              <div>
                <div className="text-slate-400 text-xs mb-1">紧张度 {emotionFunction.tension}/10</div>
                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-red-400 rounded-full transition-all"
                    style={{ width: `${emotionFunction.tension * 10}%` }}
                  />
                </div>
              </div>
            )}
            {project.variables.length > 0 && (
              <div className="border-t border-slate-200 pt-2 space-y-1">
                {project.variables.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{v.name}</span>
                    <span className="text-amber-600 font-mono">{String(varState[v.name] ?? v.defaultValue ?? 0)}</span>
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
        <div className="bg-teal-50 border-t border-teal-200 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-xs text-teal-600 italic">此为可选探索内容</p>
            {currentNode.exploreReturnNodeId && nodeMap.has(currentNode.exploreReturnNodeId) && (
              <button
                onClick={() => navigateTo(currentNode.exploreReturnNodeId!, undefined, true)}
                className="px-4 py-2 bg-teal-100 border border-teal-300 text-teal-700 text-sm rounded-lg hover:bg-teal-200 transition-colors"
              >
                ← 返回故事主线
              </button>
            )}
          </div>
        </div>
      )}

      {!isEnding && !isExploreNode && (mainChoices.length > 0 || exploreChoices.length > 0) && (
        <div className="bg-white/80 border-t border-slate-200 px-6 py-6 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* 主线选项 */}
            {mainChoices.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-3 text-center">你的选择</p>
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
                              ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-400'
                              : isCritical
                              ? 'bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-400'
                              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-400'
                            }`}
                        >
                          <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors mt-0.5
                            ${leadsToEnding
                              ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white'
                              : isCritical
                              ? 'bg-red-100 text-red-500 group-hover:bg-red-500 group-hover:text-white'
                              : 'bg-slate-200 text-slate-500 group-hover:bg-purple-600 group-hover:text-white'
                            }`}>
                            {CHOICE_LABELS[i] ?? i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium transition-colors leading-relaxed
                              ${leadsToEnding ? 'text-amber-800 group-hover:text-amber-900' :
                                isCritical ? 'text-red-700 group-hover:text-red-900' :
                                'text-slate-700 group-hover:text-slate-900'}`}>
                              {choice.text}
                            </div>
                            {leadsToEnding && <div className="text-xs text-amber-500 mt-0.5">→ 故事终局</div>}
                            {isCritical && <div className="text-xs text-red-500 mt-0.5">⚡ 关键抉择 · 不可撤回</div>}
                            {isHeavy && !isCritical && <div className="text-xs text-orange-500 mt-0.5">此选择将影响后续剧情</div>}
                            {isLoop && <div className="text-xs text-slate-400 italic mt-0.5">↩ 回到之前的节点</div>}
                            {visitCount >= 3 && <div className="text-xs text-amber-500 mt-0.5">已探索 {visitCount} 次</div>}
                          </div>
                          {choice.variableEffects && (
                            <div className="shrink-0 text-xs text-violet-500 font-mono mt-0.5">{choice.variableEffects}</div>
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* 探索选项（可选，次要显示） */}
            {exploreChoices.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2 text-center">探索（可选）</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {exploreChoices.map(choice => (
                    <button
                      key={choice.id}
                      onClick={() => enterExplore(choice.targetNodeId, choice.variableEffects)}
                      className="px-3 py-1.5 bg-teal-50 border border-teal-200 text-teal-600 text-xs rounded-lg hover:bg-teal-100 hover:text-teal-700 transition-colors"
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
