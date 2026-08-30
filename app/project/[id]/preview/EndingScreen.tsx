'use client'
import type { Ending, StoryNode } from '@/lib/types/project'
import { ENDING_ACCENTS } from './theme'

interface Props {
  node: StoryNode
  ending: Ending | null | undefined
  totalEndings: number
  unlockedCount: number
  stepsToReach: number
  totalNodes: number
  visitedCount: number
  canGoBack: boolean
  onReset: () => void
  onGoBack: () => void
}

export function EndingScreen({ node, ending, totalEndings, unlockedCount, stepsToReach, totalNodes, visitedCount, canGoBack, onReset, onGoBack }: Props) {
  const accent = ENDING_ACCENTS[ending?.type ?? 'neutral']

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative transition-all duration-1000"
      style={{ background: `radial-gradient(ellipse at 50% 20%, ${accent.hex}22, transparent 65%)` }}
    >
      <div
        className="max-w-lg w-full text-center border rounded-2xl p-10 bg-[var(--pv-panel)]/90 backdrop-blur-sm"
        style={{ borderColor: `${accent.hex}55`, boxShadow: `0 0 60px ${accent.hex}22, var(--pv-shadow-lift)` }}
      >
        <div className={`text-6xl mb-6 ${accent.pulse ? 'animate-pulse' : ''}`}>{accent.icon}</div>
        <div className="text-xs uppercase tracking-[0.3em] mb-4 font-medium" style={{ color: accent.hex }}>
          {accent.label}
        </div>
        <h2 className="text-2xl font-light mb-6 leading-relaxed text-[var(--pv-text)]">
          {ending?.title ?? node.title}
        </h2>
        {ending?.description && (
          <p className="text-sm leading-loose mb-6 opacity-80 text-[var(--pv-text-soft)]">{ending.description}</p>
        )}
        {node.sceneDesc && (
          <p className="italic text-xs leading-relaxed mb-8 text-[var(--pv-dim)]">{node.sceneDesc}</p>
        )}
        {node.dialogue.length > 0 && (
          <div className="border-t border-[var(--pv-line)] pt-6 mb-6 space-y-3">
            {node.dialogue.map(line => (
              <div key={line.id} className="text-center">
                <div className="text-xs font-medium uppercase tracking-wider mb-0.5 opacity-70" style={{ color: accent.hex }}>
                  {line.speaker}
                </div>
                <div className="text-sm leading-relaxed opacity-90 text-[var(--pv-text-soft)]">{line.text}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onReset}
            className="px-6 py-2.5 bg-[var(--pv-accent)] hover:bg-[var(--pv-accent-deep)] text-[var(--pv-panel)] text-sm rounded-lg transition-all cursor-pointer"
          >
            重新开始
          </button>
          {canGoBack && (
            <button
              onClick={onGoBack}
              className="px-6 py-2.5 bg-transparent hover:bg-[var(--pv-choice-hover)] text-[var(--pv-dim)] hover:text-[var(--pv-text)] text-sm rounded-lg transition-all border border-[var(--pv-line)] cursor-pointer"
            >
              返回上一步
            </button>
          )}
        </div>
      </div>
      <div className="absolute bottom-6 left-0 right-0 text-center space-y-1">
        {totalEndings > 0 && (
          <div className="text-xs font-medium">
            <span style={{ color: accent.hex }}>已解锁结局 {unlockedCount} / {totalEndings}</span>
            {unlockedCount < totalEndings && (
              <span className="ml-2 text-[var(--pv-dim)]">· 还有 {totalEndings - unlockedCount} 条路径未发现</span>
            )}
          </div>
        )}
        <div className="text-xs text-[var(--pv-dim)]">
          {stepsToReach} 步到达此结局 · {totalNodes} 个节点探索了 {visitedCount} 个
        </div>
      </div>
    </div>
  )
}
