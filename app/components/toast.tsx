'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

type ToastType = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; type: ToastType }
interface ToastCtx { toast: (message: string, type?: ToastType) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })
export function useToast() { return useContext(Ctx) }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current
    setItems(t => [...t, { id, message, type }])
    setTimeout(() => setItems(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  const bg: Record<ToastType, string> = {
    success: 'bg-gray-900',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex flex-col items-center gap-2 z-50 pointer-events-none">
          {items.map(t => (
            <div
              key={t.id}
              className={`${bg[t.type]} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}
