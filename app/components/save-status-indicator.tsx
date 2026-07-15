'use client'
import { useEffect, useRef, useState } from 'react'
import type { SaveStateDetail } from '@/lib/persistence'

type DisplayState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const CONFIG: Record<Exclude<DisplayState, 'idle'>, { label: string; color: string }> = {
  saving: { label: '保存中…', color: 'var(--shell-fg-3)' },
  saved: { label: '已保存', color: 'var(--gold-mid)' },
  error: { label: '保存失败，重试中…', color: 'rgb(220,38,38)' },
  conflict: { label: '保存冲突', color: 'rgb(220,38,38)' },
}

/** 监听 window 上的 `filmgame:save-state` 事件，展示当前项目的保存状态。 */
export function SaveStatusIndicator({ projectId }: { projectId: string }) {
  const [state, setState] = useState<DisplayState>('idle')
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<SaveStateDetail>).detail
      if (!detail || detail.id !== projectId) return
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
      setState(detail.state)
      if (detail.state === 'saved') {
        hideTimer.current = setTimeout(() => setState('idle'), 2000)
      }
    }
    window.addEventListener('filmgame:save-state', handler)
    return () => {
      window.removeEventListener('filmgame:save-state', handler)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [projectId])

  if (state === 'idle') return null
  const { label, color } = CONFIG[state]

  return (
    <span className="text-xs font-medium tracking-wide flex items-center gap-1.5 shrink-0" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
