'use client'
// 单次 AI 动作的统一状态机：loading / error / 取消 / 重试。
// 替代各页面手写的 loading state + 被吞掉的 catch。
// 用法：
//   const ai = useAiAction()
//   ai.run('撰写对白', (signal) => aiJson('workshop', 'write_dialogue', ctx, signal).then(apply))
//   ai.cancel() / ai.retry() / ai.loading / ai.error
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAiError, isAbortError } from '@/lib/ai/errors'
import { registerAiTask, unregisterAiTask } from '@/lib/ai/taskStore'

export interface AiActionState {
  /** 正在运行的动作名；null 表示空闲 */
  loading: string | null
  /** 面向用户的错误文案（已含 errorType 引导与 trace） */
  error: string | null
  /** 发起动作。同一 hook 上一个动作未结束时会先取消它。成功返回 fn 的结果，取消/失败返回 null。 */
  run: <T>(label: string, fn: (signal: AbortSignal) => Promise<T>) => Promise<T | null>
  /** 用户主动中止当前动作（不产生错误提示） */
  cancel: () => void
  /** 重试上一次失败的动作 */
  retry: () => void
  clearError: () => void
}

export function useAiAction(): AiActionState {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctlRef = useRef<AbortController | null>(null)
  const taskRef = useRef<string | null>(null)
  const lastRef = useRef<{ label: string; fn: (signal: AbortSignal) => Promise<unknown> } | null>(null)

  const cleanup = useCallback(() => {
    if (taskRef.current) unregisterAiTask(taskRef.current)
    taskRef.current = null
    ctlRef.current = null
  }, [])

  // 组件卸载时中止在飞请求，避免泄漏
  useEffect(() => () => { ctlRef.current?.abort(); if (taskRef.current) unregisterAiTask(taskRef.current) }, [])

  const run = useCallback(async <T,>(label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    ctlRef.current?.abort()
    const ctl = new AbortController()
    ctlRef.current = ctl
    lastRef.current = { label, fn }
    setLoading(label)
    setError(null)
    if (taskRef.current) unregisterAiTask(taskRef.current)
    taskRef.current = registerAiTask(label, () => ctl.abort())
    try {
      const result = await fn(ctl.signal)
      return result
    } catch (e) {
      if (!isAbortError(e)) setError(formatAiError(e))
      return null
    } finally {
      // 只有当前控制器还是自己时才清理（run 可能已被更新的调用接管）
      if (ctlRef.current === ctl) {
        cleanup()
        setLoading(null)
      }
    }
  }, [cleanup])

  const cancel = useCallback(() => {
    ctlRef.current?.abort()
  }, [])

  const retry = useCallback(() => {
    const last = lastRef.current
    if (last && !ctlRef.current) void run(last.label, last.fn)
  }, [run])

  const clearError = useCallback(() => setError(null), [])

  return { loading, error, run, cancel, retry, clearError }
}
