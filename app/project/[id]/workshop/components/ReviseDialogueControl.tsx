'use client'
import { useState } from 'react'
import { inputClass } from '@/app/components/ui/input'
import { PulseDot } from './widgets'

interface Props {
  loading: boolean
  onSubmit: (instruction: string) => void
  onCancel: () => void
}

// 单节点"AI 修改对白"入口：一句话指令输入 + 确认/取消，不堆砌整套 modal。
// 提交后由调用方走 revise_dialogue，结果复用现有 nodeDrafts 预览/采纳流程。
export function ReviseDialogueControl({ loading, onSubmit, onCancel }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function submit() {
    const v = text.trim()
    if (!v) return
    onSubmit(v)
    setOpen(false)
    setText('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={loading ? onCancel : () => setOpen(true)}
        className="cursor-pointer text-xs text-inkblue hover:text-vermilion border border-inkblue/40 px-2.5 py-1 flex items-center gap-1.5"
      >
        {loading && <PulseDot />}
        {loading ? '中止' : 'AI 修改对白'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 w-full">
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setText('') }
        }}
        placeholder="一句话说明怎么改，如：更克制、删掉直白的情绪表达"
        className={`${inputClass} flex-1 text-xs px-2.5 py-1.5`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim()}
        className="cursor-pointer text-xs bg-ink text-paper px-2.5 py-1.5 disabled:opacity-40 hover:bg-ink-soft shrink-0"
      >
        确认
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setText('') }}
        className="cursor-pointer text-xs text-pencil hover:text-vermilion px-1.5 py-1.5 shrink-0"
      >
        取消
      </button>
    </div>
  )
}
