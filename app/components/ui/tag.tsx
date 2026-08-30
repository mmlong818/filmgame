import type { NodeType } from '@/lib/types/project'
import { nodeTypeStyle } from '@/lib/ui/nodeTypes'

/** 通用标签 */
export function Tag({
  tone = 'pencil',
  className = '',
  children,
}: {
  tone?: 'pencil' | 'vermilion' | 'inkblue' | 'leaf' | 'amberink'
  className?: string
  children: React.ReactNode
}) {
  const map = {
    pencil: 'text-pencil border-pencil/50',
    vermilion: 'text-vermilion border-vermilion/50',
    inkblue: 'text-inkblue border-inkblue/50',
    leaf: 'text-leaf border-leaf/50',
    amberink: 'text-amberink border-amberink/50',
  }
  return (
    <span className={`inline-block border px-1.5 py-px text-[10.5px] tracking-wider ${map[tone]} ${className}`}>
      {children}
    </span>
  )
}

/** 节点类型徽标：全站唯一样式来源（lib/ui/nodeTypes） */
export function NodeTypeBadge({ type, className = '' }: { type: NodeType; className?: string }) {
  const s = nodeTypeStyle(type)
  return (
    <span className={`inline-block border px-1.5 py-px text-[10.5px] tracking-wider ${s.text} ${s.border} ${s.bg} ${className}`}>
      {s.label}
    </span>
  )
}
