import type { Phase } from './phase'
import type { CondNode, EffectItem } from '../refs/types'

export type AiMode = 'fast' | 'thinking'
export type NodeType = 'normal' | 'branch' | 'merge' | 'ending' | 'start' | 'explore'
export type DramaticWeight = 'setup' | 'tension' | 'payoff' | 'relief' | 'reveal' | 'dilemma'
export type VariableType = 'flag' | 'counter' | 'relationship' | 'item'
export type IssueLevel = 'error' | 'warning' | 'info'

export interface VoiceProfile {
  speaking_rhythm?: string
  vocabulary?: string
  defense_mechanism?: string
  lie_tells?: string
  sample_lines?: string[]
}

export interface AiReview {
  consistency: string
  structure_analysis?: string
  interactive_potential?: string
  issues: Array<{ field: string; issue: string; suggestion: string }>
  duration_match: string
  overall: string
}

export interface Character {
  id: string
  name: string
  role: 'protagonist' | 'antagonist' | 'support' | 'other'
  motivation: string
  relationship: string
  wound?: string
  lie?: string
  want?: string
  need?: string
  voiceProfile?: VoiceProfile
}

export interface EndingDesign {
  id: string
  title: string
  type: 'good' | 'bad' | 'neutral' | 'secret'
  description: string
  triggerCondition: string
  avoidCondition: string
  keyVariable?: string
}

export interface WorldAnchor {
  storyCore: string
  theme: string
  genre: string
  worldRules: string
  durationMinutes: number
  endingCount: number
  endingsDesign?: EndingDesign[]
}

export interface ScalePlanChapter {
  title: string
  brief: string
}

export interface ScalePlan {
  id: string
  label: string
  chapterCount: number
  actCountPerChapter: number
  totalNodes: number
  totalBranches: number
  estimatedHours: number
  aiRationale: string
  chapters?: ScalePlanChapter[]
}

export interface Chapter {
  id: string
  title: string
  order: number
}

export interface Act {
  id: string
  chapterId: string
  title: string
  order: number
  nodeIds: string[]
  dramaticFunction?: 'setup' | 'conflict' | 'turn' | 'resolution'
}

export interface EmotionFunction {
  emotionIn: string
  emotionOut: string
  playerEmotion: string
  tension: number
  internal_lie?: string
  fear?: string
}

export interface SystemFunction {
  variablesRead: string[]
  variablesWrite: string[]
  requirements: string
  /** 引用层（schemaVersion 2）：variablesRead/Write 里绑上的变量 id；只经 lib/refs/bind 写入 */
  readIds?: string[]
  writeIds?: string[]
}

export interface DialogueLine {
  id: string
  speaker: string
  text: string
  emotion: string
  /** 引用层：speaker 命中唯一角色时的角色 id；缺省 = 未绑定（名字自由文本） */
  speakerId?: string
}

export interface Choice {
  id: string
  nodeId: string
  text: string
  order: number
  targetNodeId: string
  conditions: string
  variableEffects: string
  consequence?: string
  choiceWeight?: 'light' | 'heavy' | 'critical'
  /** 引用层：conditions / variableEffects 的结构化真源（AST + varId）；原文串是人机/AI 通道 */
  cond?: CondNode | null
  effects?: EffectItem[]
}

export interface StoryNode {
  id: string
  actId: string
  title: string
  type: NodeType
  order: number
  position: { x: number; y: number }
  positionManual?: boolean
  emotionFunction: EmotionFunction
  systemFunction: SystemFunction
  sceneHeader?: {
    location: string
    timeOfDay: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'CONTINUOUS'
    interior: 'INT' | 'EXT' | 'INT/EXT'
  }
  sceneDesc: string
  dialogue: DialogueLine[]
  choices: Choice[]
  durationSeconds: number
  notes: string
  dramaticWeight?: DramaticWeight
  exploreReturnNodeId?: string
}

export interface Variable {
  id: string
  name: string
  type: VariableType
  defaultValue: string
  description: string
}

export interface EndingCondition {
  variableName: string
  operator: '>=' | '<=' | '==' | '>' | '<' | '!='
  value: number | string
  /** 引用层：variableName 绑上的变量 id */
  variableId?: string
}

export interface Ending {
  id: string
  nodeId: string
  title: string
  type: 'good' | 'bad' | 'neutral' | 'secret'
  description: string
  conditions: string
  variableConditions: EndingCondition[]
  requiredChoiceIds: string[]
  reachPath: string
  /** 引用层：conditions 的 AST（自然语言会落成 raw 节点） */
  cond?: CondNode | null
}

export interface ValidationIssue {
  id: string
  level: IssueLevel
  code: string
  message: string
  relatedIds: string[]
  /** 无具体节点可跳时的兜底去处（相对项目根，如 'structure#endings'）；
      悬空结局定义这类问题没有有效节点，仍需把人送到能改的页面 */
  fixHref?: string
  /** 校验页可直接执行的一键修（期 3）：目前只有「把未登记的变量名登记为变量」 */
  fix?: { kind: 'register_variables'; names: string[] }
}

export interface ValidationReport {
  generatedAt: string
  totalNodes: number
  totalBranches: number
  issues: ValidationIssue[]
  passRate: number
}

export interface DirectorVerdict {
  lens: string
  score: number
  observation: string
  note: string
}

export interface DirectorReview {
  generatedAt: string
  verdicts: DirectorVerdict[]
  overallScore: number
  greenlit: boolean
  executiveSummary: string
  mustFix: string[]
  standout_moment?: string
}

export interface Project {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  currentPhase: Phase
  phaseProgress: Record<Phase, 'locked' | 'in_progress' | 'done'>
  worldAnchor: WorldAnchor | null
  characters: Character[]
  selectedScalePlanId: string | null
  scalePlanOptions: ScalePlan[]
  chapters: Chapter[]
  acts: Act[]
  nodes: StoryNode[]
  variables: Variable[]
  endings: Ending[]
  lastValidation: ValidationReport | null
  directorReview: DirectorReview | null
  downstreamStale?: boolean
  schemaVersion?: number
  /** AI 双模式：fast（快速搭骨架）/ thinking（深度精修）。缺省按 thinking 处理（保持迁移前行为）。 */
  aiMode?: AiMode
}

/** Project 上元素带 id 的数组字段——对账合并（projectStore）与精确撤销（history）都按 id 逐条处理它们 */
export const PROJECT_ID_ARRAY_KEYS = ['nodes', 'characters', 'variables', 'endings', 'acts', 'chapters', 'scalePlanOptions'] as const satisfies readonly (keyof Project)[]

export interface ProjectSummary {
  id: string
  title: string
  updatedAt: string
  currentPhase: Phase
  nodeCount: number
  archived?: boolean
  archivedAt?: string
}
