'use client'
import { StickyNote } from '@/app/components/ui/sticky-note'

type SceneAnalysis = {
  working: string
  issues: Array<{ line: string; problem: string; fix: string }>
  killer_line: string
}

type SceneTension = {
  tension_diagnosis: string
  missing_element: string
  rewrite_suggestion: string
  upgraded_line: string
  mcguffin: string
  dramatic_irony: string
}

type ChoiceSuggestion = {
  text: string
  consequence: string
  longterm: string
  dramatic_cost?: string
  thematic_resonance?: string
}

type ChoiceConsequence = {
  immediate: string
  chapter_impact: string
  regret_factor: string
  [key: string]: string
}

function NoteHeader({ title, onClose, extra }: { title: string; onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1.5 gap-2">
      <span className="hand text-[16px] opacity-70 leading-none">{title}</span>
      <div className="flex items-center gap-2 shrink-0 text-xs">
        {extra}
        <button type="button" aria-label="关闭" onClick={onClose} className="cursor-pointer opacity-60 hover:opacity-100 leading-none">×</button>
      </div>
    </div>
  )
}

export function SceneAnalysisPanel({ data, onClose }: { data: SceneAnalysis; onClose: () => void }) {
  return (
    <StickyNote tilt={-1.2}>
      <NoteHeader title="场景分析报告" onClose={onClose} />
      <p className="mb-2"><span className="font-semibold">有效之处：</span>{data.working}</p>
      {data.issues.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {data.issues.map((issue, i) => (
            <div key={i} className="border-t border-[#4a3c14]/15 pt-1.5">
              <p className="italic opacity-80">&quot;{issue.line}&quot;</p>
              <p>{issue.problem}</p>
              <p className="font-medium">→ {issue.fix}</p>
            </div>
          ))}
        </div>
      )}
      <p><span className="font-semibold">杀手台词建议：</span>{data.killer_line}</p>
    </StickyNote>
  )
}

export function SceneTensionPanel({
  data,
  open,
  onToggle,
  onClose,
}: {
  data: SceneTension
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const rows: { key: keyof SceneTension; label: string }[] = [
    { key: 'tension_diagnosis', label: '张力诊断' },
    { key: 'missing_element', label: '缺失元素' },
    { key: 'rewrite_suggestion', label: '改写建议' },
    { key: 'upgraded_line', label: '升级台词' },
    { key: 'mcguffin', label: '麦格芬' },
    { key: 'dramatic_irony', label: '戏剧性反讽' },
  ]
  return (
    <StickyNote tilt={1}>
      <NoteHeader
        title="⚡ 场景张力诊断"
        onClose={onClose}
        extra={<button type="button" onClick={onToggle} className="cursor-pointer opacity-70 hover:opacity-100">{open ? '收起' : '展开'}</button>}
      />
      {open && (
        <div className="space-y-1.5">
          {rows.map(({ key, label }) =>
            data[key] ? (
              <div key={key} className="flex gap-2">
                <span className="font-medium shrink-0 opacity-70">{label}</span>
                <span>{data[key]}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </StickyNote>
  )
}

export function ChoiceConsequencePanel({ data, onClose }: { data: ChoiceConsequence; onClose: () => void }) {
  return (
    <StickyNote tilt={-0.8}>
      <NoteHeader title="🎯 选项后果推演" onClose={onClose} />
      <div className="space-y-1.5">
        {Object.entries(data).map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <span className="font-medium shrink-0 opacity-70">{key}</span>
            <span>{val}</span>
          </div>
        ))}
      </div>
    </StickyNote>
  )
}

export function ChoiceSuggestionsPanel({ data, onClose }: { data: ChoiceSuggestion[]; onClose: () => void }) {
  return (
    <StickyNote tilt={1.4}>
      <NoteHeader title="AI 建议选项" onClose={onClose} />
      <div className="space-y-2">
        {data.map((s, i) => (
          <div key={i} className="bg-paper/50 p-2 space-y-1">
            <div className="font-semibold">{s.text}</div>
            <div className="opacity-80">即时：{s.consequence}</div>
            <div className="opacity-70">长期：{s.longterm}</div>
            {s.dramatic_cost && <div className="opacity-90">代价：{s.dramatic_cost}</div>}
            {s.thematic_resonance && <div className="italic opacity-80">主题：{s.thematic_resonance}</div>}
          </div>
        ))}
      </div>
      <p className="mt-2 opacity-60">以上为参考建议，请手动在节点选择中添加</p>
    </StickyNote>
  )
}
