'use client'
import { useEffect, useRef, useState } from 'react'
import type { SaveStateDetail } from '@/lib/persistence'
import { Spinner } from '@/app/components/ui/button'

type DisplayState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const LABEL: Record<Exclude<DisplayState, 'idle'>, string> = {
  saving: '保存中…',
  saved: '已保存 ✓',
  error: '保存失败，重试中…',
  conflict: '保存冲突',
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

  if (state === 'saving') {
    return (
      <span className="text-xs text-pencil flex items-center gap-1.5 shrink-0">
        <Spinner />
        {LABEL.saving}
      </span>
    )
  }

  if (state === 'saved') {
    return <span className="text-xs text-pencil shrink-0">{LABEL.saved}</span>
  }

  return <span className="text-xs font-medium text-vermilion shrink-0">{LABEL[state]}</span>
}
