'use client'
import type { StoryNode } from '@/lib/types/project'

export const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white'

export const NODE_TYPE_LABEL: Record<string, string> = {
  start:   '开场节点 · 故事起点',
  ending:  '结局节点 · 故事终点',
  branch:  '分支节点 · 玩家做出选择',
  merge:   '汇聚节点 · 多线收束',
  normal:  '推进节点 · 情节推进',
  explore: '探索节点 · 可选旁支内容',
}

export const NODE_TYPE_STYLE: Record<string, {
  icon: string; label: string
  badgeBg: string; badgeText: string; badgeBorder: string
  sidebarText: string; sidebarIcon: string
}> = {
  start:   { icon: '▶', label: '开场', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', badgeBorder: 'border-emerald-200', sidebarText: 'text-emerald-600', sidebarIcon: '▶' },
  ending:  { icon: '★', label: '结局', badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700',   badgeBorder: 'border-amber-200',   sidebarText: 'text-amber-600',   sidebarIcon: '★' },
  branch:  { icon: '◆', label: '分支', badgeBg: 'bg-violet-50',  badgeText: 'text-violet-700',  badgeBorder: 'border-violet-200',  sidebarText: 'text-violet-600',  sidebarIcon: '◆' },
  merge:   { icon: '◀', label: '汇聚', badgeBg: 'bg-rose-50',    badgeText: 'text-rose-700',    badgeBorder: 'border-rose-200',    sidebarText: 'text-rose-600',    sidebarIcon: '◀' },
  normal:  { icon: '·', label: '推进', badgeBg: 'bg-zinc-50',    badgeText: 'text-zinc-600',    badgeBorder: 'border-zinc-200',    sidebarText: 'text-zinc-400',    sidebarIcon: '·' },
  explore: { icon: '◎', label: '探索', badgeBg: 'bg-teal-50',    badgeText: 'text-teal-700',    badgeBorder: 'border-teal-200',    sidebarText: 'text-teal-500',    sidebarIcon: '◎' },
}

export function nodeCompleteness(node: StoryNode): number {
  let score = 0
  if (node.sceneDesc && node.sceneDesc.length > 20) score++
  if ((node.dialogue ?? []).length >= 3) score++
  if (node.emotionFunction?.tension > 0) score++
  if ((node.choices ?? []).length > 0 || node.type === 'ending') score++
  return score
}

export function speakerColor(name: string): string {
  const colors = ['text-amber-600', 'text-blue-600', 'text-purple-600', 'text-green-700', 'text-rose-600', 'text-teal-600']
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

export function NodeTypeBadge({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const s = NODE_TYPE_STYLE[type] ?? NODE_TYPE_STYLE.normal
  if (size === 'md') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.badgeBg} ${s.badgeText} ${s.badgeBorder}`}>
        <span className="text-[10px]">{s.icon}</span>
        {s.label}
      </span>
    )
  }
  return (
    <span className={`text-[11px] font-bold shrink-0 w-5 text-center ${s.sidebarText}`}>{s.sidebarIcon}</span>
  )
}

export function DurationBar({ nodes, target }: { nodes: StoryNode[]; target: number }) {
  const estimated = Math.round(nodes.reduce((s, n) => s + n.dialogue.length * 18, 0) / 60)
  const ratio = target > 0 ? Math.min(estimated / target, 1.5) : 0
  const pct = Math.min(ratio / 1.5 * 100, 100)
  const isOver = estimated > target * 1.2
  const isUnder = estimated < target * 0.5
  const barColor = isOver || isUnder ? 'bg-red-400' : estimated < target * 0.8 ? 'bg-amber-400' : 'bg-green-400'
  const textColor = isOver ? 'text-red-500' : isUnder ? 'text-red-400' : 'text-gray-400'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">预计时长</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {estimated} / {target} 分钟
          {isOver && ' ⚠ 超长'}{isUnder && estimated === 0 && ' · 待填充'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function CompletionBar({ nodes }: { nodes: StoryNode[] }) {
  const total = nodes.length
  if (total === 0) return null
  const done = nodes.filter(n => nodeCompleteness(n) === 4).length
  const pct = Math.round((done / total) * 100)
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">已填充 {done}/{total} 节点 ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Completenessbadge({ score }: { score: number }) {
  const colorClass = score === 4
    ? 'bg-green-100 text-green-700'
    : score >= 2
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-600'
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${colorClass}`}>
      {score}/4
    </span>
  )
}

export function SceneDescHint({ n }: { n: number }) {
  if (n === 0) return null
  if (n < 60) return <p className="text-gray-400 text-xs mt-1">建议 60+ 字以呈现镜头感</p>
  if (n <= 120) return <p className="text-green-500 text-xs mt-1">✓ {n} 字</p>
  return <p className="text-green-600 text-xs mt-1">✓ {n} 字 · 场景感充足</p>
}

export function Section({ title, action, children }: {
  title: string
  action?: { label: string; loading: boolean; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.loading}
            className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
          >
            {action.loading && <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function BulkProgressOverlay({
  progress,
  onCancel,
}: {
  progress: { done: number; total: number; phase: 'generate' | 'refine' }
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <div className="text-sm font-medium text-gray-700 mb-1">
          {progress.phase === 'generate' ? '第一轮：生成内容' : '第二轮：精修对白'}
        </div>
        <div className="text-xs text-gray-400 mb-4">{progress.done} / {progress.total} 个节点</div>
        <div className="w-64 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      </div>
      <button
        onClick={onCancel}
        className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded-lg px-4 py-1.5 transition-colors"
      >
        取消
      </button>
    </div>
  )
}
