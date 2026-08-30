'use client'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { NodeType, StoryNode } from '@/lib/types/project'
import { useBufferedField } from '@/lib/hooks/useBufferedField'

export { inputClass } from '@/app/components/ui/input'

/** 进行中指示点：复用 globals.css 的 pulse-dot 关键帧，避免依赖 Button 的 Spinner
 * （Spinner 自带边框色类，作为子元素 className 追加颜色会被 Tailwind 生成顺序打架，
 * 在「点击中的按钮变中止」这类不禁用自身的场景里颜色不可控——这里改用纯色圆点）。 */
export function PulseDot({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-1.5 h-1.5 rounded-full bg-current ${className}`}
      style={{ animation: 'pulse-dot 1s ease-in-out infinite' }}
    />
  )
}

/** 节点类型的补充说明（标签/配色只从 lib/ui/nodeTypes.ts 或 NodeTypeBadge 取，这里只是上下文提示语） */
export const NODE_TYPE_HINT: Record<NodeType, string> = {
  start: '故事起点',
  ending: '故事终点',
  branch: '玩家做出选择',
  merge: '多线收束',
  normal: '情节推进',
  explore: '可选旁支内容',
}

export function nodeCompleteness(node: StoryNode): number {
  let score = 0
  if (node.sceneDesc && node.sceneDesc.length > 20) score++
  if ((node.dialogue ?? []).length >= 3) score++
  if (node.emotionFunction?.tension > 0) score++
  if ((node.choices ?? []).length > 0 || node.type === 'ending') score++
  return score
}

const SPEAKER_COLORS = ['text-vermilion', 'text-inkblue', 'text-leaf', 'text-amberink']

export function speakerColor(name: string): string {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length]
}

export function DurationBar({ nodes, target }: { nodes: StoryNode[]; target: number }) {
  const estimated = Math.round(nodes.reduce((s, n) => s + n.dialogue.length * 18, 0) / 60)
  const ratio = target > 0 ? Math.min(estimated / target, 1.5) : 0
  const pct = Math.min(ratio / 1.5 * 100, 100)
  const isOver = estimated > target * 1.2
  const isUnder = estimated < target * 0.5
  const barColor = isOver || isUnder ? 'bg-vermilion' : estimated < target * 0.8 ? 'bg-amberink' : 'bg-leaf'
  const textColor = isOver ? 'text-vermilion' : isUnder ? 'text-vermilion/80' : 'text-pencil'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-pencil">预计时长</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {estimated} / {target} 分钟
          {isOver && ' ⚠ 超长'}{isUnder && estimated === 0 && ' · 待填充'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-line-soft overflow-hidden">
        <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
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
        <span className="text-xs text-pencil">已填充 {done}/{total} 节点 ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-line-soft overflow-hidden">
        <div
          className={`h-full transition-all ${pct === 100 ? 'bg-leaf' : pct >= 50 ? 'bg-amberink' : 'bg-vermilion/70'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Completenessbadge({ score }: { score: number }) {
  const cls = score === 4
    ? 'bg-leaf/10 text-leaf'
    : score >= 2
    ? 'bg-amberink/10 text-amberink'
    : 'bg-vermilion/10 text-vermilion'
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 flex-shrink-0 ${cls}`}>
      {score}/4
    </span>
  )
}

export function SceneDescHint({ n }: { n: number }) {
  if (n === 0) return null
  if (n < 60) return <p className="text-pencil text-xs mt-1">建议 60+ 字以呈现镜头感</p>
  if (n <= 120) return <p className="text-leaf text-xs mt-1">✓ {n} 字</p>
  return <p className="text-leaf text-xs mt-1">✓ {n} 字 · 场景感充足</p>
}

interface SectionAction {
  label: string
  loading: boolean
  onClick: () => void
  /** 提供后，loading 期间按钮变为「中止」，点击调用它而不是 onClick */
  onCancel?: () => void
}

export function Section({ title, action, children }: {
  title: string
  action?: SectionAction
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {action && (
          <button
            type="button"
            onClick={action.loading && action.onCancel ? action.onCancel : action.onClick}
            disabled={action.loading && !action.onCancel}
            className="cursor-pointer text-xs text-inkblue hover:text-vermilion disabled:opacity-40 flex items-center gap-1.5"
          >
            {action.loading && <PulseDot />}
            {action.loading && action.onCancel ? '中止' : action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

const TONE_CLASS = {
  pencil: 'text-pencil border-pencil/40 hover:bg-pencil/10',
  vermilion: 'text-vermilion border-vermilion/40 hover:bg-vermilion/10',
  inkblue: 'text-inkblue border-inkblue/40 hover:bg-inkblue/10',
  amberink: 'text-amberink border-amberink/40 hover:bg-amberink/10',
} as const

/** 单节点 AI 动作触发按钮：loading 时自身变为「中止」，点击调用 onCancel。 */
export function AiActionButton({
  label,
  loading,
  onRun,
  onCancel,
  tone = 'pencil',
  className = '',
}: {
  label: string
  loading: boolean
  onRun: () => void
  onCancel: () => void
  tone?: keyof typeof TONE_CLASS
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={loading ? onCancel : onRun}
      className={`cursor-pointer text-xs border px-3 py-1.5 inline-flex items-center gap-1.5 ${TONE_CLASS[tone]} ${className}`}
    >
      {loading ? <PulseDot /> : null}
      {loading ? '中止' : label}
    </button>
  )
}

/** AI 动作失败纸条：formatAiError 文案 + 重试 + 关闭。 */
export function AiErrorNote({
  error,
  onRetry,
  onDismiss,
  className = '',
}: {
  error: string
  onRetry: () => void
  onDismiss: () => void
  className?: string
}) {
  return (
    <div
      className={`flex items-start gap-2.5 bg-paper border border-vermilion/40 border-l-[3px] border-l-vermilion px-3 py-2 text-[11.5px] text-ink-soft leading-relaxed ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <span className="flex-1">{error}</span>
      <button type="button" onClick={onRetry} className="cursor-pointer shrink-0 text-inkblue underline underline-offset-2 hover:text-vermilion">重试</button>
      <button type="button" aria-label="关闭" onClick={onDismiss} className="cursor-pointer shrink-0 text-pencil hover:text-vermilion leading-none">×</button>
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
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div className="absolute inset-0 z-50 bg-kraft/70 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
      <div className="paper-sheet px-8 py-6 text-center">
        <div className="text-sm font-medium text-ink mb-1">
          {progress.phase === 'generate' ? '第一轮：生成内容' : '第二轮：精修对白'}
        </div>
        <div className="text-xs text-pencil mb-4">{progress.done} / {progress.total} 个节点</div>
        <div className="w-64 h-[5px] bg-leaf/20">
          <div className="h-full bg-leaf transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="cursor-pointer text-xs text-pencil hover:text-vermilion border border-line hover:border-vermilion/50 bg-paper px-4 py-1.5 transition-colors"
      >
        取消
      </button>
    </div>
  )
}

type BufferedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string
  onCommit: (v: string) => void
  delay?: number
}

// 高频文本输入的本地缓冲版 <input>：打字期间只改本地 state，blur/300ms 防抖才回写 store。
export function BufferedInput({ value, onCommit, delay, ...rest }: BufferedInputProps) {
  const { value: local, onChange, onBlur } = useBufferedField(value, onCommit, delay)
  return (
    <input {...rest} value={local} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
  )
}

type BufferedTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string
  onCommit: (v: string) => void
  delay?: number
}

// 高频文本输入的本地缓冲版 <textarea>，语义同 BufferedInput。
export function BufferedTextarea({ value, onCommit, delay, ...rest }: BufferedTextareaProps) {
  const { value: local, onChange, onBlur } = useBufferedField(value, onCommit, delay)
  return (
    <textarea {...rest} value={local} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
  )
}
