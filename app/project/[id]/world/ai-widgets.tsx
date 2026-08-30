'use client'
// 世界锚点页共用的小部件：高频输入缓冲 + 统一的 AI 动作触发反馈（按钮/中止/失败纸条）。
import type { InputHTMLAttributes } from 'react'
import { useBufferedField } from '@/lib/hooks/useBufferedField'
import { Input } from '@/app/components/ui/input'
import { Button, type ButtonProps } from '@/app/components/ui/button'
import type { AiActionState } from '@/lib/hooks/useAiAction'

type BufferedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string
  onCommit: (v: string) => void
}

/** 高频文本输入的本地缓冲版：打字不直接写 store，blur/防抖后才提交（NFR-1） */
export function BufferedInput({ value, onCommit, ...rest }: BufferedInputProps) {
  const { value: local, onChange, onBlur } = useBufferedField(value, onCommit)
  return <Input value={local} onChange={e => onChange(e.target.value)} onBlur={onBlur} {...rest} />
}

/** AI 失败的内联纸条：朱批边线 + formatAiError 引导文案 + 重试 */
export function AiErrorNote({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="bg-paper border-l-[3px] border-vermilion px-3 py-2 text-[12.5px] text-ink-soft flex items-start gap-3">
      <span className="flex-1 leading-relaxed">{error}</span>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer shrink-0 text-vermilion underline underline-offset-2 hover:text-vermilion-deep"
      >
        重试
      </button>
    </div>
  )
}

/** 统一的 AI 动作触发器：按钮 + 运行中「中止」+ 失败纸条。6 个 AI 动作共用同一套可见反馈。 */
export function AiTrigger({
  ai, label, onRun, disabled, variant = 'secondary', size = 'md', className = '',
}: {
  ai: AiActionState
  label: string
  onRun: () => void
  disabled?: boolean
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}) {
  const isLoading = ai.loading !== null
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Button variant={variant} size={size} loading={isLoading} disabled={disabled} onClick={onRun}>
          {label}
        </Button>
        {isLoading && (
          <button
            type="button"
            onClick={ai.cancel}
            className="cursor-pointer text-xs text-pencil hover:text-vermilion underline underline-offset-2"
          >
            中止
          </button>
        )}
      </div>
      {ai.error && <AiErrorNote error={ai.error} onRetry={ai.retry} />}
    </div>
  )
}
