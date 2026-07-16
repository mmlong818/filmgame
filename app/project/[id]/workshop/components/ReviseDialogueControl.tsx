'use client'
import { useState } from 'react'

interface Props {
  loading: boolean
  onSubmit: (instruction: string) => void
}

// 单节点"AI 修改对白"入口：一句话指令输入 + 确认/取消，不堆砌整套 modal。
// 提交后由调用方走 revise_dialogue，结果复用现有 nodeDrafts 预览/采纳流程。
export function ReviseDialogueControl({ loading, onSubmit }: Props) {
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
        onClick={() => setOpen(true)}
        disabled={loading}
        className="text-xs text-sky-600 hover:text-sky-700 border border-sky-100 rounded-lg px-2.5 py-1 disabled:opacity-40 flex items-center gap-1.5"
      >
        {loading && <span className="w-2.5 h-2.5 border border-sky-400 border-t-transparent rounded-full animate-spin" />}
        AI 修改对白
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
        className="flex-1 text-xs border border-sky-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || loading}
        className="text-xs bg-sky-600 text-white rounded-lg px-2.5 py-1.5 disabled:opacity-40 hover:bg-sky-700 shrink-0"
      >
        确认
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setText('') }}
        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1.5 shrink-0"
      >
        取消
      </button>
    </div>
  )
}
