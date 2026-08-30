/** 便签：AI 批注 / 进行中任务的容器（编剧房间语言里 AI 的固定形态） */
export function StickyNote({
  title,
  tone = 'yellow',
  tilt = 1,
  className = '',
  children,
}: {
  title?: string
  tone?: 'yellow' | 'green'
  /** 轻微旋转角度（度），装饰性元素专用 */
  tilt?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`${tone === 'yellow' ? 'bg-sticky text-[#4a3c14]' : 'bg-sticky-green text-[#2f4a28]'} px-3.5 py-3 text-[12.5px] leading-relaxed ${className}`}
      style={{ boxShadow: 'var(--shadow-sticky)', transform: `rotate(${tilt}deg)` }}
    >
      {title && <div className="hand text-[15px] opacity-70 mb-1.5">{title}</div>}
      {children}
    </div>
  )
}
