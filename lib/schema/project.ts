// 全模型 zod 校验：与 lib/types/project.ts 逐字段对齐，风格参考 lib/ai/schemas.ts。
// 用于系统边界（API 读/写、导入）的运行时硬校验。
//
// 与 lib/types/project.ts 的已知偏差（真实数据 vs 类型声明矛盾，见 Task 3 报告详述）：
// - EmotionFunction.playerEmotion：类型声明必填，但 data/projects/g120MnzS.json 中
//   41 个节点里有 27 个缺失该字段 → 这里放宽为 .optional()。
// - ScalePlan.actCountPerChapter / totalBranches / aiRationale：类型声明必填，
//   但 g120MnzS.json 的全部 3 个 scalePlanOptions 都缺失这三个字段 → 放宽为 .optional()。
// 以上放宽只影响 zod（更宽松），不影响文件末尾的编译期一致性守卫方向
// （Project 的必填字段天然满足 zod 的可选字段约束）。
import { z } from 'zod'
import type { Project } from '../types/project'

// ─── 基础枚举 ──────────────────────────────────────────────────────

export const NodeTypeSchema = z.enum(['normal', 'branch', 'merge', 'ending', 'start', 'explore'])
export const DramaticWeightSchema = z.enum(['setup', 'tension', 'payoff', 'relief', 'reveal', 'dilemma'])
export const VariableTypeSchema = z.enum(['flag', 'counter', 'relationship', 'item'])
export const IssueLevelSchema = z.enum(['error', 'warning', 'info'])
export const PhaseSchema = z.enum(['world', 'scale', 'structure', 'workshop', 'validate'])
export const PhaseStatusSchema = z.enum(['locked', 'in_progress', 'done'])

// ─── VoiceProfile / Character ──────────────────────────────────────

export const VoiceProfileSchema = z.object({
  speaking_rhythm: z.string().optional(),
  vocabulary: z.string().optional(),
  defense_mechanism: z.string().optional(),
  lie_tells: z.string().optional(),
  sample_lines: z.array(z.string()).optional(),
})

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['protagonist', 'antagonist', 'support', 'other']),
  motivation: z.string(),
  relationship: z.string(),
  wound: z.string().optional(),
  lie: z.string().optional(),
  want: z.string().optional(),
  need: z.string().optional(),
  voiceProfile: VoiceProfileSchema.optional(),
})

// ─── Variable ───────────────────────────────────────────────────────

export const VariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: VariableTypeSchema,
  defaultValue: z.string(),
  description: z.string(),
})

// ─── Choice ─────────────────────────────────────────────────────────

export const ChoiceSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  text: z.string(),
  order: z.number(),
  targetNodeId: z.string(),
  conditions: z.string(),
  variableEffects: z.string(),
  consequence: z.string().optional(),
  choiceWeight: z.enum(['light', 'heavy', 'critical']).optional(),
})

// ─── StoryNode ──────────────────────────────────────────────────────

export const EmotionFunctionSchema = z.object({
  emotionIn: z.string(),
  emotionOut: z.string(),
  // 类型声明为必填，但真实数据存在缺失（见文件头注释），放宽为 optional。
  playerEmotion: z.string().optional(),
  tension: z.number(),
  internal_lie: z.string().optional(),
  fear: z.string().optional(),
})

export const SystemFunctionSchema = z.object({
  variablesRead: z.array(z.string()).default([]),
  variablesWrite: z.array(z.string()).default([]),
  requirements: z.string(),
})

export const DialogueLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  emotion: z.string(),
})

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const SceneHeaderSchema = z.object({
  location: z.string(),
  timeOfDay: z.enum(['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS']),
  interior: z.enum(['INT', 'EXT', 'INT/EXT']),
})

export const StoryNodeSchema = z.object({
  id: z.string(),
  actId: z.string(),
  title: z.string(),
  type: NodeTypeSchema,
  order: z.number(),
  position: PositionSchema,
  emotionFunction: EmotionFunctionSchema,
  systemFunction: SystemFunctionSchema,
  sceneHeader: SceneHeaderSchema.optional(),
  sceneDesc: z.string(),
  dialogue: z.array(DialogueLineSchema).default([]),
  choices: z.array(ChoiceSchema).default([]),
  durationSeconds: z.number(),
  notes: z.string(),
  dramaticWeight: DramaticWeightSchema.optional(),
  exploreReturnNodeId: z.string().optional(),
})

// ─── Chapter / Act ──────────────────────────────────────────────────

export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
})

export const ActSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  title: z.string(),
  order: z.number(),
  nodeIds: z.array(z.string()).default([]),
  dramaticFunction: z.enum(['setup', 'conflict', 'turn', 'resolution']).optional(),
})

