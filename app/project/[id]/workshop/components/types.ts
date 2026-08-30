import type { EmotionFunction, DialogueLine } from '@/lib/types/project'

/** 单节点 AI 草稿：AI 生成结果的暂存区，需用户确认后才写入 store。 */
export type NodeDraft = {
  emotionFunction?: EmotionFunction
  sceneDesc?: string
  dialogue?: DialogueLine[]
}

export type SceneAnalysisResult = { working: string; issues: Array<{ line: string; problem: string; fix: string }>; killer_line: string }
export type SceneTensionResult = { tension_diagnosis: string; missing_element: string; rewrite_suggestion: string; upgraded_line: string; mcguffin: string; dramatic_irony: string }
export type ChoiceSuggestion = { text: string; consequence: string; longterm: string; dramatic_cost?: string; thematic_resonance?: string }
export type ChoiceConsequenceResult = { immediate: string; chapter_impact: string; regret_factor: string; [key: string]: string }
