'use client'
import { useEffect, useState } from 'react'
import type { EmotionFunction, Variable } from '@/lib/types/project'

const COLLAPSE_KEY = 'filmgame:preview-debug-collapsed'

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function persistCollapsed(v: boolean): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

interface Props {
  mode: 'author' | 'player'
  emotionFunction: EmotionFunction
  variables: Variable[]
  varState: Record<string, string | number>
}

export function DebugPanel({ mode, emotionFunction, variables, varState }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { setCollapsed(loadCollapsed()) }, [])

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      persistCollapsed(next)
      return next
    })
  }

  const hasEmotion = mode === 'author' && (emotionFunction.emotionIn || emotionFunction.emotionOut)
  const hasTension = mode === 'author' && emotionFunction.tension > 0
  const hasVars = variables.length > 0

  return (
    <div
      className="fixed bottom-6 right-6 bg-[var(--pv-panel)]/95 border border-[var(--pv-line)] rounded-lg px-4 py-3 max-w-[220px] z-10"
      style={{ boxShadow: 'var(--pv-shadow-lift)' }}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--pv-dim)] hover:text-[var(--pv-text)] transition-colors cursor-pointer"
      >
        <span>调试面板</span>
        <span>{collapsed ? '展开 ▴' : '折叠 ▾'}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 mt-2">
          {hasEmotion && (
            <div className="text-xs text-[var(--pv-dim)]">
              <span className="text-[var(--pv-text-soft)]">{emotionFunction.emotionIn || '—'}</span>
              <span className="mx-1 text-[var(--pv-line)]">→</span>
              <span className="text-[var(--pv-text-soft)]">{emotionFunction.emotionOut || '—'}</span>
            </div>
          )}
          {hasTension && (
            <div>
              <div className="text-xs mb-1 text-[var(--pv-dim)]">紧张度 {emotionFunction.tension}/10</div>
              <div className="h-1 bg-[var(--pv-line-soft)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--pv-accent)] rounded-full transition-all"
                  style={{ width: `${emotionFunction.tension * 10}%` }}
                />
              </div>
            </div>
          )}
          {hasVars && (
            <div className="border-t border-[var(--pv-line-soft)] pt-2 space-y-1">
              {variables.map(v => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--pv-dim)]">{v.name}</span>
                  <span className="font-mono text-[var(--pv-accent)]">{String(varState[v.name] ?? v.defaultValue ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
          {!hasEmotion && !hasTension && !hasVars && (
            <div className="text-xs text-[var(--pv-dim)]">暂无调试数据</div>
          )}
        </div>
      )}
    </div>
  )
}
