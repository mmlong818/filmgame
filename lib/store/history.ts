// 撤销/重做：项目快照栈。
// 只在破坏性/批量覆盖动作前压栈（projectStore 内调用 pushUndo），
// 高频输入不产生快照（NFR-1）。恢复走 projectStore 注册的 restore 回调，
// 复用整档保存管线（乐观锁 version 基线保持服务端确认值，不随快照回退）。
//
// 高频输入不设检查点意味着「删节点 → 改了别处一句对白 → 点 toast 撤销」会把那句对白
// 一起吞掉。因此每条记录还带「动作后」快照：撤销时只把动作真正触碰的条目退回动作前，
// 其余条目保留当前值（revertTouched）。
import { create } from 'zustand'
import { PROJECT_ID_ARRAY_KEYS } from '@/lib/types/project'
import type { Project } from '@/lib/types/project'

interface HistoryEntry {
  label: string
  /** 动作前 */
  snapshot: Project
  /** 动作后（由 projectStore 订阅在动作落地后的第一次变更时补上） */
  after?: Project
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

/** 栈顶记录若还没有「动作后」快照，把这次变更结果记上（只记第一次，之后的都是后续编辑） */
export function recordAfterState(project: Project) {
  const { undoStack } = useHistoryStore.getState()
  const top = undoStack[undoStack.length - 1]
  if (!top || top.after || top.snapshot.id !== project.id) return
  useHistoryStore.setState({ undoStack: [...undoStack.slice(0, -1), { ...top, after: structuredClone(project) }] })
}

const REVERT_SKIP_KEYS = new Set<string>(['id', 'createdAt', 'updatedAt', 'schemaVersion'])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** 精确撤销：动作触碰过的字段/条目（before≠after）回到 before，其余保留 current。 */
export function revertTouched(before: Project, after: Project, current: Project): Project {
  const out = { ...current } as unknown as Record<string, unknown>
  const idKeys = new Set<string>(PROJECT_ID_ARRAY_KEYS)
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (REVERT_SKIP_KEYS.has(key) || idKeys.has(key)) continue
    const b = (before as unknown as Record<string, unknown>)[key]
    if (!same(b, (after as unknown as Record<string, unknown>)[key])) out[key] = b
  }
  for (const key of PROJECT_ID_ARRAY_KEYS) {
    const byId = (xs: { id: string }[] | undefined) => new Map((xs ?? []).map(x => [x.id, x]))
    const b = byId(before[key]), a = byId(after[key]), c = byId(current[key])
    const touched = (id: string) => !same(b.get(id), a.get(id))
    // 顺序以 before 为主干（动作删掉的条目回到原位），current 里新增的追加在后
    const result = [
      ...(before[key] ?? []).filter(x => touched(x.id) || c.has(x.id)).map(x => touched(x.id) ? x : c.get(x.id)!),
      ...(current[key] ?? []).filter(x => !b.has(x.id) && !touched(x.id)),
    ]
    out[key] = result
  }
  return out as unknown as Project
}

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
  // 动作之后又有编辑 → 只回退动作触碰的部分；否则整档回到动作前
  const target = entry.after && !same(entry.after, current) ? revertTouched(entry.snapshot, entry.after, current) : entry.snapshot
  restoring = true
  try { binding.restore(target) } finally { restoring = false }
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
