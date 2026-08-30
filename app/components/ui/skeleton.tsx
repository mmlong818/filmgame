/** 骨架屏基元：替代各页手写的「加载中...」文字 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

/** 多行文本骨架 */
export function SkeletonLines({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`} role="status" aria-label="加载中">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** 整页骨架：侧栏 + 正文的通用加载占位 */
export function SkeletonPage() {
  return (
    <div className="flex gap-6 p-6" role="status" aria-label="页面加载中">
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
      </div>
      <div className="flex-1 flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
        <SkeletonLines lines={4} />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}
