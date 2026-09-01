import { z } from 'zod'

// ─── World Phase ────────────────────────────────────────────────

export const WorldReviewSchema = z.object({
  consistency: z.enum(['通过', '有风险']),
  structure_analysis: z.string(),
  interactive_potential: z.enum(['高', '中', '低']),
  issues: z.array(z.object({
    field: z.string(),
    issue: z.string(),
    suggestion: z.string(),
  })),
  duration_match: z.enum(['匹配', '偏多', '偏少']),
  overall: z.string(),
})

export const WorldFixIssuesSchema = z.object({
  storyCore: z.string().optional(),
  theme: z.string().optional(),
  genre: z.string().optional(),
  worldRules: z.string().optional(),
})

export const CharacterSchema = z.object({
  name: z.string(),
  role: z.enum(['protagonist', 'antagonist', 'support', 'other']),
  motivation: z.string(),
  relationship: z.string(),
  wound: z.string().optional(),
  lie: z.string().optional(),
  want: z.string().optional(),
  need: z.string().optional(),
})

export const SuggestCharactersSchema = z.object({
  characters: z.array(CharacterSchema),
})

export const VariableSchema = z.object({
  name: z.string(),
  type: z.enum(['flag', 'counter', 'relationship', 'item']),
  defaultValue: z.string(),
  description: z.string(),
})

export const SuggestVariablesSchema = z.object({
  variables: z.array(VariableSchema),
})

export const EndingDesignSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.union([z.enum(['good', 'bad', 'neutral', 'secret']), z.string()]),
  description: z.string().optional(),
  triggerCondition: z.string(),
  avoidCondition: z.string().optional(),
  keyVariable: z.string().optional(),
})

export const EndingsDesignSchema = z.object({
  endings: z.array(EndingDesignSchema),
})
export type EndingsDesign = z.infer<typeof EndingsDesignSchema>

// ─── Scale Phase ─────────────────────────────────────────────────

export const ScalePlanSchema = z.object({
  id: z.string(),
  label: z.string(),
  chapterCount: z.number(),
  actCountPerChapter: z.number().optional(),
  totalNodes: z.number(),
  totalBranches: z.number().optional(),
  branchCount: z.number().optional(),
  chapters: z.array(z.object({
    title: z.string(),
    brief: z.string(),
  })),
  estimatedHours: z.number().optional(),
  aiRationale: z.string().optional(),
})

export const ScaleGenerateSchema = z.object({
  plans: z.array(ScalePlanSchema),
})

// ─── Structure Phase ─────────────────────────────────────────────

export const SpineSchema = z.object({
  throughlines: z.array(z.string()),
  chapter_handoffs: z.array(z.object({
    from: z.coerce.number(),
    to: z.coerce.number(),
    carry_over: z.string(),
  })).optional(),
  character_arcs: z.record(z.string(), z.array(z.string())).optional(),
})
export type Spine = z.infer<typeof SpineSchema>

export const NodeDraftSchema = z.object({
  title: z.string(),
  type: z.union([z.enum(['start', 'normal', 'branch', 'explore', 'ending', 'merge']), z.string()]),
  notes: z.string().optional(),
})

export const ActDraftSchema = z.object({
  title: z.string(),
  nodes: z.array(NodeDraftSchema),
})

export const ChapterDraftSchema = z.object({
  title: z.string(),
  acts: z.array(ActDraftSchema),
})
export type ChapterDraft = z.infer<typeof ChapterDraftSchema>

// ─── Branches Phase ──────────────────────────────────────────────

export const ChoiceDraftSchema = z.object({
  text: z.string(),
  targetNodeId: z.string(),
  variableEffects: z.string().optional(),
  choiceWeight: z.enum(['light', 'heavy', 'critical']).optional(),
  consequence: z.string().optional(),
  conditions: z.string().optional(),
})

export const BranchesGenerateSchema = z.object({
  nodeChoices: z.array(z.object({
    nodeTitle: z.string().optional(),
    nodeId: z.string(),
    exploreReturnNodeId: z.string().optional(),
    choices: z.array(ChoiceDraftSchema),
  })),
})

// ─── Workshop Phase ───────────────────────────────────────────────

export const FillEmotionSchema = z.object({
  emotionIn: z.string(),
  emotionOut: z.string(),
  playerEmotion: z.string().optional(),
  tension: z.number().min(0).max(10),
  internal_lie: z.string().optional(),
  fear: z.string().optional(),
})
export type FillEmotion = z.infer<typeof FillEmotionSchema>

export const DialogueLineSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  emotion: z.string().optional(),
})

export const WriteDialogueSchema = z.object({
  sceneDesc: z.string(),
  dialogue: z.array(DialogueLineSchema),
})
export type WriteDialogue = z.infer<typeof WriteDialogueSchema>

export const SuggestChoicesSchema = z.object({
  choices: z.array(z.object({
    text: z.string(),
    consequence: z.string(),
    longterm: z.string().optional(),
    dramatic_cost: z.string(),
    thematic_resonance: z.string(),
  })),
})
export type SuggestChoices = z.infer<typeof SuggestChoicesSchema>

export const SceneAnalysisSchema = z.object({
  working: z.string(),
  issues: z.array(z.object({
    line: z.string(),
    problem: z.string(),
    fix: z.string(),
  })),
  killer_line: z.string().optional(),
})
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>

