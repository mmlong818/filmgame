'use client'
// world 页 5 个页面级 AI 动作（角色卡的声音指纹动作独立、自持于 CharacterCard 内）。
// 抽成 hook 避免 page.tsx 把 5 套 loading/error 状态机与请求逻辑全堆进主渲染函数。
import { useState } from 'react'
import { nanoid } from 'nanoid'
import { aiJson } from '@/lib/ai/client'
import { useAiAction } from '@/lib/hooks/useAiAction'
import type { WorldAnchor, Character, EndingDesign, Variable, AiReview } from '@/lib/types/project'

interface Params {
  form: WorldAnchor
  characters: Character[]
  setForm: (updater: (f: WorldAnchor) => WorldAnchor) => void
  markUserEdited: () => void
  setEndingsDesign: (endings: EndingDesign[]) => void
  setCharacters: (characters: Character[]) => void
  setVariables: (variables: Variable[]) => void
}

export function useWorldAi({ form, characters, setForm, markUserEdited, setEndingsDesign, setCharacters, setVariables }: Params) {
  const [review, setReview] = useState<AiReview | null>(null)
  const reviewAi = useAiAction()
  const fixAi = useAiAction()
  const endingsAi = useAiAction()
  const charactersAi = useAiAction()
  const variablesAi = useAiAction()

  async function handleAiReview() {
    setReview(null)
    const data = await reviewAi.run('AI 专家审查', signal =>
      aiJson<{ result: AiReview }>('world', 'review', { ...form, characters }, signal),
    )
    if (data) setReview(data.result)
  }

  async function fixIssues(issues: AiReview['issues']) {
    const data = await fixAi.run('AI 修正', signal =>
      aiJson<{ result: Partial<WorldAnchor> }>('world', 'fix_issues', { worldAnchor: form, issues }, signal),
    )
    if (data) {
      markUserEdited()
      setForm(f => ({ ...f, ...data.result }))
    }
  }

  async function generateEndings() {
    const data = await endingsAi.run('AI 设计结局线', signal =>
      aiJson<{ result?: { endings?: EndingDesign[] } }>('world', 'endings_design', { worldAnchor: form, characters }, signal),
    )
    const endings = data?.result?.endings
    if (endings) {
      setEndingsDesign(endings)
      setForm(f => ({ ...f, endingsDesign: endings }))
    }
  }

  async function generateCharacters() {
    const data = await charactersAi.run('AI 生成角色', signal =>
      aiJson<{ result?: { characters?: Array<Record<string, string>> } }>('world', 'suggest_characters', { worldAnchor: form }, signal),
    )
    const list = data?.result?.characters
    if (Array.isArray(list)) {
      setCharacters(list.map(c => ({
        id: nanoid(8),
        name: c.name ?? '新角色',
        role: (c.role ?? 'support') as Character['role'],
        motivation: c.motivation ?? '',
        relationship: c.relationship ?? '',
        wound: c.wound,
        lie: c.lie,
        want: c.want,
        need: c.need,
      })))
    }
  }

  async function suggestVariables() {
    const data = await variablesAi.run('AI 建议变量', signal =>
      aiJson<{ result?: { variables?: Array<Record<string, string>> } }>('world', 'suggest_variables', { worldAnchor: form, characters }, signal),
    )
    const list = data?.result?.variables
    if (Array.isArray(list)) {
      setVariables(list.map(v => ({
        id: nanoid(8),
        name: v.name ?? 'var',
        type: (v.type ?? 'counter') as Variable['type'],
        defaultValue: v.defaultValue ?? '0',
        description: v.description ?? '',
      })))
    }
  }

  return {
    review, reviewAi, fixAi, endingsAi, charactersAi, variablesAi,
    handleAiReview, fixIssues, generateEndings, generateCharacters, suggestVariables,
  }
}
