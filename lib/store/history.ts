// 撤销/重做：项目快照栈。
// 只在破坏性/批量覆盖动作前压栈（projectStore 内调用 pushUndo），
// 高频输入不产生快照（NFR-1）。恢复走 projectStore 注册的 restore 回调，
// 复用整档保存管线（乐观锁 version 基线保持服务端确认值，不随快照回退）。
import { create } from 'zustand'
import type { Project } from '@/lib/types/project'

interface HistoryEntry {
  label: string
  snapshot: Project
}

interface HistoryState {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
}

export const useHistoryStore = create<HistoryState>(() => ({
  undoStack: [],
  redoStack: [],
}))

const LIMIT = 30

interface HistoryBinding {
  getProject: () => Project | null
  restore: (p: Project) => void
}

let binding: HistoryBinding | null = null

// undo/redo 恢复本身也会触发 projectStore 的 set；projectStore 用此标志区分
// 「恢复引起的变更」与「用户新编辑」——后者必须使 redo 栈失效（见 projectStore 底部订阅）。
let restoring = false
export function isRestoring() { return restoring }

/** 用户在撤销之后又做了新编辑：重做快照已过期，继续重做会静默覆盖新编辑，必须整栈丢弃 */
export function invalidateRedo() {
  if (useHistoryStore.getState().redoStack.length === 0) return
  useHistoryStore.setState({ redoStack: [] })
}

/** projectStore 模块初始化时注册，避免循环依赖 */
export function bindHistory(b: HistoryBinding) {
  binding = b
}

/** 在破坏性动作执行前调用：把当前项目压入撤销栈并清空重做栈 */
export function pushUndo(label: string, project: Project) {
  const snapshot = structuredClone(project)
  useHistoryStore.setState((s) => ({
    undoStack: [...s.undoStack.slice(-(LIMIT - 1)), { label, snapshot }],
    redoStack: [],
  }))
}

/** 切换/关闭项目时清空历史，避免跨项目误恢复 */
export function clearHistory() {
  useHistoryStore.setState({ undoStack: [], redoStack: [] })
}

export function canUndo() { return useHistoryStore.getState().undoStack.length > 0 }
export function canRedo() { return useHistoryStore.getState().redoStack.length > 0 }

/** @returns 被撤销的动作名，无可撤销时返回 null */
export function undo(): string | null {
  if (!binding) return null
  const { undoStack, redoStack } = useHistoryStore.getState()
  const entry = undoStack[undoStack.length - 1]
  const current = binding.getProject()
  if (!entry || !current || current.id !== entry.snapshot.id) return null
  useHistoryStore.setState({
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack.slice(-(LIMIT - 1)), { label: entry.label, snapshot: structuredClone(current) }],
  })
  restoring = true
  try { binding.restore(entry.snapshot) } finally { restoring = false }
  return entry.label
}

/** @returns 被重做的动作名，无可重做时返回 null */
export function redo(): string | null {
  if (!binding) return null
  const { undoStack, redoStack } = useHistoryStore.getState()
  const entry = redoStack[redoStack.length - 1]
  const current = binding.getProject()
  if (!entry || !current || current.id !== entry.snapshot.id) return null
  useHistoryStore.setState({
    redoStack: redoStack.slice(0, -1),
    undoStack: [...undoStack.slice(-(LIMIT - 1)), { label: entry.label, snapshot: structuredClone(current) }],
  })
  restoring = true
  try { binding.restore(entry.snapshot) } finally { restoring = false }
  return entry.label
}
