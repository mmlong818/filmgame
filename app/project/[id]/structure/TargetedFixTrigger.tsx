'use client'
// 辅助区「AI 协作」内的定向重构触发块：无 lastValidation 时引导先去校验页跑校验。
import { Button } from '@/app/components/ui/button'
import type { AiActionState } from '@/lib/hooks/useAiAction'

export function TargetedFixTrigger({
  hasValidation,
  fixAi,
  onRun,
}: {
  hasValidation: boolean
  fixAi: AiActionState
  onRun: () => void
}) {
  return (
    <div className="pt-1 border-t border-line-soft space-y-1.5">
      <Button
        variant="secondary" size="sm" className="w-full"
        loading={fixAi.loading !== null}
        disabled={!hasValidation || fixAi.loading !== null}
        onClick={onRun}
      >按校验结果定向重构</Button>
      {!hasValidation && (
        <p className="text-[11px] text-pencil">先去「全局校验」页跑一次校验，再回来定向重构</p>
      )}
      {fixAi.loading !== null && (
        <button type="button" onClick={fixAi.cancel} className="cursor-pointer text-xs text-pencil hover:text-vermilion underline underline-offset-2">中止</button>
      )}
      {fixAi.error && (
        <div className="text-xs text-vermilion bg-vermilion/5 border-l-[3px] border-vermilion px-2.5 py-2 space-y-1.5">
          <p>{fixAi.error}</p>
          <Button size="sm" variant="danger" className="w-full" onClick={fixAi.retry}>重试</Button>
        </div>
      )}
    </div>
  )
}
