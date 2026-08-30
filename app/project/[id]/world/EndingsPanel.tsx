'use client'
import { Tag } from '@/app/components/ui/tag'
import type { EndingDesign } from '@/lib/types/project'

const ENDING_TYPE: Record<string, { label: string; tone: 'leaf' | 'vermilion' | 'pencil' | 'inkblue' }> = {
  good: { label: '好结局', tone: 'leaf' },
  bad: { label: '坏结局', tone: 'vermilion' },
  neutral: { label: '中立', tone: 'pencil' },
  secret: { label: '隐藏', tone: 'inkblue' },
}

/** 已定的结局线（核心产出：将作为故事结构阶段的目标节点） */
export function EndingsPanel({ endings }: { endings: EndingDesign[] }) {
  if (endings.length === 0) return null
  return (
    <div className="space-y-1.5">
      {endings.map((e, i) => {
        const t = ENDING_TYPE[e.type] ?? { label: e.type, tone: 'pencil' as const }
        return (
          <div key={e.id ?? i} className="bg-paper-dim border border-line-soft px-3.5 py-2.5">
            <div className="flex items-baseline gap-2.5">
              <Tag tone={t.tone}>{t.label}</Tag>
              <span className="text-[13px] font-medium text-ink">{e.title}</span>
              {e.keyVariable && <span className="ml-auto text-[11px] font-mono text-inkblue">{e.keyVariable}</span>}
            </div>
            <p className="text-xs text-ink-soft leading-relaxed mt-1.5">{e.description}</p>
            <div className="text-[11px] text-pencil mt-1">
              触发：{e.triggerCondition}
              {e.avoidCondition && <span className="ml-3">偏离：{e.avoidCondition}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
