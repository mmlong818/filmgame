import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project, StoryNode, Choice, Variable, WorldAnchor, ScalePlan, ValidationReport, Chapter, Act, Character, Ending, EndingDesign } from '@/lib/types/project'
import type { Phase } from '@/lib/types/phase'
import { loadProject, saveProject } from '@/lib/persistence'

const PHASE_ORDER: Phase[] = ['world', 'scale', 'structure', 'workshop', 'validate']

const defaultPhaseProgress = (): Record<Phase, 'locked' | 'in_progress' | 'done'> => ({
  world: 'in_progress',
  scale: 'locked',
  structure: 'locked',
  workshop: 'locked',
  validate: 'locked',
})

export function createEmptyProject(title: string): Project {
  return {
    id: nanoid(8),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentPhase: 'world',
    phaseProgress: defaultPhaseProgress(),
    worldAnchor: null,
    characters: [],
    selectedScalePlanId: null,
    scalePlanOptions: [],
    chapters: [],
    acts: [],
    nodes: [],
    variables: [],
    endings: [],
    lastValidation: null,
    directorReview: null,
    downstreamStale: false,
    schemaVersion: 1,
  }
}

interface ProjectStore {
  project: Project | null
  loadProject: (id: string) => boolean
  setProject: (p: Project) => void

  setWorldAnchor: (anchor: WorldAnchor) => void
  setScalePlanOptions: (plans: ScalePlan[]) => void
  selectScalePlan: (planId: string) => void
  advancePhase: () => void
  goToPhase: (phase: Phase) => void
  clearDownstream: () => void
  clearStaleFlag: () => void

  addCharacter: () => void
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  setCharacters: (characters: Character[]) => void

  addChapter: (title: string) => void
  addAct: (chapterId: string, title: string) => void
  updateAct: (actId: string, patch: Partial<Act>) => void
  bulkSetStructure: (chapters: Chapter[], acts: Act[], nodes: StoryNode[]) => void
  addNode: (actId: string) => StoryNode
  updateNode: (nodeId: string, patch: Partial<StoryNode>) => void
  deleteNode: (nodeId: string) => void

  addChoice: (nodeId: string) => void
  updateChoice: (choiceId: string, patch: Partial<Choice>) => void
  deleteChoice: (choiceId: string) => void

  addVariable: (name: string) => void
  updateVariable: (id: string, patch: Partial<Variable>) => void
  setVariables: (variables: Variable[]) => void

  addEnding: (nodeId: string) => void
  updateEnding: (id: string, patch: Partial<Ending>) => void
  deleteEnding: (id: string) => void
  setEndingsDesign: (endings: EndingDesign[]) => void

  renameProject: (title: string) => void
  setValidationReport: (report: ValidationReport) => void
  setDirectorReview: (review: import('@/lib/types/project').DirectorReview) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,

  loadProject: (id) => {
    const p = loadProject(id)
    if (!p) return false
    set({ project: p })
    return true
  },

  setProject: (p) => set({ project: p }),

  setWorldAnchor: (anchor) => set((s) => {
    if (!s.project) return s
    const changed = JSON.stringify(s.project.worldAnchor) !== JSON.stringify(anchor)
    const p: Project = {
      ...s.project,
      worldAnchor: anchor,
      updatedAt: new Date().toISOString(),
      ...(changed ? { downstreamStale: true } : {}),
    }
    saveProject(p)
    return { project: p }
  }),

