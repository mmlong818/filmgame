'use client'
import { StickyNote } from '@/app/components/ui/sticky-note'
import { Tag } from '@/app/components/ui/tag'
import { AiTrigger } from './ai-widgets'
import type { AiActionState } from '@/lib/hooks/useAiAction'
import type { AiReview } from '@/lib/types/project'

/** AI 专家审查结果：便签呈现 + 「AI 修正」触发器（自带独立 loading/error/取消） */
export function ReviewPanel({ review, fixAi, onFix }: { review: AiReview; fixAi: AiActionState; onFix: () => void }) {
  return (
    <StickyNote title="AI 专家审查" tilt={-0.6} className="mt-6 max-w-none">
      <div className="flex items-center gap-2 mb-3">
        <Tag tone={review.consistency === '通过' ? 'leaf' : 'amberink'}>{review.consistency}</Tag>
        {review.issues?.length > 0 && (
          <AiTrigger ai={fixAi} label="AI 修正" onRun={onFix} variant="primary" size="sm" className="ml-auto" />
        )}
      </div>
      {review.issues?.length > 0 && (
        <div className="space-y-2 mb-3">
          {review.issues.map((issue, i) => (
            <div key={i} className="bg-paper/60 border border-[#4a3c14]/15 px-3 py-2 text-[12.5px]">
              <div className="font-medium">{issue.field}</div>
              <div className="opacity-80 mt-0.5">{issue.issue}</div>
              <div className="mt-1">→ {issue.suggestion}</div>
            </div>
          ))}
        </div>
      )}
      {(review.structure_analysis || review.interactive_potential) && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {review.structure_analysis && (
            <div className="bg-paper/60 border border-[#4a3c14]/15 px-2.5 py-2">
              <div className="text-[11px] font-medium opacity-70 mb-1">叙事结构</div>
              <div className="text-[12px]">{review.structure_analysis}</div>
            </div>
          )}
          {review.interactive_potential && (
            <div className="bg-paper/60 border border-[#4a3c14]/15 px-2.5 py-2">
              <div className="text-[11px] font-medium opacity-70 mb-1">互动潜力</div>
              <div className="text-[12px] font-semibold">{review.interactive_potential}</div>
            </div>
          )}
        </div>
      )}
      <p className="text-[13px]">{review.overall}</p>
    </StickyNote>
  )
}
