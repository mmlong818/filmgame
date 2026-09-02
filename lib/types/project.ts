import type { Phase } from './phase'

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
}

export interface DialogueLine {
  id: string
  speaker: string
  text: string
  emotion: string
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

export interface ProjectSummary {
  id: string
  title: string
  updatedAt: string
  currentPhase: Phase
  nodeCount: number
  archived?: boolean
  archivedAt?: string
}
