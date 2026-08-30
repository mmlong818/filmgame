'use client'
import { useEffect, useRef } from 'react'
import type { Choice, StoryNode } from '@/lib/types/project'

const CHOICE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

interface Props {
  mainChoices: Choice[]
  exploreChoices: Choice[]
  history: string[]
  nodes: StoryNode[]
  onNavigate: (targetNodeId: string, effect?: string) => void
  onExplore: (targetNodeId: string, effect?: string) => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/** 数字键 1-9 / 字母键 A-Z 直选对应可用主线选项（输入焦点中不拦截） */
function useChoiceHotkeys(choices: Choice[], onNavigate: Props['onNavigate']) {
  const latest = useRef({ choices, onNavigate })
  latest.current = { choices, onNavigate }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const { choices: current, onNavigate: navigate } = latest.current
      let index = -1
      if (e.key >= '1' && e.key <= '9') index = Number(e.key) - 1
      else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) index = CHOICE_LABELS.indexOf(e.key.toUpperCase())
      if (index < 0 || index >= current.length) return
      e.preventDefault()
      const choice = current[index]
      navigate(choice.targetNodeId, choice.variableEffects)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

export function ChoicePanel({ mainChoices, exploreChoices, history, nodes, onNavigate, onExplore }: Props) {
  const sortedMain = [...mainChoices].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  useChoiceHotkeys(sortedMain, onNavigate)

  return (
    <div className="border-t border-[var(--pv-line)] bg-[var(--pv-panel)]/80 backdrop-blur-sm px-6 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {sortedMain.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest mb-3 text-center text-[var(--pv-dim)]">你的选择</p>
            <div className="space-y-2">
              {sortedMain.map((choice, i) => (
                <ChoiceButton
                  key={choice.id}
                  choice={choice}
                  index={i}
                  history={history}
                  nodes={nodes}
                  onClick={() => onNavigate(choice.targetNodeId, choice.variableEffects)}
                />
              ))}
            </div>
          </div>
        )}

        {exploreChoices.length > 0 && (
          <div className="border-t border-[var(--pv-line)] pt-3">
            <p className="text-[10px] uppercase tracking-widest mb-2 text-center text-[var(--pv-dim)]">探索（可选）</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {exploreChoices.map(choice => (
                <button
                  key={choice.id}
                  onClick={() => onExplore(choice.targetNodeId, choice.variableEffects)}
                  className="px-3 py-1.5 bg-[var(--pv-success-soft)] border border-[var(--pv-success)]/30 text-[var(--pv-success)] text-xs rounded-lg hover:bg-[var(--pv-success)]/20 transition-colors cursor-pointer"
                >
                  ◎ {choice.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ChoiceButtonProps {
  choice: Choice
  index: number
  history: string[]
  nodes: StoryNode[]
  onClick: () => void
}

function ChoiceButton({ choice, index, history, nodes, onClick }: ChoiceButtonProps) {
  const isLoop = history.includes(choice.targetNodeId)
  const visitCount = history.filter(id => id === choice.targetNodeId).length
  const targetNode = nodes.find(n => n.id === choice.targetNodeId)
  const leadsToEnding = targetNode?.type === 'ending'
  const isCritical = choice.choiceWeight === 'critical'
  const isHeavy = choice.choiceWeight === 'heavy'

  const tone = leadsToEnding ? 'highlight' : isCritical ? 'danger' : 'neutral'
  const wrapClass = {
    highlight: 'bg-[var(--pv-highlight-soft)] border-[var(--pv-highlight)]/35 hover:border-[var(--pv-highlight)]',
    danger: 'bg-[var(--pv-danger-soft)] border-[var(--pv-danger)]/35 hover:border-[var(--pv-danger)]',
    neutral: 'bg-[var(--pv-panel)] border-[var(--pv-line)] hover:bg-[var(--pv-choice-hover)] hover:border-[var(--pv-accent)]/50',
  }[tone]
  const badgeClass = {
    highlight: 'bg-[var(--pv-highlight)]/15 text-[var(--pv-highlight)] group-hover:bg-[var(--pv-highlight)] group-hover:text-[var(--pv-panel)]',
    danger: 'bg-[var(--pv-danger)]/15 text-[var(--pv-danger)] group-hover:bg-[var(--pv-danger)] group-hover:text-[var(--pv-panel)]',
    neutral: 'bg-[var(--pv-line-soft)] text-[var(--pv-dim)] group-hover:bg-[var(--pv-accent)] group-hover:text-[var(--pv-panel)]',
  }[tone]
  const textClass = {
    highlight: 'text-[var(--pv-highlight)]',
    danger: 'text-[var(--pv-danger)]',
    neutral: 'text-[var(--pv-text-soft)] group-hover:text-[var(--pv-text)]',
  }[tone]

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-4 px-5 py-4 border rounded-xl transition-all duration-200 group text-left relative overflow-hidden cursor-pointer ${wrapClass}`}
    >
      <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors mt-0.5 ${badgeClass}`}>
        {CHOICE_LABELS[index] ?? index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium transition-colors leading-relaxed ${textClass}`}>{choice.text}</div>
        {leadsToEnding && <div className="text-xs mt-0.5 text-[var(--pv-highlight)]">→ 故事终局</div>}
        {isCritical && <div className="text-xs mt-0.5 text-[var(--pv-danger)]">⚡ 关键抉择 · 不可撤回</div>}
        {isHeavy && !isCritical && <div className="text-xs mt-0.5 text-[var(--pv-highlight)]">此选择将影响后续剧情</div>}
        {isLoop && <div className="text-xs italic mt-0.5 text-[var(--pv-dim)]">↩ 回到之前的节点</div>}
        {visitCount >= 3 && <div className="text-xs mt-0.5 text-[var(--pv-highlight)]">已探索 {visitCount} 次</div>}
      </div>
      {choice.variableEffects && (
        <div className="shrink-0 text-xs font-mono mt-0.5 text-[var(--pv-success)]">{choice.variableEffects}</div>
      )}
    </button>
  )
}
