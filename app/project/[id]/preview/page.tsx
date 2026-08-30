'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { evalConditions, applyVariableEffect } from '@/lib/conditions'
import type { StoryNode } from '@/lib/types/project'
import type { PreviewMode } from './types'
import { PV_VARS } from './theme'
import { TopBar } from './TopBar'
import { HistoryBar } from './HistoryBar'
import { EndingScreen } from './EndingScreen'
import { NarrativeBody } from './NarrativeBody'
import { DebugPanel } from './DebugPanel'
import { ChoicePanel } from './ChoicePanel'

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
  // varHistory[i] = 进入/停留在 history[i] 时刻（离开该节点前）的 varState 快照，与 history 索引严格对齐
  const [varHistory, setVarHistory] = useState<Record<string, string | number>[]>([])
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
    const current = currentNodeId ?? startNode?.id
    // fromExplore（探索节点返回主线）不入 history，varHistory 必须同步不入栈，否则索引错位
    if (current && !fromExplore) {
      setHistory(prev => [...prev, current])
      setVarHistory(prev => [...prev, varState])
    }
    if (choiceEffect) setVarState(s => applyVariableEffect(s, choiceEffect))
    setCurrentNodeId(nodeId)
  }, [currentNodeId, startNode?.id, varState])

  const enterExplore = useCallback((exploreNodeId: string, choiceEffect?: string) => {
    const current = currentNodeId ?? startNode?.id
    if (current) {
      setHistory(prev => [...prev, current])
      setVarHistory(prev => [...prev, varState])
    }
    if (choiceEffect) setVarState(s => applyVariableEffect(s, choiceEffect))
    setCurrentNodeId(exploreNodeId)
  }, [currentNodeId, startNode?.id, varState])

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setCurrentNodeId(last)
      return prev.slice(0, -1)
    })
    setVarHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setVarState(last)
      return prev.slice(0, -1)
    })
  }, [])

  const jumpTo = useCallback((nodeId: string) => {
    const idx = history.indexOf(nodeId)
    if (idx === -1) return
    setCurrentNodeId(nodeId)
    setHistory(prev => prev.slice(0, idx))
    setVarState(varHistory[idx])
    setVarHistory(prev => prev.slice(0, idx))
  }, [history, varHistory])

  const reset = useCallback(() => {
    setCurrentNodeId(null)
    setHistory([])
    setVarHistory([])
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

  const pvVars = PV_VARS[theme] as React.CSSProperties

  if (nodes.length === 0) {
    return (
      <div data-pv-theme={theme} style={pvVars} className="min-h-full bg-[var(--pv-bg)] text-[var(--pv-text)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-6 opacity-40">🎬</div>
          <h2 className="text-lg font-medium mb-2 text-[var(--pv-text-soft)]">暂无内容可预览</h2>
          <p className="text-sm mb-6 text-[var(--pv-dim)]">请先在编辑器中创建节点和对白</p>
          <Link href={`/project/${projectId}/structure`} className="text-[var(--pv-accent)] hover:text-[var(--pv-accent-deep)] text-sm transition-colors cursor-pointer">
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
  const backHref = `/project/${projectId}/${project.currentPhase === 'workshop' || project.currentPhase === 'validate' ? 'workshop' : 'structure'}`
  const showDebugPanel = !isEnding && (mode === 'author' || project.variables.length > 0)

  return (
    <div data-pv-theme={theme} style={pvVars} className="min-h-full bg-[var(--pv-bg)] text-[var(--pv-text)] flex flex-col">
      <TopBar
        backHref={backHref}
        nodeTitle={currentNode.title}
        visitedCount={visitedCount}
        totalNodes={nodes.length}
        mode={mode}
        setMode={setMode}
        theme={theme}
        toggleTheme={toggleTheme}
        onReset={reset}
      />

      <HistoryBar history={history} nodeMap={nodeMap} currentTitle={currentNode.title} onJumpTo={jumpTo} />

      {isEnding ? (
        <EndingScreen
          node={currentNode}
          ending={ending}
          totalEndings={project.endings.length}
          unlockedCount={unlockedEndings.length}
          stepsToReach={history.length + 1}
          totalNodes={nodes.length}
          visitedCount={visitedCount}
          canGoBack={history.length > 0}
          onReset={reset}
          onGoBack={goBack}
        />
      ) : (
        <>
          <NarrativeBody node={currentNode} mode={mode} isDeadEnd={isDeadEnd} canGoBack={history.length > 0} onGoBack={goBack} />
          {showDebugPanel && (
            <DebugPanel mode={mode} emotionFunction={emotionFunction} variables={project.variables} varState={varState} />
          )}
        </>
      )}

      {isExploreNode && (
        <div className="border-t px-6 py-4 bg-[var(--pv-success-soft)] border-[var(--pv-success)]/30">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-xs italic text-[var(--pv-success)]">此为可选探索内容</p>
            {currentNode.exploreReturnNodeId && nodeMap.has(currentNode.exploreReturnNodeId) && (
              <button
                onClick={() => navigateTo(currentNode.exploreReturnNodeId!, undefined, true)}
                className="px-4 py-2 bg-[var(--pv-success-soft)] border border-[var(--pv-success)]/40 text-[var(--pv-success)] text-sm rounded-lg hover:bg-[var(--pv-success)]/20 transition-colors cursor-pointer"
              >
                ← 返回故事主线
              </button>
            )}
          </div>
        </div>
      )}

      {!isEnding && !isExploreNode && (mainChoices.length > 0 || exploreChoices.length > 0) && (
        <ChoicePanel
          mainChoices={mainChoices}
          exploreChoices={exploreChoices}
          history={history}
          nodes={nodes}
          onNavigate={navigateTo}
          onExplore={enterExplore}
        />
      )}
    </div>
  )
}
