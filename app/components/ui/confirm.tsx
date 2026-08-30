'use client'
import { useEffect, useRef, useState } from 'react'
import { Button, type ButtonProps } from './button'

interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** 确认后执行的动作 */
  onConfirm: () => void
  /** 待确认态的文案，默认「再点一次确认」 */
  confirmLabel?: string
  /** 待确认态自动还原的毫秒数 */
  timeout?: number
}

/**
 * 统一的两步确认按钮：第一次点击进入待确认态，第二次执行。
 * 替代此前项目列表 / 归档室 / 结构页三种各写各的删除确认。
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = '再点一次确认',
  timeout = 3000,
  children,
  variant = 'danger',
  ...rest
}: ConfirmButtonProps) {
  const [arming, setArming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <Button
      {...rest}
      variant={arming ? 'primary' : variant}
      onClick={() => {
        if (arming) {
          if (timer.current) clearTimeout(timer.current)
          setArming(false)
          onConfirm()
        } else {
          setArming(true)
          timer.current = setTimeout(() => setArming(false), timeout)
        }
      }}
    >
      {arming ? confirmLabel : children}
    </Button>
  )
}
