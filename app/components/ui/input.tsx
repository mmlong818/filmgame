'use client'
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** 统一的输入框基类（此前 world 与 workshop 各有一份 inputClass 且不一致） */
export const inputClass =
  'w-full bg-paper border border-line px-3 py-2 text-[13px] text-ink placeholder:text-pencil/70 focus:border-inkblue focus:outline-none'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${inputClass} ${className}`} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`${inputClass} leading-relaxed ${className}`} {...rest} />
  },
)

/** 带标签的字段容器 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-pencil tracking-wide mb-1.5">
        {label}
        {hint && <span className="ml-2 text-pencil/70">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