export const SceneTensionSchema = z.object({
  tension_diagnosis: z.string(),
  missing_element: z.string(),
  rewrite_suggestion: z.string(),
  upgraded_line: z.string(),
  mcguffin: z.string(),
  dramatic_irony: z.string(),
})
export type SceneTension = z.infer<typeof SceneTensionSchema>

export const CharacterVoiceSchema = z.object({
  speaking_rhythm: z.string(),
  vocabulary: z.string(),
  defense_mechanism: z.string(),
  lie_tells: z.string().optional(),
  sample_lines: z.array(z.string()),
})
export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>

export const ChoiceConsequenceSchema = z.object({
  immediate: z.string(),
  chapter_impact: z.string(),
  ending_probability: z.string(),
  character_cost: z.string(),
  thematic_resonance: z.string(),
  regret_factor: z.string(),
  regret_reason: z.string(),
})
export type ChoiceConsequence = z.infer<typeof ChoiceConsequenceSchema>

// ─── Validate Phase ───────────────────────────────────────────────

export const ValidateReportSchema = z.object({
  summary: z.string(),
  priority_issues: z.array(z.string()),
  suggestions: z.array(z.string()),
})

export const DirectorVerdictSchema = z.object({
  lens: z.string(),
  score: z.number().min(0).max(10),
  observation: z.string(),
  note: z.string(),
})

export const DirectorReviewSchema = z.object({
  verdicts: z.array(DirectorVerdictSchema),
  overallScore: z.number().min(0).max(10),
  greenlit: z.boolean(),
  executiveSummary: z.string(),
  mustFix: z.array(z.string()),
  standout_moment: z.string(),
})
export type DirectorReview = z.infer<typeof DirectorReviewSchema>

// ─── Targeted Fix（FR-19，structure:targeted_fix）──────────────────
// 与 lib/ai/targetedFixTypes.ts 的 TargetedFixResult 一一对应，两边不得各自扩展。

export const NodeRefSchema = z.object({
  nodeId: z.string().optional(),
  nodeTitle: z.string().optional(),
})

const NodeTypeSchema = z.enum(['normal', 'branch', 'merge', 'ending', 'start', 'explore'])

const TargetedFixNewNodeSchema = z.object({
  title: z.string(),
  type: NodeTypeSchema,
  notes: z.string().optional(),
})

const TargetedFixNewChoiceSchema = z.object({
  text: z.string(),
  target: NodeRefSchema,
  conditions: z.string().optional(),
  variableEffects: z.string().optional(),
  consequence: z.string().optional(),
})

const TargetedFixOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    after: NodeRefSchema,
    node: TargetedFixNewNodeSchema,
    reason: z.string(),
  }),
  z.object({
    op: z.literal('update_node'),
    target: NodeRefSchema,
    patch: z.object({
      title: z.string().optional(),
      type: NodeTypeSchema.optional(),
      notes: z.string().optional(),
    }),
    reason: z.string(),
  }),
  z.object({
    op: z.literal('add_choice'),
    target: NodeRefSchema,
    choice: TargetedFixNewChoiceSchema,
    reason: z.string(),
  }),
  z.object({
    op: z.literal('update_choice'),
    target: NodeRefSchema,
    choiceText: z.string(),
    patch: z.object({
      text: z.string().optional(),
      conditions: z.string().optional(),
      variableEffects: z.string().optional(),
      consequence: z.string().optional(),
      targetRef: NodeRefSchema.optional(),
    }),
    reason: z.string(),
  }),
  z.object({
    op: z.literal('set_explore_return'),
    target: NodeRefSchema,
    returnTo: NodeRefSchema,
    reason: z.string(),
  }),
  z.object({
    op: z.literal('bind_ending'),
    target: NodeRefSchema,
    ending: z.object({
      title: z.string(),
      type: z.enum(['good', 'bad', 'neutral', 'secret']),
      description: z.string().optional(),
      conditions: z.string().optional(),
    }),
    reason: z.string(),
  }),
])

export const TargetedFixResultSchema = z.object({
  summary: z.string(),
  ops: z.array(TargetedFixOpSchema).max(25),
})
export type TargetedFixResult = z.infer<typeof TargetedFixResultSchema>

// ─── Schema Registry ─────────────────────────────────────────────

export const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  'world:review': WorldReviewSchema,
  'world:fix_issues': WorldFixIssuesSchema,
  'world:suggest_characters': SuggestCharactersSchema,
  'world:suggest_variables': SuggestVariablesSchema,
  'world:endings_design': EndingsDesignSchema,
  'scale:generate': ScaleGenerateSchema,
  'structure:spine': SpineSchema,
  'structure:chapter': ChapterDraftSchema,
  'structure:targeted_fix': TargetedFixResultSchema,
  'branches:generate': BranchesGenerateSchema,
  'workshop:fill_emotion': FillEmotionSchema,
  'workshop:write_dialogue': WriteDialogueSchema,
  'workshop:revise_dialogue': WriteDialogueSchema,
  'workshop:suggest_choices': SuggestChoicesSchema,
  'workshop:scene_analysis': SceneAnalysisSchema,
  'workshop:scene_tension': SceneTensionSchema,
  'workshop:character_voice': CharacterVoiceSchema,
  'workshop:choice_consequence': ChoiceConsequenceSchema,
  'validate:report': ValidateReportSchema,
  'validate:director_review': DirectorReviewSchema,
}
