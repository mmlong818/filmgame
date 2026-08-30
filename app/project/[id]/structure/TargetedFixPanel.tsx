'use client'
// 定向重构预览面板（FR-19 B2）：逐 op 展示 AI 补丁，支持勾选采纳后批量应用。
import { useEffect, useState } from 'react'
import type { StoryNode } from '@/lib/types/project'
import type { TargetedFixOp, TargetedFixResult } from '@/lib/ai/targetedFixTypes'
import { previewFixOps, FIX_OP_LABELS } from './targetedFix'
import { Modal } from '@/app/components/ui/modal'
import { Button } from '@/app/components/ui/button'
import { Tag } from '@/app/components/ui/tag'

export function TargetedFixPanel({
  draft,
  nodes,
  onClose,
  onApply,
}: {
  draft: TargetedFixResult | null
  nodes: StoryNode[]
  onClose: () => void
  onApply: (selectedOps: TargetedFixOp[]) => void
}) {
  const previews = draft ? previewFixOps(nodes, draft.ops) : []
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelected(new Set(previews.filter(p => p.valid).map(p => p.index)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function toggle(index: number) {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(index)) n.delete(index)
      else n.add(index)
      return n
    })
  }

  const selectedCount = selected.size

  return (
    <Modal
      open={draft !== null}
      onClose={onClose}
      title="定向重构预览"
      width="lg"
      dismissable={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>放弃</Button>
          <Button
            variant="primary"
            disabled={selectedCount === 0}
            onClick={() => onApply(previews.filter(p => selected.has(p.index)).map(p => p.op))}
          >
            应用所选（{selectedCount}）
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">{draft.summary}</p>
          <div className="space-y-1.5">
            {previews.map(p => (
              <label
                key={p.index}
                className={`flex items-start gap-2.5 bg-paper border border-line p-3 ${p.valid ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <input
                  type="checkbox"
                  className="mt-1 cursor-pointer disabled:cursor-not-allowed"
                  checked={selected.has(p.index)}
                  disabled={!p.valid}
                  onChange={() => toggle(p.index)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag tone={p.valid ? 'inkblue' : 'pencil'}>{FIX_OP_LABELS[p.op.op]}</Tag>
                    <span className="text-sm text-ink">{p.label}</span>
                  </div>
                  <p className="text-xs text-pencil">{p.op.reason}</p>
                  {!p.valid && <p className="text-xs text-vermilion mt-0.5">{p.reason}</p>}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
