'use client'
import type { StoryNode } from '@/lib/types/project'
import type { PreviewMode } from './types'

interface Props {
  node: StoryNode
  mode: PreviewMode
  isDeadEnd: boolean
  canGoBack: boolean
  onGoBack: () => void
}

export function NarrativeBody({ node, mode, isDeadEnd, canGoBack, onGoBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
      <div className="max-w-2xl w-full">
        {node.sceneDesc && (
          <p className="italic text-sm text-center mb-10 leading-relaxed text-[var(--pv-dim)]">{node.sceneDesc}</p>
        )}

        {node.dialogue.length > 0 && (
          <div className="space-y-6 mb-12">
            {node.dialogue.map(line => (
              <div key={line.id} className="text-center">
                <div className="text-xs font-medium uppercase tracking-wider mb-1 text-[var(--pv-accent)]">{line.speaker}</div>
                <div className="text-sm leading-relaxed text-[var(--pv-text)]">{line.text}</div>
              </div>
            ))}
          </div>
        )}

        {isDeadEnd && (
          <div className="text-center mb-8">
            <div className="text-sm mb-4 leading-relaxed text-[var(--pv-dim)]">
              {mode === 'player' ? '…故事在此戛然而止。' : '此路不通 — 该节点没有可用的选择分支'}
            </div>
            {canGoBack && (
              <button
                onClick={onGoBack}
                className="px-5 py-2 bg-[var(--pv-line-soft)] hover:bg-[var(--pv-line)] text-[var(--pv-text-soft)] text-sm rounded transition-colors cursor-pointer"
              >
                ← 返回上一步
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
