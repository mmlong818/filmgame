'use client'
import Link from 'next/link'
import type { PreviewMode } from './types'

interface Props {
  backHref: string
  nodeTitle: string
  visitedCount: number
  totalNodes: number
  mode: PreviewMode
  setMode: (m: PreviewMode) => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
  onReset: () => void
}

const modeBtnBase = 'px-2 py-0.5 transition-colors cursor-pointer'
const modeBtnActive = 'bg-[var(--pv-accent)] text-[var(--pv-panel)]'
const modeBtnInactive = 'bg-[var(--pv-panel)] text-[var(--pv-dim)] hover:text-[var(--pv-text)]'

export function TopBar({ backHref, nodeTitle, visitedCount, totalNodes, mode, setMode, theme, toggleTheme, onReset }: Props) {
  return (
    <div className="border-b border-[var(--pv-line)] bg-[var(--pv-panel)] px-6 py-2.5 flex items-center gap-4">
      <Link href={backHref} className="text-xs text-[var(--pv-dim)] hover:text-[var(--pv-text)] transition-colors cursor-pointer">
        ← 返回编辑
      </Link>
      <span className="text-[var(--pv-line)]">|</span>
      <span className="text-xs font-medium flex-1 truncate text-[var(--pv-text-soft)]">
        {nodeTitle}
      </span>
      <span className="text-xs text-[var(--pv-dim)]">
        {visitedCount} / {totalNodes} 节点
      </span>
      <div className="flex items-center border border-[var(--pv-line)] rounded overflow-hidden text-[11px]">
        <button
          onClick={() => setMode('author')}
          className={`${modeBtnBase} ${mode === 'author' ? modeBtnActive : modeBtnInactive}`}
          title="编辑预览：显示调试信息"
        >
          编辑
        </button>
        <button
          onClick={() => setMode('player')}
          className={`${modeBtnBase} ${mode === 'player' ? modeBtnActive : modeBtnInactive}`}
          title="玩家视角：隐藏调试，仅叙事"
        >
          玩家
        </button>
      </div>
      <button
        onClick={toggleTheme}
        className="text-xs text-[var(--pv-dim)] hover:text-[var(--pv-text)] transition-colors cursor-pointer"
        title={theme === 'dark' ? '切换到浅色' : '切换到影院模式'}
      >
        {theme === 'dark' ? '☾ 影院' : '☀ 浅色'}
      </button>
      <button onClick={onReset} className="text-xs text-[var(--pv-dim)] hover:text-[var(--pv-text)] transition-colors cursor-pointer">
        重置
      </button>
    </div>
  )
}
