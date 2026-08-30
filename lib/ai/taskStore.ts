// 运行中 AI 任务注册表：供顶栏/命令面板展示「谁在跑、跑多久、可中止」。
// 只登记状态，不负责发请求——发起与取消由 useAiAction 管理。
import { create } from 'zustand'

export interface AiTaskEntry {
  id: string
  /** 展示名，如「撰写对白 · 车厢对峙」 */
  label: string
  startedAt: number
  cancel: () => void
}

interface AiTaskState {
  tasks: AiTaskEntry[]
}

export const useAiTaskStore = create<AiTaskState>(() => ({ tasks: [] }))

let counter = 0

export function registerAiTask(label: string, cancel: () => void): string {
  const id = `task-${++counter}`
  useAiTaskStore.setState((s) => ({ tasks: [...s.tasks, { id, label, startedAt: Date.now(), cancel }] }))
  return id
}

export function unregisterAiTask(id: string) {
  useAiTaskStore.setState((s) => ({ tasks: s.tasks.filter(t => t.id !== id) }))
}
