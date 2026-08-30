'use client'
import { Button } from '@/app/components/ui/button'
import { Tag } from '@/app/components/ui/tag'
import { inputClass } from '@/app/components/ui/input'
import { PulseDot } from './widgets'

export type BulkScope = 'all' | 'chapter' | 'act'

export interface FailedNodeInfo {
  id: string
  title: string
}

interface ScopeBarProps {
  scope: BulkScope
  onScopeChange: (s: BulkScope) => void
  scopeDisabled: boolean
  scopeFallback: boolean
  nodeCount: number
  bulkLoading: boolean
  onStart: () => void
  onCancel: () => void
}

// 批量 AI 范围选择 + 耗时估算：按钮旁的范围下拉 + 实时预计耗时文案，
// 让用户在点击"开始"之前就看到影响范围和量级估算。
export function BulkAiScopeBar({ scope, onScopeChange, scopeDisabled, scopeFallback, nodeCount, bulkLoading, onStart, onCancel }: ScopeBarProps) {
  const estimateMin = nodeCount > 0 ? Math.max(1, Math.round(nodeCount * 90 / 60)) : 0
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        size="sm"
        onClick={bulkLoading ? onCancel : onStart}
        disabled={!bulkLoading && nodeCount === 0}
      >
        {bulkLoading && <PulseDot />}
        {bulkLoading ? '中止批量 AI' : '批量 AI 设计'}
      </Button>
      <select
        aria-label="批量范围"
        value={scope}
        onChange={e => onScopeChange(e.target.value as BulkScope)}
        disabled={bulkLoading}
        className={`${inputClass} text-xs px-2 py-1.5 w-auto disabled:opacity-40`}
      >
        <option value="all">全部节点</option>
        <option value="chapter" disabled={scopeDisabled}>当前章</option>
        <option value="act" disabled={scopeDisabled}>当前幕</option>
      </select>
      <span className="text-xs text-pencil">
        {nodeCount} 个节点 · 预计约 {estimateMin} 分钟（按每节点约 90 秒估算，仅供参考，实际因内容量波动）
        {scopeFallback && '（未选中节点，暂按全部节点处理）'}
      </span>
    </div>
  )
}

interface FailureReportProps {
  nodes: FailedNodeInfo[]
  retrying: boolean
  onRetry: () => void
  onDismiss: () => void
}

// 批量结束后的失败清单：列出失败节点名 + 一键只重跑失败项。
export function BulkFailureReport({ nodes, retrying, onRetry, onDismiss }: FailureReportProps) {
  if (nodes.length === 0) return null
  return (
    <div className="flex-shrink-0 px-6 py-2.5 border-b border-vermilion/30 bg-paper flex items-center gap-3">
      <span className="text-xs text-vermilion font-medium shrink-0">{nodes.length} 个节点生成失败：</span>
      <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
        {nodes.map(n => (
          <Tag key={n.id} tone="vermilion">{n.title || '（无标题）'}</Tag>
        ))}
      </div>
      <Button
        size="sm"
        variant="danger"
        onClick={onRetry}
        disabled={retrying}
        loading={retrying}
        className="shrink-0"
      >
        重试失败项
      </Button>
      <button type="button" onClick={onDismiss} className="cursor-pointer text-xs text-pencil hover:text-vermilion shrink-0">✕</button>
    </div>
  )
}
