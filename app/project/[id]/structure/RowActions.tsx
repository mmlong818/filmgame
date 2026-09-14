'use client'
// 结构树三级（章 / 幕 / 节点）行尾统一的「上移 / 下移 / 删除」工具条。
// 用按钮而非拖拽：不引第三方 dnd 依赖，键盘天然可达（NFR-5 a11y 基线）。
import { Button } from '@/app/components/ui/button'
import { ConfirmButton } from '@/app/components/ui/confirm'

interface Props {
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  /** 两步确认的文案：带对象名与级联数量 */
  confirmLabel: string
  onDelete: () => void
}

export function RowActions({ canUp, canDown, onUp, onDown, confirmLabel, onDelete }: Props) {
  return (
    // 阻止冒泡：章/幕的整行是折叠开关，工具条点击不应触发展开/收起
    <span className="ml-auto flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="ghost" disabled={!canUp} onClick={onUp} aria-label="上移" className="px-1.5">▲</Button>
      <Button size="sm" variant="ghost" disabled={!canDown} onClick={onDown} aria-label="下移" className="px-1.5">▼</Button>
      <ConfirmButton size="sm" variant="danger" confirmLabel={confirmLabel} onConfirm={onDelete}>✕</ConfirmButton>
    </span>
  )
}
