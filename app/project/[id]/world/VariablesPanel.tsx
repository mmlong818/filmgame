'use client'
import { Tag } from '@/app/components/ui/tag'
import { AiTrigger } from './ai-widgets'
import { SectionHeading } from './widgets'
import type { AiActionState } from '@/lib/hooks/useAiAction'
import type { Variable } from '@/lib/types/project'

const VARIABLE_TONE: Record<Variable['type'], 'inkblue' | 'pencil' | 'vermilion' | 'amberink'> = {
  counter: 'inkblue', flag: 'pencil', relationship: 'vermilion', item: 'amberink',
}

export function VariablesPanel({ variables, ai, onSuggest, disabled }: {
  variables: Variable[]
  ai: AiActionState
  onSuggest: () => void
  disabled: boolean
}) {
  return (
    <div>
      <SectionHeading
        title="叙事变量"
        hint="追踪玩家选择积累的数值，用于终章解锁不同结局路线"
        action={<AiTrigger ai={ai} label="AI 建议变量" onRun={onSuggest} disabled={disabled} size="sm" variant="ghost" />}
      />
      {variables.length === 0 ? (
        <p className="text-xs text-pencil italic">先设计结局线，再点击「AI 建议变量」自动提取需要追踪的变量</p>
      ) : (
        <div className="space-y-1.5">
          {variables.map(v => (
            <div key={v.id} className="flex items-center gap-2 bg-paper-dim border border-line-soft px-3 py-2">
              <span className="text-xs font-mono text-inkblue w-32 shrink-0 truncate">{v.name}</span>
              <Tag tone={VARIABLE_TONE[v.type]}>{v.type}</Tag>
              <span className="text-xs text-pencil truncate">{v.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
