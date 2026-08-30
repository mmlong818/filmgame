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

        {/* 空节点兜底：无场景描述且无对白时不能是一整屏空白 */}
        {!node.sceneDesc && node.dialogue.length === 0 && !isDeadEnd && (
          <div className="text-center mb-8">
            <div className="text-lg tracking-wide mb-2 text-[var(--pv-text-soft)]">{node.title}</div>
            <div className="text-xs text-[var(--pv-dim)]">
              {mode === 'player' ? '· · ·' : '该节点尚未填充内容——回到场景工坊补写场景描述与对白'}
            </div>
          </div>
        )}

        {isDeadEnd && (
          <div className="text-center mb-8">
            <div className="text-sm mb-4 leading-relaxed text-[var(--pv-dim)]">
              {mode === 'player' ? '…故事在此戛然而止。' : '此路不通 — 该节点没有可用的选择分支'}
            </div>
          </div>
        )}

        {/* 返回上一步：所有节点常驻（此前只在死路/结局屏出现，普通节点只能靠面包屑回跳） */}
        {canGoBack && (
          <div className="text-center">
            <button
              onClick={onGoBack}
              className="px-4 py-1.5 text-xs text-[var(--pv-dim)] hover:text-[var(--pv-text-soft)] border border-[var(--pv-line-soft)] hover:border-[var(--pv-line)] transition-colors cursor-pointer"
            >
              ← 返回上一步
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
