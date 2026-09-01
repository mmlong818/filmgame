'use client'
import { useState } from 'react'
import type { StoryNode } from '@/lib/types/project'

interface Props {
  history: string[]
  nodeMap: Map<string, StoryNode>
  currentTitle: string
  /** 传历史数组中的真实下标（非 nodeId）：循环剧情里同一节点会重复出现 */
  onJumpTo: (index: number) => void
}

const VISIBLE_STEPS = 12

export function HistoryBar({ history, nodeMap, currentTitle, onJumpTo }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (history.length === 0) return null

  const hiddenCount = history.length - VISIBLE_STEPS
  const collapsed = !expanded && hiddenCount > 0
  const shown = collapsed ? history.slice(-VISIBLE_STEPS) : history
  const offset = collapsed ? history.length - VISIBLE_STEPS : 0  // 折叠时 shown 是尾部切片，下标需还原

  return (
    <div className="border-b border-[var(--pv-line)] bg-[var(--pv-panel-alt)] px-6 py-2 flex items-center gap-1 overflow-x-auto">
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-xs text-[var(--pv-dim)] hover:text-[var(--pv-accent)] transition-colors cursor-pointer mr-1"
        >
          {expanded ? '收起' : `展开全部（+${hiddenCount}）`}
        </button>
      )}
      {shown.map((hId, i) => {
        const hNode = nodeMap.get(hId)
        if (!hNode) return null
        return (
          <span key={`${hId}-${i}`} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onJumpTo(offset + i)}
              className="text-xs text-[var(--pv-dim)] hover:text-[var(--pv-accent)] transition-colors cursor-pointer"
            >
              {hNode.title}
            </button>
            <span className="text-xs text-[var(--pv-line)]">→</span>
          </span>
        )
      })}
      <span className="text-xs font-medium shrink-0 text-[var(--pv-accent)]">{currentTitle}</span>
    </div>
  )
}
