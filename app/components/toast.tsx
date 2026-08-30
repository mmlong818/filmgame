'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

type ToastType = 'success' | 'error' | 'info'
interface ToastAction { label: string; onClick: () => void }
interface ToastOptions {
  /** 操作按钮（如「撤销」「重试」） */
  action?: ToastAction
  /** 驻留毫秒数；缺省 success/info 3000，error 6000 */
  duration?: number
}
interface ToastItem { id: number; message: string; type: ToastType; action?: ToastAction }
interface ToastCtx { toast: (message: string, type?: ToastType, options?: ToastOptions) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })
export function useToast() { return useContext(Ctx) }

const MAX_STACK = 4

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success', options?: ToastOptions) => {
    const id = ++counter.current
    setItems(t => [...t.slice(-(MAX_STACK - 1)), { id, message, type, action: options?.action }])
    const duration = options?.duration ?? (type === 'error' ? 6000 : 3000)
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  const accent: Record<ToastType, string> = {
    success: 'border-l-leaf',
    error: 'border-l-vermilion',
    info: 'border-l-inkblue',
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex flex-col items-center gap-2 z-[60] pointer-events-none">
          {items.map(t => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 bg-paper text-ink border border-line border-l-[3px] ${accent[t.type]} text-[13px] px-3.5 py-2.5 max-w-[520px]`}
              style={{ boxShadow: 'var(--shadow-card-lift)' }}
            >
              <span className="leading-snug">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="cursor-pointer shrink-0 text-inkblue underline underline-offset-2 hover:text-vermilion"
                  onClick={() => { t.action?.onClick(); dismiss(t.id) }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="关闭提示"
                className="cursor-pointer shrink-0 text-pencil hover:text-vermilion leading-none"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}
