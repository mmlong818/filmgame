'use client'
// 选项条件的最小编辑器（期 3.1）：原文串文本框 + 「变量 / 比较符 / 值」快捷追加一条比较式。
// 不做全表达式可视化——&& / || / 括号仍在文本框里手写，经 store 的 bind 闸口解析绑定。
import { useState } from 'react'
import type { Variable } from '@/lib/types/project'
import type { CompareOp } from '@/lib/refs/types'
import { BufferedInput } from '../../world/ai-widgets'

const OPS: CompareOp[] = ['>=', '<=', '>', '<', '==', '!=']

interface Props {
  conditions: string
  variables: Variable[]
  onCommit: (conditions: string) => void
}

export function ConditionEditor({ conditions, variables, onCommit }: Props) {
  const [varName, setVarName] = useState(variables[0]?.name ?? '')
  const [op, setOp] = useState<CompareOp>('>=')
  const [value, setValue] = useState('1')
  const selectClass = 'text-[10px] border border-line bg-paper text-ink px-1 py-0.5 cursor-pointer'

  function append() {
    const name = varName || variables[0]?.name
    if (!name || value.trim() === '') return
    const expr = `${name} ${op} ${value.trim()}`
    onCommit(conditions.trim() ? `${conditions.trim()} && ${expr}` : expr)
  }

  return (
    <div className="mt-1.5 space-y-1">
      <BufferedInput
        value={conditions}
        onCommit={onCommit}
        placeholder="显示条件，如 trust >= 3 && flag == 1（空 = 无条件）"
        className="text-[11px] font-mono"
      />
      {variables.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <select value={varName} onChange={e => setVarName(e.target.value)} className={selectClass} aria-label="变量">
            {variables.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
          <select value={op} onChange={e => setOp(e.target.value as CompareOp)} className={selectClass} aria-label="比较符">
            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); append() } }}
            className="text-[10px] border border-line bg-paper text-ink px-1 py-0.5 w-14"
            aria-label="值"
          />
          <button type="button" onClick={append} className="text-[10px] px-1.5 py-0.5 border border-line text-pencil hover:border-inkblue hover:text-inkblue cursor-pointer">
            + 加条件
          </button>
        </div>
      )}
    </div>
  )
}
