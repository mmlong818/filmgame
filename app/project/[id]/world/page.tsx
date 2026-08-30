'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { Input, Textarea } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { SkeletonPage } from '@/app/components/ui/skeleton'
import { AssistRail, AssistSection } from '@/app/components/ui/assist-rail'
import { AiTrigger } from './ai-widgets'
import { Field, SectionHeading } from './widgets'
import { EndingsPanel } from './EndingsPanel'
import { VariablesPanel } from './VariablesPanel'
import { CharactersPanel } from './CharactersPanel'
import { ReviewPanel } from './ReviewPanel'
import { useWorldAi } from './useWorldAi'
import type { WorldAnchor } from '@/lib/types/project'

export default function WorldPage() {
  const router = useRouter()
  const { project, setWorldAnchor, advancePhase, addCharacter, updateCharacter, deleteCharacter, setEndingsDesign, setCharacters, setVariables } = useProjectStore()
  const [form, setForm] = useState<WorldAnchor>(project?.worldAnchor ?? {
    storyCore: '', theme: '', genre: '', worldRules: '',
    durationMinutes: 60, endingCount: 3, endingsDesign: [],
  })
  const [autoSaved, setAutoSaved] = useState(false)
  // 区分"用户输入触发"和"初始化赋值触发"，避免初始化时误触发保存
  const userEdited = useRef(false)

  const {
    review, reviewAi, fixAi, endingsAi, charactersAi, variablesAi,
    handleAiReview, fixIssues, generateEndings, generateCharacters, suggestVariables,
  } = useWorldAi({
    form,
    characters: project?.characters ?? [],
    setForm,
    markUserEdited: () => { userEdited.current = true },
    setEndingsDesign,
    setCharacters,
    setVariables,
  })

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

  if (!project) return <SkeletonPage />

  function update(key: keyof WorldAnchor, value: string | number) {
    userEdited.current = true
    setForm(f => ({ ...f, [key]: value }))
  }

  const isComplete = Boolean(form.storyCore && form.theme && form.genre && form.worldRules)
  const endings = form.endingsDesign ?? project.worldAnchor?.endingsDesign ?? []

  return (
    <div className="corkboard min-h-full px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-ink">
            世界锚点{autoSaved && <span className="text-xs text-leaf ml-2 font-sans">✓ 已保存</span>}
          </h2>
          <p className="text-sm text-pencil mt-1">锚定故事核心，所有后续设计都以此为基础</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ── 核心产出区 ── */}
          <main className="flex-1 min-w-0">
            <div className="paper-sheet paper-sheet-ruled p-8 space-y-6">
              <Field label="故事核" required hint="用一句话：主人公想要什么？什么阻止了他？">
                <Textarea value={form.storyCore} onChange={e => update('storyCore', e.target.value)} rows={3}
                  placeholder="例：一个记者想揭露一个与小镇集体失忆有关的秘密，但越深入调查，越发现自己也是那个秘密的一部分。" />
              </Field>

              <Field label="核心主题" required hint="观众看完后，你希望他们带走什么思考？">
                <Input value={form.theme} onChange={e => update('theme', e.target.value)}
                  placeholder="例：记忆与身份的关系——我们是否真的拥有自己的过去？" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="类型/风格" required>
                  <Input value={form.genre} onChange={e => update('genre', e.target.value)} placeholder="例：悬疑 + 心理惊悚" />
                </Field>
                <Field label="预期总时长（分钟）" required>
                  <Input type="number" value={form.durationMinutes} onChange={e => update('durationMinutes', Number(e.target.value))} min={15} max={360} />
                </Field>
              </div>

              <Field label="世界规则" required hint="这个故事世界里什么是可能的？什么是绝对不可能的？（列出2-3条规则）">
                <Textarea
                  value={form.worldRules}
                  onChange={e => update('worldRules', e.target.value)}
                  rows={4}
                  placeholder={"例：\n1. 小镇居民每隔10年会集体忘记一件事\n2. 主角有权访问任何档案，但修改档案会触发警报\n3. 失忆不会消除情绪记忆，只是切断了语言化的能力"}
                />
              </Field>

              <div>
                <SectionHeading title="结局线" hint="结局数量建议 2-5 个，将作为故事结构阶段的目标节点" />
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-xs text-pencil">数量</label>
                  <Input type="number" value={form.endingCount} onChange={e => update('endingCount', Number(e.target.value))} min={2} max={10} className="!w-24" />
                </div>
                {endings.length === 0
                  ? <p className="text-xs text-pencil italic">尚未设计——填完上方四项后，用右侧「AI 设计结局线」生成</p>
                  : <EndingsPanel endings={endings} />}
              </div>

              <VariablesPanel variables={project.variables} />

              <CharactersPanel
                characters={project.characters}
                worldAnchor={form}
                onAdd={addCharacter}
                onUpdate={updateCharacter}
                onDelete={deleteCharacter}
              />
            </div>

            <div className="flex justify-end mt-4">
              <Button
                variant="primary"
                onClick={() => { advancePhase(); if (project) router.push(`/project/${project.id}/scale`) }}
                disabled={!isComplete}
              >
                下一步：规模规划 →
              </Button>
            </div>
          </main>

          {/* ── 辅助区 ── */}
          <AssistRail>
            <AssistSection title="AI 协作">
              <div className="bg-paper border border-line-soft p-3.5 space-y-3">
                <AiTrigger ai={reviewAi} label="AI 专家审查" onRun={handleAiReview} disabled={!isComplete} />
                <AiTrigger ai={endingsAi} label="AI 设计结局线" onRun={generateEndings} disabled={!isComplete} />
                <AiTrigger ai={variablesAi} label="AI 建议变量" onRun={suggestVariables} disabled={!isComplete} />
                <AiTrigger ai={charactersAi} label="AI 生成角色" onRun={generateCharacters} disabled={!isComplete} />
                {!isComplete && <p className="text-[11px] text-pencil">填完左侧四个必填项后可用</p>}
              </div>
            </AssistSection>

            {review && (
              <AssistSection title="审查结果">
                <ReviewPanel review={review} fixAi={fixAi} onFix={() => fixIssues(review.issues)} />
              </AssistSection>
            )}

            <AssistSection title="说明">
              <div className="text-[11.5px] text-pencil leading-relaxed space-y-1.5">
                <p>本阶段产出：故事核、主题、世界规则、结局线、变量、角色——它们是后续所有阶段的基础。</p>
                <p>项目数据自动保存；可在校验阶段导出 JSON 文件。</p>
              </div>
            </AssistSection>
          </AssistRail>
        </div>
      </div>
    </div>
  )
}
