/**
 * 批注卡：AI 批注 / 进行中任务的统一容器。
 * 素纸风：安静纸底 + 左侧色条点题（朱红=批注，青绿=任务），无倾斜、无重阴影。
 * （历史命名 StickyNote/tilt 保留以兼容既有调用；tilt 已不再产生旋转。）
 */
export function StickyNote({
  title,
  tone = 'yellow',
  tilt: _tilt = 0,
  className = '',
  children,
}: {
  title?: string
  tone?: 'yellow' | 'green'
  /** 已废弃：素纸风不再倾斜，参数保留仅为兼容 */
  tilt?: number
  className?: string
  children: React.ReactNode
}) {
  void _tilt
  const toneCls =
    tone === 'yellow'
      ? 'bg-sticky border-l-vermilion text-ink-soft'
      : 'bg-sticky-green border-l-leaf text-ink-soft'
  return (
    <div
      className={`border border-line-soft border-l-2 px-3.5 py-3 text-[12.5px] leading-relaxed ${toneCls} ${className}`}
      style={{ boxShadow: 'var(--shadow-sticky)' }}
    >
      {title && (
        <div className={`hand text-[13px] tracking-[0.2em] mb-1.5 ${tone === 'yellow' ? 'text-vermilion' : 'text-leaf'}`}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