// ─── Ending ─────────────────────────────────────────────────────────

export const EndingConditionSchema = z.object({
  variableName: z.string(),
  operator: z.enum(['>=', '<=', '==', '>', '<', '!=']),
  value: z.union([z.number(), z.string()]),
})

export const EndingSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  title: z.string(),
  type: z.enum(['good', 'bad', 'neutral', 'secret']),
  description: z.string(),
  conditions: z.string(),
  variableConditions: z.array(EndingConditionSchema).default([]),
  requiredChoiceIds: z.array(z.string()).default([]),
  reachPath: z.string(),
})

// ─── ScalePlan ──────────────────────────────────────────────────────

export const ScalePlanChapterSchema = z.object({
  title: z.string(),
  brief: z.string(),
})

export const ScalePlanSchema = z.object({
  id: z.string(),
  label: z.string(),
  chapterCount: z.number(),
  // 类型声明为必填，但真实数据存在缺失（见文件头注释），放宽为 optional。
  actCountPerChapter: z.number().optional(),
  totalNodes: z.number(),
  totalBranches: z.number().optional(),
  estimatedHours: z.number(),
  aiRationale: z.string().optional(),
  chapters: z.array(ScalePlanChapterSchema).optional(),
})

// ─── WorldAnchor ────────────────────────────────────────────────────

export const EndingDesignSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['good', 'bad', 'neutral', 'secret']),
  description: z.string(),
  triggerCondition: z.string(),
  avoidCondition: z.string(),
  keyVariable: z.string().optional(),
})

export const WorldAnchorSchema = z.object({
  storyCore: z.string(),
  theme: z.string(),
  genre: z.string(),
  worldRules: z.string(),
  durationMinutes: z.number(),
  endingCount: z.number(),
  endingsDesign: z.array(EndingDesignSchema).optional(),
})

// ─── Validation / DirectorReview ───────────────────────────────────

export const ValidationIssueSchema = z.object({
  id: z.string(),
  level: IssueLevelSchema,
  code: z.string(),
  message: z.string(),
  relatedIds: z.array(z.string()).default([]),
})

export const ValidationReportSchema = z.object({
  generatedAt: z.string(),
  totalNodes: z.number(),
  totalBranches: z.number(),
  issues: z.array(ValidationIssueSchema).default([]),
  passRate: z.number(),
})

export const DirectorVerdictSchema = z.object({
  lens: z.string(),
  score: z.number(),
  observation: z.string(),
  note: z.string(),
})

export const DirectorReviewSchema = z.object({
  generatedAt: z.string(),
  verdicts: z.array(DirectorVerdictSchema).default([]),
  overallScore: z.number(),
  greenlit: z.boolean(),
  executiveSummary: z.string(),
  mustFix: z.array(z.string()).default([]),
})

// ─── Project ────────────────────────────────────────────────────────

export const PhaseProgressSchema = z.object({
  world: PhaseStatusSchema,
  scale: PhaseStatusSchema,
  structure: PhaseStatusSchema,
  workshop: PhaseStatusSchema,
  validate: PhaseStatusSchema,
})

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  currentPhase: PhaseSchema,
  phaseProgress: PhaseProgressSchema,
  worldAnchor: WorldAnchorSchema.nullable(),
  characters: z.array(CharacterSchema).default([]),
  selectedScalePlanId: z.string().nullable(),
  scalePlanOptions: z.array(ScalePlanSchema).default([]),
  chapters: z.array(ChapterSchema).default([]),
  acts: z.array(ActSchema).default([]),
  nodes: z.array(StoryNodeSchema).default([]),
  variables: z.array(VariableSchema).default([]),
  endings: z.array(EndingSchema).default([]),
  lastValidation: ValidationReportSchema.nullable(),
  directorReview: DirectorReviewSchema.nullable(),
  downstreamStale: z.boolean().optional(),
  schemaVersion: z.number().optional(),
})

export type ProjectSchemaType = z.infer<typeof ProjectSchema>

// ─── 编译期一致性守卫 ────────────────────────────────────────────────
// 若 lib/types/project.ts 的 Project 与本文件的 zod 推导类型出现结构性漂移，
// 下面这行会在 tsc 阶段报错（"never" 与 "true" 不兼容）。
// 注：本文件里刻意放宽（.optional()）的字段不会破坏此守卫——
// TS 中"必填字段"天然满足 zod 推导出的"可选字段"约束。
type _Check = Project extends ProjectSchemaType ? true : never
const _check: _Check = true
void _check
