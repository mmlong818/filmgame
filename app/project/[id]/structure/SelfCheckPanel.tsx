'use client'
// 辅助区「结构体检」速报卡：分支密度 / 无保底出口节点数 / 不可达节点数（A4）。
import type { SelfCheck } from './selfCheck'

export function SelfCheckPanel({ selfCheck }: { selfCheck: SelfCheck | null }) {
  return (
    <div className="bg-paper border border-line-soft p-3.5 space-y-1.5 text-xs">
      {!selfCheck ? (
        <p className="text-pencil italic">暂无节点，生成结构后自动体检</p>
      ) : (
        <>
          <div className={`flex items-center justify-between ${selfCheck.density < 0.25 ? 'text-amberink' : 'text-ink-soft'}`}>
            <span>分支密度</span>
            <span className="courier">{Math.round(selfCheck.density * 100)}%{selfCheck.density < 0.25 ? '　偏低' : ''}</span>
          </div>
          <div className="flex items-center justify-between text-ink-soft">
            <span>无保底出口节点</span>
            <span className="courier">{selfCheck.noFallback}</span>
          </div>
          <div className="flex items-center justify-between text-ink-soft">
            <span>不可达节点</span>
            <span className="courier">{selfCheck.unreachable}</span>
          </div>
          {selfCheck.fixDelta && (
            <div className="pt-1.5 mt-1.5 border-t border-line-soft text-leaf">
              定向重构后通过率 {selfCheck.fixDelta.before}% → {selfCheck.fixDelta.after}%
            </div>
          )}
        </>
      )}
    </div>
  )
}
