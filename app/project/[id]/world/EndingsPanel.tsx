'use client'
import { StickyNote } from '@/app/components/ui/sticky-note'
import type { EndingDesign } from '@/lib/types/project'

const ENDING_TYPE_LABEL: Record<string, string> = { good: '好结局', bad: '坏结局', neutral: '中立', secret: '隐藏' }

/** AI 设计的结局线：每条结局一张便签，将作为故事结构阶段的目标节点（只读展示） */
export function EndingsPanel({ endings }: { endings: EndingDesign[] }) {
  if (endings.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs text-pencil font-medium tracking-wide">已设计的结局线（将作为故事结构的目标节点）</p>
      <div className="flex flex-wrap gap-4 py-1">
        {endings.map((e, i) => (
          <StickyNote key={e.id ?? i} title={ENDING_TYPE_LABEL[e.type] ?? e.type} tilt={i % 2 === 0 ? -1.2 : 1.4} className="w-64">
            <div className="font-medium text-[13px] mb-1">{e.title}</div>
            <p className="mb-1.5">{e.description}</p>
            <div className="text-[11px]"><span className="opacity-70">触发：</span>{e.triggerCondition}</div>
            {e.avoidCondition && <div className="text-[11px] mt-0.5"><span className="opacity-70">偏离：</span>{e.avoidCondition}</div>}
            {e.keyVariable && <div className="text-[11px] font-mono mt-1">{e.keyVariable}</div>}
          </StickyNote>
        ))}
      </div>
    </div>
  )
}
