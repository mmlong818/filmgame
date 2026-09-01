// 结构/分支生成流共用的草稿类型与纯函数。
// 从 structure/page.tsx 抽出，供 useStructureGeneration / useBranchGeneration / page 共享，
// 避免拆分后在多个文件里各复制一份定义。
import type { NodeType } from '@/lib/types/project'
import type { AiErrorType } from '@/lib/ai/errors'

export type AiNodeDraft = { title: string; type: string; notes: string }
export type AiActDraft = { title: string; nodes: AiNodeDraft[] }
export type AiChapterDraft = { title: string; acts: AiActDraft[] }

export type AiChoice = {
  text: string; targetNodeTitle: string; targetNodeId?: string
  variableEffects?: string; choiceWeight?: 'light' | 'heavy' | 'critical'
  consequence?: string; conditions?: string
}
export type AiNodeChoices = { nodeTitle: string; nodeId?: string; choices: AiChoice[]; exploreReturnNodeId?: string }

export type StructProgress = { phase: 'spine' | 'chapters'; done: number; total: number }
export type StructStreamEvent =
  | { type: 'run'; runId: string | null }
  | { type: 'spine'; ok: boolean }
  | { type: 'chapter'; done: number; total: number; warnings?: string[] }
  | { type: 'done'; chapters: AiChapterDraft[]; errors: string[]; warnings?: string[] }
  | { type: 'error'; error: string; errorType: string }

export type Stage =
  | 'struct_loading' | 'struct_preview'
  | 'branch_loading' | 'branch_preview'
  | 'edit'

export type ViewMode = 'list' | 'flow'

export function normalizeChapters(chapters: AiChapterDraft[]): AiChapterDraft[] {
  // 双保险排序：草稿可能来自未排序的通道（并行完成顺序），带 chapterIndex 就按它恢复章序
  return (chapters ?? [])
    .map(ch => ({
      ...ch,
      acts: (ch.acts ?? []).map(act => ({ ...act, nodes: act.nodes ?? [] })),
    }))
    .sort((a, b) => ((a as { chapterIndex?: number }).chapterIndex ?? 0) - ((b as { chapterIndex?: number }).chapterIndex ?? 0))
}

const KNOWN_ERROR_TYPES: readonly AiErrorType[] = ['no_cli', 'timeout', 'parse_failed', 'unknown']
export function toErrorType(t: string): AiErrorType {
  return (KNOWN_ERROR_TYPES as readonly string[]).includes(t) ? (t as AiErrorType) : 'unknown'
}

const VALID_NODE_TYPES = ['start', 'normal', 'branch', 'merge', 'ending', 'explore'] as const
export function isValidNodeType(t: string): t is NodeType {
  return (VALID_NODE_TYPES as readonly string[]).includes(t)
}
export function draftNodeType(t: string): NodeType {
  return isValidNodeType(t) ? t : 'normal'
}
