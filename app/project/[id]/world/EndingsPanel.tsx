'use client'
// 结局线（核心产出：将作为故事结构阶段的目标节点）。
// 此前是纯展示：全应用没有任何手动编辑入口，想改一条标题或触发条件只能整批 AI 重生成
// （真实检查 3.9 确认缺口）。改为可编辑：字段用 blur/防抖提交，避免每个字符都写一条撤销记录。
import type { TextareaHTMLAttributes } from 'react'
import { useBufferedField } from '@/lib/hooks/useBufferedField'
import { Textarea } from '@/app/components/ui/input'
import { ConfirmButton } from '@/app/components/ui/confirm'
import { BufferedInput } from './ai-widgets'
import type { EndingDesign } from '@/lib/types/project'

const ENDING_TYPES: Array<{ value: EndingDesign['type']; label: string }> = [
  { value: 'good', label: '好结局' },
  { value: 'bad', label: '坏结局' },
  { value: 'neutral', label: '中立' },
  { value: 'secret', label: '隐藏' },
]

type BufferedTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string
  onCommit: (v: string) => void
}
function BufferedTextarea({ value, onCommit, ...rest }: BufferedTextareaProps) {
  const { value: local, onChange, onBlur } = useBufferedField(value, onCommit)
  return <Textarea value={local} onChange={e => onChange(e.target.value)} onBlur={onBlur} {...rest} />
}

interface Props {
  endings: EndingDesign[]
  /** 按下标更新一条（AI 产出的结局线可能没有 id，不能按 id 定位） */
  onUpdate: (index: number, patch: Partial<EndingDesign>) => void
  onDelete: (index: number) => void
}

export function EndingsPanel({ endings, onUpdate, onDelete }: Props) {
  if (endings.length === 0) return null
  return (
    <div className="space-y-2">
      {endings.map((e, i) => (
        <div key={e.id ?? i} className="bg-paper-dim border border-line-soft px-3.5 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={e.type}
              onChange={ev => onUpdate(i, { type: ev.target.value as EndingDesign['type'] })}
              className="text-xs bg-paper border border-line px-2 py-1 cursor-pointer"
              aria-label="结局类型"
            >
              {ENDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <BufferedInput value={e.title} onCommit={v => onUpdate(i, { title: v })} placeholder="结局标题" className="flex-1 text-[13px] font-medium" />
            <BufferedInput value={e.keyVariable ?? ''} onCommit={v => onUpdate(i, { keyVariable: v || undefined })} placeholder="关键变量" className="!w-32 text-[11px] font-mono" />
            <ConfirmButton size="sm" variant="danger" confirmLabel={`确认删除结局线「${(e.title || "未命名").slice(0, 8)}」`} onConfirm={() => onDelete(i)}>✕</ConfirmButton>
          </div>
          <BufferedTextarea value={e.description} onCommit={v => onUpdate(i, { description: v })} rows={2} placeholder="结局描述：玩家最后看到的画面与意味" className="text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <BufferedInput value={e.triggerCondition} onCommit={v => onUpdate(i, { triggerCondition: v })} placeholder="触发：怎样的选择会走到这里" className="text-[11px]" />
            <BufferedInput value={e.avoidCondition} onCommit={v => onUpdate(i, { avoidCondition: v })} placeholder="偏离：什么选择会错过它" className="text-[11px]" />
          </div>
        </div>
      ))}
    </div>
  )
}
