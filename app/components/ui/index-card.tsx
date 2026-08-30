'use client'
/** 索引卡：软木板上钉着的卡片，节点/项目等列表项的统一容器 */
export function IndexCard({
  pinned = true,
  current = false,
  onClick,
  className = '',
  children,
}: {
  /** 是否显示图钉 */
  pinned?: boolean
  /** 当前项：红钉 + 朱红描边 */
  current?: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  const interactive = Boolean(onClick)
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`relative bg-paper border px-3 py-2 ${
        current ? 'border-vermilion/50' : 'border-line/70'
      } ${interactive ? 'cursor-pointer hover:bg-paper-dim' : ''} ${className}`}
      style={{ boxShadow: current ? 'var(--shadow-card-lift)' : 'var(--shadow-card)' }}
    >
      {pinned && <span aria-hidden className={`pin ${current ? 'pin-red' : ''}`} />}
      {children}
    </div>
  )
}
