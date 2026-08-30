/**
 * 辅助区：页面右侧的 AI 协作 / 说明 / 设计原则栏。
 * 信息架构约定——主栏只放核心产出（会进入最终剧本数据的内容），
 * 一切 AI 动作与产物、区块级说明、目标与原则都收进本栏。
 * 宽屏吸顶独立滚动，窄屏自动落到主栏下方。
 */
export function AssistRail({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <aside
      aria-label="辅助区"
      className={`w-full lg:w-80 shrink-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto ${className}`}
    >
      {children}
    </aside>
  )
}

/** 辅助区分节：小字距标题 + 内容 */
export function AssistSection({ title, children, className = '' }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <h3 className="text-[11px] tracking-[0.25em] text-pencil mb-2">{title}</h3>
      {children}
    </section>
  )
}
