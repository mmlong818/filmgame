'use client'

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

export function SceneAnalysisPanel({ data, onClose }: { data: SceneAnalysis; onClose: () => void }) {
  return (
    <div className="border border-amber-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-100">
        <span className="text-xs font-semibold text-amber-700">场景分析报告</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="bg-green-50 border border-green-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-green-700 mb-1">有效之处</p>
          <p className="text-xs text-green-800 leading-relaxed">{data.working}</p>
        </div>
        {data.issues.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">需要修改</p>
            {data.issues.map((issue, i) => (
              <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-gray-500 italic">&quot;{issue.line}&quot;</p>
                <p className="text-xs text-red-600">{issue.problem}</p>
                <p className="text-xs text-gray-700 font-medium">→ {issue.fix}</p>
              </div>
            ))}
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">杀手台词建议</p>
          <p className="text-xs text-amber-900 leading-relaxed">{data.killer_line}</p>
        </div>
      </div>
    </div>
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
    <div className="border border-violet-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
        <span className="text-xs font-semibold text-violet-700">⚡ 场景张力诊断</span>
        <div className="flex items-center gap-2">
          <button onClick={onToggle} className="text-xs text-gray-400 hover:text-gray-600">{open ? '收起' : '展开'}</button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </div>
      </div>
      {open && (
        <div className="p-4 space-y-2 text-xs">
          {rows.map(({ key, label }) =>
            data[key] ? (
              <div key={key} className="flex gap-2">
                <span className="text-violet-500 font-medium shrink-0 w-20">{label}</span>
                <span className="text-gray-700 leading-relaxed">{data[key]}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}

export function ChoiceConsequencePanel({ data, onClose }: { data: ChoiceConsequence; onClose: () => void }) {
  return (
    <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-rose-700">🎯 选项后果推演</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="space-y-2 text-xs">
        {Object.entries(data).map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <span className="text-rose-500 font-medium shrink-0 w-24">{key}</span>
            <span className="text-gray-700 leading-relaxed">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChoiceSuggestionsPanel({ data, onClose }: { data: ChoiceSuggestion[]; onClose: () => void }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-amber-700">AI 建议选项</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="space-y-2">
        {data.map((s, i) => (
          <div key={i} className="bg-white rounded-lg p-3 border border-amber-100 space-y-1">
            <div className="text-sm font-medium text-gray-800">{s.text}</div>
            <div className="text-xs text-gray-500">即时：{s.consequence}</div>
            <div className="text-xs text-gray-400">长期：{s.longterm}</div>
            {s.dramatic_cost && <div className="text-xs text-red-500 mt-1">代价：{s.dramatic_cost}</div>}
            {s.thematic_resonance && <div className="text-xs text-amber-600 italic">主题：{s.thematic_resonance}</div>}
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 mt-2 opacity-70">以上为参考建议，请手动在节点选择中添加</p>
    </div>
  )
}
