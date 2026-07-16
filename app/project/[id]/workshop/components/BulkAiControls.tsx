'use client'

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
}

// 批量 AI 范围选择 + 耗时估算：按钮旁的范围下拉 + 实时预计耗时文案，
// 让用户在点击"开始"之前就看到影响范围和量级估算。
export function BulkAiScopeBar({ scope, onScopeChange, scopeDisabled, scopeFallback, nodeCount, bulkLoading, onStart }: ScopeBarProps) {
  const estimateMin = nodeCount > 0 ? Math.max(1, Math.round(nodeCount * 90 / 60)) : 0
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onStart}
        disabled={bulkLoading || nodeCount === 0}
        className="text-sm text-amber-600 hover:text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
      >
        {bulkLoading && <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
        批量 AI 设计
      </button>
      <select
        aria-label="批量范围"
        value={scope}
        onChange={e => onScopeChange(e.target.value as BulkScope)}
        disabled={bulkLoading}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 disabled:opacity-40"
      >
        <option value="all">全部节点</option>
        <option value="chapter" disabled={scopeDisabled}>当前章</option>
        <option value="act" disabled={scopeDisabled}>当前幕</option>
      </select>
      <span className="text-xs text-gray-400">
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
    <div className="flex-shrink-0 px-6 py-2.5 border-b border-red-100 bg-red-50 flex items-center gap-3">
      <span className="text-xs text-red-600 font-medium shrink-0">{nodes.length} 个节点生成失败：</span>
      <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
        {nodes.map(n => (
          <span key={n.id} className="text-xs bg-white border border-red-200 text-red-500 rounded px-1.5 py-0.5">
            {n.title || '（无标题）'}
          </span>
        ))}
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="text-xs bg-red-600 text-white rounded-lg px-2.5 py-1 hover:bg-red-700 disabled:opacity-40 shrink-0 flex items-center gap-1.5"
      >
        {retrying && <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />}
        重试失败项
      </button>
      <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">✕</button>
    </div>
  )
}
