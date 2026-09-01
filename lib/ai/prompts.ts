import type { Phase } from '@/lib/types/phase'
import type { PromptContext } from './prompts/shared'
import { worldPrompts } from './prompts/world'
import { scalePrompts } from './prompts/scale'
import { structurePrompts } from './prompts/structure'
import { branchesPrompts } from './prompts/branches'
import { workshopPrompts } from './prompts/workshop'
import { validatePrompts } from './prompts/validate'

export function buildPrompt(phase: Phase | string, action: string, context: PromptContext): string {
  const key = `${phase}:${action}`
  const ctx = context as PromptContext

  const templates: Record<string, (c: PromptContext) => string> = {
    ...worldPrompts,
    ...scalePrompts,
    ...structurePrompts,
    ...branchesPrompts,
    ...workshopPrompts,
    ...validatePrompts,
  }

  const fn = templates[key]
  if (fn) return fn(ctx)
  return `请根据以下数据给出建议：\n${JSON.stringify(ctx, null, 2)}`
}