  addCharacter: () => set((s) => {
    if (!s.project) return s
    const c: Character = { id: nanoid(8), name: '新角色', role: 'support', motivation: '', relationship: '' }
    const p = { ...s.project, characters: [...s.project.characters, c], updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  updateCharacter: (id, patch) => set((s) => {
    if (!s.project) return s
    const characters = s.project.characters.map(c => c.id === id ? { ...c, ...patch } : c)
    const p = { ...s.project, characters, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  deleteCharacter: (id) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, characters: s.project.characters.filter(c => c.id !== id), updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setCharacters: (characters) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, characters, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setScalePlanOptions: (plans) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, scalePlanOptions: plans, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  selectScalePlan: (planId) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, selectedScalePlanId: planId, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  advancePhase: () => set((s) => {
    if (!s.project) return s
    const cur = PHASE_ORDER.indexOf(s.project.currentPhase)
    if (cur >= PHASE_ORDER.length - 1) return s
    const next = PHASE_ORDER[cur + 1]
    const progress = { ...s.project.phaseProgress }
    progress[s.project.currentPhase] = 'done'
    progress[next] = 'in_progress'
    const p = { ...s.project, currentPhase: next, phaseProgress: progress, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  goToPhase: (phase) => set((s) => {
    if (!s.project) return s
    if (s.project.phaseProgress[phase] === 'locked') return s
    const p = { ...s.project, currentPhase: phase, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  clearDownstream: () => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, scalePlanOptions: [], selectedScalePlanId: null, chapters: [], acts: [], nodes: [], downstreamStale: false, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  clearStaleFlag: () => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, downstreamStale: false, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addChapter: (title) => set((s) => {
    if (!s.project) return s
    const chapter = { id: nanoid(8), title, order: s.project.chapters.length }
    const p = { ...s.project, chapters: [...s.project.chapters, chapter], updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addAct: (chapterId, title) => set((s) => {
    if (!s.project) return s
    const acts = s.project.acts.filter(a => a.chapterId === chapterId)
    const act = { id: nanoid(8), chapterId, title, order: acts.length, nodeIds: [] }
    const p = { ...s.project, acts: [...s.project.acts, act], updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  updateAct: (actId, patch) => set((s) => {
    if (!s.project) return s
    const acts = s.project.acts.map(a => a.id === actId ? { ...a, ...patch } : a)
    const p = { ...s.project, acts, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  bulkSetStructure: (chapters, acts, nodes) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, chapters, acts, nodes, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addNode: (actId) => {
    const node: StoryNode = {
      id: nanoid(8), actId, title: '新节点', type: 'normal', order: 0,
      position: { x: 0, y: 0 },
      emotionFunction: { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 5 },
      systemFunction: { variablesRead: [], variablesWrite: [], requirements: '' },
      sceneDesc: '', dialogue: [], choices: [], durationSeconds: 120, notes: '',
    }
    set((s) => {
      if (!s.project) return s
      const acts = s.project.acts.map(a =>
        a.id === actId ? { ...a, nodeIds: [...a.nodeIds, node.id] } : a
      )
      const p = { ...s.project, acts, nodes: [...s.project.nodes, node], updatedAt: new Date().toISOString() }
      saveProject(p)
      return { project: p }
    })
    return node
  },

  updateNode: (nodeId, patch) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  deleteNode: (nodeId) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({ ...n, choices: n.choices.filter(c => c.targetNodeId !== nodeId) }))
    const acts = s.project.acts.map(a => ({ ...a, nodeIds: a.nodeIds.filter(id => id !== nodeId) }))
    const endings = s.project.endings.filter(e => e.nodeId !== nodeId)
    const p = { ...s.project, nodes, acts, endings, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addChoice: (nodeId) => set((s) => {
    if (!s.project) return s
    const node = s.project.nodes.find(n => n.id === nodeId)
    if (!node) return s
    const choice: Choice = {
      id: nanoid(8), nodeId, text: '新选项', order: node.choices.length,
      targetNodeId: '', conditions: '', variableEffects: '',
    }
    const nodes = s.project.nodes.map(n =>
      n.id === nodeId ? { ...n, choices: [...n.choices, choice] } : n
    )
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  updateChoice: (choiceId, patch) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes.map(n => ({
      ...n,
      choices: n.choices.map(c => c.id === choiceId ? { ...c, ...patch } : c)
    }))
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  deleteChoice: (choiceId) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes.map(n => ({
      ...n, choices: n.choices.filter(c => c.id !== choiceId)
    }))
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addVariable: (name) => set((s) => {
    if (!s.project) return s
    const v: Variable = { id: nanoid(8), name, type: 'flag', defaultValue: '0', description: '' }
    const p = { ...s.project, variables: [...s.project.variables, v], updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  updateVariable: (id, patch) => set((s) => {
    if (!s.project) return s
    const variables = s.project.variables.map(v => v.id === id ? { ...v, ...patch } : v)
    const p = { ...s.project, variables, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setVariables: (variables) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, variables, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  addEnding: (nodeId) => set((s) => {
    if (!s.project) return s
    const ending: Ending = { id: nanoid(8), nodeId, title: '新结局', type: 'neutral', conditions: '', description: '', variableConditions: [], requiredChoiceIds: [], reachPath: '' }
    const p = { ...s.project, endings: [...s.project.endings, ending], updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  updateEnding: (id, patch) => set((s) => {
    if (!s.project) return s
    const endings = s.project.endings.map(e => e.id === id ? { ...e, ...patch } : e)
    const p = { ...s.project, endings, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  deleteEnding: (id) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, endings: s.project.endings.filter(e => e.id !== id), updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setEndingsDesign: (endings) => set((s) => {
    if (!s.project) return s
    const worldAnchor = s.project.worldAnchor ? { ...s.project.worldAnchor, endingsDesign: endings } : null
    const p = { ...s.project, worldAnchor, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  renameProject: (title) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, title, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setValidationReport: (report) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, lastValidation: report, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),

  setDirectorReview: (review) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, directorReview: review, updatedAt: new Date().toISOString() }
    saveProject(p)
    return { project: p }
  }),
}))
