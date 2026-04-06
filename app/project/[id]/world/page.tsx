'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import type { WorldAnchor, Character, EndingDesign, Variable, AiReview, VoiceProfile } from '@/lib/types/project'

export default function WorldPage() {
  const router = useRouter()
  const { project, setWorldAnchor, advancePhase, addCharacter, updateCharacter, deleteCharacter, setEndingsDesign, setCharacters, setVariables } = useProjectStore()
  const [form, setForm] = useState<WorldAnchor>(project?.worldAnchor ?? {
    storyCore: '', theme: '', genre: '', worldRules: '',
    durationMinutes: 60, endingCount: 3, endingsDesign: [],
  })
  const [loading, setLoading] = useState(false)
  const [review, setReview] = useState<AiReview | null>(null)
  const [autoSaved, setAutoSaved] = useState(false)
  const [voiceProfiles, setVoiceProfiles] = useState<Record<string, VoiceProfile>>({})
  const [voiceLoading, setVoiceLoading] = useState<string | null>(null)
  const [endingsLoading, setEndingsLoading] = useState(false)
  const [variablesLoading, setVariablesLoading] = useState(false)
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [fixLoading, setFixLoading] = useState(false)
  // 区分"用户输入触发"和"初始化赋值触发"，避免初始化时误触发保存
  const userEdited = useRef(false)

  // project 加载完毕时同步表单（标记为非用户编辑）
  useEffect(() => {
    if (project?.worldAnchor) {
      userEdited.current = false
      setForm(project.worldAnchor)
    }
  }, [project?.id])

  // 用户编辑表单时立即同步到 store
  useEffect(() => {
    if (!project || !userEdited.current) return
    setWorldAnchor(form)
    setAutoSaved(true)
    const t = setTimeout(() => setAutoSaved(false), 1500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  if (!project) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      加载中...
    </div>
  )

  function update(key: keyof WorldAnchor, value: string | number) {
    userEdited.current = true
    setForm(f => ({ ...f, [key]: value }))
  }

  async function generateVoiceProfile(ch: Character) {
    setVoiceLoading(ch.id)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'workshop',
          action: 'character_voice',
          context: { character: ch, worldAnchor: form },
        }),
      })
      const data = await res.json()
      if (data.ok && data.result) {
        setVoiceProfiles(p => ({ ...p, [ch.id]: data.result }))
        updateCharacter(ch.id, { voiceProfile: data.result })
      }
    } catch { /* ignore */ }
    finally { setVoiceLoading(null) }
  }

  async function fixIssues(issues: AiReview['issues']) {
    setFixLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'world', action: 'fix_issues', context: { worldAnchor: form, issues } }),
      })
      const data = await res.json()
      if (data.ok && data.result) {
        const patch = data.result as Partial<WorldAnchor>
        userEdited.current = true
        setForm(f => ({ ...f, ...patch }))
      }
    } catch (e) { console.error(e) }
    finally { setFixLoading(false) }
  }

  async function handleAiReview() {
    setLoading(true)
    setReview(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'world', action: 'review', context: { ...form, characters: project?.characters ?? [] } }),
      })
      const data = await res.json()
      if (data.ok) setReview(data.result as AiReview)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function generateEndings() {
    setEndingsLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'world',
          action: 'endings_design',
          context: { worldAnchor: form, characters: project?.characters ?? [] },
        }),
      })
      const data = await res.json()
      if (data.ok && data.result?.endings) {
        const endings = data.result.endings as EndingDesign[]
        setEndingsDesign(endings)
        setForm(f => ({ ...f, endingsDesign: endings }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setEndingsLoading(false)
    }
  }

  async function generateCharacters() {
    setCharactersLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'world', action: 'suggest_characters', context: { worldAnchor: form } }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.result?.characters)) {
        const chars = (data.result.characters as Array<Record<string,string>>).map(c => ({
          id: Math.random().toString(36).slice(2, 10),
          name: c.name ?? '新角色',
          role: (c.role ?? 'support') as import('@/lib/types/project').Character['role'],
          motivation: c.motivation ?? '',
          relationship: c.relationship ?? '',
          wound: c.wound,
          lie: c.lie,
          want: c.want,
          need: c.need,
        }))
        setCharacters(chars)
      }
    } catch (e) { console.error(e) }
    finally { setCharactersLoading(false) }
  }

  async function suggestVariables() {
    setVariablesLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'world', action: 'suggest_variables', context: { worldAnchor: form, characters: project?.characters ?? [] } }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.result?.variables)) {
        const vars = (data.result.variables as Array<Record<string,string>>).map(v => ({
          id: Math.random().toString(36).slice(2, 10),
          name: v.name ?? 'var',
          type: (v.type ?? 'counter') as import('@/lib/types/project').Variable['type'],
          defaultValue: v.defaultValue ?? '0',
          description: v.description ?? '',
        }))
        setVariables(vars)
      }
    } catch (e) { console.error(e) }
    finally { setVariablesLoading(false) }
  }

  const isComplete = form.storyCore && form.theme && form.genre && form.worldRules

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">世界锚点{autoSaved && <span className="text-xs text-green-500 ml-2">✓ 已保存</span>}</h2>
        <p className="text-sm text-gray-500 mt-1">锚定故事核心，所有后续设计都以此为基础</p>
      </div>

      <div className="space-y-5">
        <Field label="故事核" required hint="用一句话：主人公想要什么？什么阻止了他？">
          <textarea
            value={form.storyCore}
            onChange={e => update('storyCore', e.target.value)}
            placeholder="例：一个记者想揭露一个与小镇集体失忆有关的秘密，但越深入调查，越发现自己也是那个秘密的一部分。"
            rows={3}
            className={inputClass}
          />
        </Field>

        <Field label="核心主题" required hint="观众看完后，你希望他们带走什么思考？">
          <input
            value={form.theme}
            onChange={e => update('theme', e.target.value)}
            placeholder="例：记忆与身份的关系——我们是否真的拥有自己的过去？"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="类型/风格" required>
            <input
              value={form.genre}
              onChange={e => update('genre', e.target.value)}
              placeholder="例：悬疑 + 心理惊悚"
              className={inputClass}
            />
          </Field>

          <Field label="预期总时长（分钟）" required>
            <input
              type="number"
              value={form.durationMinutes}
              onChange={e => update('durationMinutes', Number(e.target.value))}
              min={15}
              max={360}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="世界规则" required hint="这个故事世界里什么是可能的？什么是绝对不可能的？（列出2-3条规则）">
          <textarea
            value={form.worldRules}
            onChange={e => update('worldRules', e.target.value)}
            placeholder={"例：\n1. 小镇居民每隔10年会集体忘记一件事\n2. 主角有权访问任何档案，但修改档案会触发警报\n3. 失忆不会消除情绪记忆，只是切断了语言化的能力"}
            rows={4}
            className={inputClass}
          />
        </Field>

        <Field label="结局数量" hint="建议 2-5 个，结局越多分支越复杂">
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={form.endingCount}
              onChange={e => update('endingCount', Number(e.target.value))}
              min={2}
              max={10}
              className={`${inputClass} w-24`}
            />
            <button
              onClick={generateEndings}
              disabled={endingsLoading || !isComplete}
              className="px-3 py-2 bg-white border border-amber-200 text-sm text-amber-600 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {endingsLoading && <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
              AI 设计结局线
            </button>
          </div>
        </Field>

        {(form.endingsDesign ?? project?.worldAnchor?.endingsDesign) && (() => {
          const endings = form.endingsDesign ?? project?.worldAnchor?.endingsDesign ?? []
          const typeLabel: Record<string, string> = { good: '好结局', bad: '坏结局', neutral: '中立', secret: '隐藏' }
          const typeColor: Record<string, string> = { good: 'bg-green-100 text-green-700', bad: 'bg-red-100 text-red-700', neutral: 'bg-gray-100 text-gray-600', secret: 'bg-purple-100 text-purple-700' }
          return endings.length > 0 ? (
            <div className="mt-1 space-y-2">
              <p className="text-xs text-gray-400 font-medium">已设计的结局线（将作为故事结构的目标节点）</p>
              {endings.map((e, i) => (
                <div key={e.id ?? i} className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[e.type] ?? typeColor.neutral}`}>{typeLabel[e.type] ?? e.type}</span>
                    <span className="text-sm font-medium text-gray-800">{e.title}</span>
                  </div>
                  <p className="text-xs text-gray-600">{e.description}</p>
                  <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    <span className="font-medium">触发：</span>{e.triggerCondition}
                  </div>
                  {e.avoidCondition && (
                    <div className="text-xs text-gray-500">
                      <span className="font-medium">偏离：</span>{e.avoidCondition}
                    </div>
                  )}
                  {e.keyVariable && (
                    <div className="text-xs text-blue-600 font-mono">{e.keyVariable}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null
        })()}

        {/* 叙事变量 */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-sm font-medium text-gray-700">叙事变量</label>
              <p className="text-xs text-gray-400 mt-0.5">追踪玩家选择积累的数值，用于终章解锁不同结局路线</p>
            </div>
            <button
              onClick={suggestVariables}
              disabled={variablesLoading || !isComplete}
              className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
            >
              {variablesLoading && <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
              AI 建议变量
            </button>
          </div>
          {project.variables.length === 0 ? (
            <p className="text-xs text-gray-400 italic">先设计结局线，再点击"AI 建议变量"自动提取需要追踪的变量</p>
          ) : (
            <div className="space-y-1.5">
              {project.variables.map(v => (
                <div key={v.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-xs font-mono text-blue-600 w-32 shrink-0">{v.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    v.type === 'counter' ? 'bg-blue-50 text-blue-600' :
                    v.type === 'flag' ? 'bg-gray-100 text-gray-600' :
                    v.type === 'relationship' ? 'bg-pink-50 text-pink-600' :
                    'bg-amber-50 text-amber-600'
                  }`}>{v.type}</span>
                  <span className="text-xs text-gray-500 truncate">{v.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">主要角色</label>
          <div className="flex items-center gap-2">
            <button
              onClick={generateCharacters}
              disabled={charactersLoading || !isComplete}
              className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
            >
              {charactersLoading && <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
              AI 生成
            </button>
            <button onClick={addCharacter} className="text-xs text-gray-500 hover:text-gray-700">+ 手动添加</button>
          </div>
        </div>
        {project.characters.length === 0 ? (
          <p className="text-xs text-gray-400 italic">点击"AI 生成"根据世界设定自动创建主要角色</p>
        ) : (
          <div className="space-y-2">
            {project.characters.map((ch: Character) => (
              <div key={ch.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={ch.name}
                    onChange={e => updateCharacter(ch.id, { name: e.target.value })}
                    placeholder="角色名"
                    className="text-sm font-medium border border-gray-200 rounded px-2 py-1 w-28 bg-white"
                  />
                  <select
                    value={ch.role}
                    onChange={e => updateCharacter(ch.id, { role: e.target.value as Character['role'] })}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                  >
                    <option value="protagonist">主角</option>
                    <option value="antagonist">对立角色</option>
                    <option value="support">支线角色</option>
                    <option value="other">其他</option>
                  </select>
                  <button onClick={() => deleteCharacter(ch.id)} className="ml-auto text-gray-300 hover:text-red-400 text-xs">✕</button>
                </div>
                <input
                  value={ch.motivation}
                  onChange={e => updateCharacter(ch.id, { motivation: e.target.value })}
                  placeholder="核心动机（想要什么？）"
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                />
                <input
                  value={ch.relationship}
                  onChange={e => updateCharacter(ch.id, { relationship: e.target.value })}
                  placeholder="与主线的关系"
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                />
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <input
                    value={ch.wound ?? ''}
                    onChange={e => updateCharacter(ch.id, { wound: e.target.value })}
                    placeholder="心理伤痛 WOUND"
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                  />
                  <input
                    value={ch.lie ?? ''}
                    onChange={e => updateCharacter(ch.id, { lie: e.target.value })}
                    placeholder="内心谎言 LIE"
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                  />
                  <input
                    value={ch.want ?? ''}
                    onChange={e => updateCharacter(ch.id, { want: e.target.value })}
                    placeholder="外部欲望 WANT"
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                  />
                  <input
                    value={ch.need ?? ''}
                    onChange={e => updateCharacter(ch.id, { need: e.target.value })}
                    placeholder="内在需求 NEED"
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <button
                    onClick={() => generateVoiceProfile(ch)}
                    disabled={voiceLoading === ch.id || !ch.motivation}
                    className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
                  >
                    {voiceLoading === ch.id && <span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
                    AI 声音指纹
                  </button>
                </div>
                {(() => { const vp = voiceProfiles[ch.id] ?? ch.voiceProfile; return vp && (
                  <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5 space-y-1.5">
                    <div className="text-xs text-amber-800">
                      <span className="font-medium">节奏：</span>{vp.speaking_rhythm}
                    </div>
                    <div className="text-xs text-amber-800">
                      <span className="font-medium">词汇：</span>{vp.vocabulary}
                    </div>
                    <div className="text-xs text-amber-800">
                      <span className="font-medium">压力下：</span>{vp.defense_mechanism}
                    </div>
                    {vp.sample_lines && vp.sample_lines.length > 0 && (
                      <div className="text-xs text-amber-700 italic border-t border-amber-100 pt-1.5">
                        「{vp.sample_lines[0]}」
                      </div>
                    )}
                  </div>
                )})()}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {review && (
        <div className="mt-6 bg-amber-50 border border-amber-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">AI 专家审查</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${review.consistency === '通过' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {review.consistency}
            </span>
            {review.issues?.length > 0 && (
              <button
                onClick={() => fixIssues(review.issues)}
                disabled={fixLoading}
                className="ml-auto text-xs px-2.5 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 flex items-center gap-1.5"
              >
                {fixLoading && <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                AI 修正
              </button>
            )}
          </div>
          {review.issues?.length > 0 && (
            <div className="space-y-2 mb-3">
              {review.issues.map((issue, i) => (
                <div key={i} className="bg-white rounded-lg p-3 text-sm">
                  <div className="font-medium text-gray-700">{issue.field}</div>
                  <div className="text-gray-500 mt-0.5">{issue.issue}</div>
                  <div className="text-amber-600 mt-1">→ {issue.suggestion}</div>
                </div>
              ))}
            </div>
          )}
          {(review.structure_analysis || review.interactive_potential) && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {review.structure_analysis && (
                <div className="bg-white rounded-lg p-2.5">
                  <div className="text-xs font-medium text-gray-500 mb-1">叙事结构</div>
                  <div className="text-xs text-gray-700">{review.structure_analysis}</div>
                </div>
              )}
              {review.interactive_potential && (
                <div className="bg-white rounded-lg p-2.5">
                  <div className="text-xs font-medium text-gray-500 mb-1">互动潜力</div>
                  <div className={`text-xs font-semibold ${review.interactive_potential === '高' ? 'text-green-600' : review.interactive_potential === '中' ? 'text-amber-600' : 'text-gray-600'}`}>
                    {review.interactive_potential}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-gray-600">{review.overall}</p>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">项目数据自动保存在本地浏览器中，可在校验阶段导出 JSON 文件</p>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleAiReview}
          disabled={loading || !isComplete}
          className="px-4 py-2 bg-white border border-amber-200 text-sm text-amber-600 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading && <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
          AI 专家审查
        </button>
        <div className="flex-1" />
        <button
          onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/scale`) }}
          disabled={!isComplete}
          className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一步：规模规划 →
        </button>
      </div>
    </div>
  )
}

const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white'

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}
