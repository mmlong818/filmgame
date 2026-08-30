'use client'
// 世界锚点页统一的区块标题 / 字段容器样式。

export function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">
        {label} {required && <span className="text-vermilion">*</span>}
      </label>
      {hint && <p className="text-xs text-pencil mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

export function SectionHeading({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div>
        <h3 className="text-sm font-semibold text-ink tracking-wide">{title}</h3>
        {hint && <p className="text-xs text-pencil mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
