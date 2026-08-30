'use client'
/** 索引卡：节点/项目等列表项的统一容器（素纸风：发丝线 + 当前项朱红左条，无图钉） */
export function IndexCard({
  pinned: _pinned = true,
  current = false,
  onClick,
  className = '',
  children,
}: {
  /** 已废弃：图钉装饰已退役，参数保留仅为兼容 */
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
      className={`relative bg-paper border border-line-soft px-3 py-2 ${
        current ? 'border-l-2 border-l-vermilion' : ''
      } ${interactive ? 'cursor-pointer hover:bg-paper-dim' : ''} ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </div>
  )
}
