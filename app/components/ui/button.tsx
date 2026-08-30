'use client'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-paper border border-ink hover:bg-ink-soft disabled:hover:bg-ink',
  secondary: 'bg-paper text-ink border border-line hover:bg-paper-dim',
  danger: 'bg-paper text-vermilion border border-vermilion/60 hover:bg-vermilion/10',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-paper-dim',
  link: 'bg-transparent text-inkblue border border-transparent underline underline-offset-2 px-1 hover:text-vermilion',
}

const SIZE: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-[13px] px-3.5 py-1.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-3 h-3 rounded-full border-[1.5px] border-line border-t-vermilion animate-spin ${className}`}
    />
  )
}
