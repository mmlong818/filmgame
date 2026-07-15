'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * 高频输入本地缓冲：受控本地 state，300ms 防抖或 blur 时才回写调用方的 commit（如 store 的 updateNode）。
 * 目的：打字期间不触发 store 换新引用，避免依赖 store 的组件（如 NodeTreeSidebar）全量重渲染/重算。
 *
 * 依赖外部 value 变化（如切换到另一节点）时会同步覆盖本地缓冲——但若本地有未提交的改动（dirty），
 * 优先保留本地值，避免 debounce 窗口内被外部旧值覆盖打断用户输入。
 */
export function useBufferedField<T>(value: T, commit: (v: T) => void, delay = 300) {
  const [local, setLocal] = useState(value)
  const localRef = useRef(value)
  const dirtyRef = useRef(false)
  const commitRef = useRef(commit)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  commitRef.current = commit

  useEffect(() => {
    if (!dirtyRef.current) {
      setLocal(value)
      localRef.current = value
    }
  }, [value])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (dirtyRef.current) commitRef.current(localRef.current)
  }, [])

  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (dirtyRef.current) {
      dirtyRef.current = false
      commitRef.current(localRef.current)
    }
  }

  function onChange(v: T) {
    setLocal(v)
    localRef.current = v
    dirtyRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, delay)
  }

  return { value: local, onChange, onBlur: flush }
}
