import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project, StoryNode, Choice, Variable, WorldAnchor, ScalePlan, ValidationReport, Chapter, Act, Character, Ending, EndingDesign, AiMode } from '@/lib/types/project'
import type { Phase } from '@/lib/types/phase'
import { loadLocalSnapshot, writeLocalSnapshot, saveProject, saveProjectMeta, saveNode, setHydrated, clearConflictLock } from '@/lib/persistence'
import type { SaveStateDetail } from '@/lib/persistence'

const PHASE_ORDER: Phase[] = ['world', 'scale', 'structure', 'workshop', 'validate']

const defaultPhaseProgress = (): Record<Phase, 'locked' | 'in_progress' | 'done'> => ({
  world: 'in_progress',
  scale: 'locked',
  structure: 'locked',
  workshop: 'locked',
  validate: 'locked',
})

export function createEmptyProject(title: string, mode: AiMode = 'thinking'): Project {
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
    aiMode: mode,
  }
}

type HydrateResult = 'ok' | 'not-found' | 'error'

interface ProjectStore {
  project: Project | null
  /** 最近一次从服务端确认的整档 version（乐观锁基线）；null 表示未知（未 hydrate 过或离线兜底）。 */
  loadedVersion: number | null
  /** 整档保存收到 409 时置位；UI 提示「已在别处修改，点击加载最新」。 */
  saveConflict: { currentVersion: number } | null
  /** 收到其他标签页的保存广播且版本更新时置位；UI 提示刷新。 */
  stale: boolean
  /** GET 对账（DB 权威数据覆盖 localStorage 乐观 paint）是否已完成；false 期间所有保存请求被 persistence 层丢弃。 */
  hydrated: boolean

  /** 同步：仅从 localStorage 快照乐观 paint（不发网络请求）。供极早期渲染兜底使用。 */
  loadProject: (id: string) => boolean
  /** 异步：先本地快照乐观 paint，再 GET 对账，DB 胜出，记录 loadedVersion。 */
  hydrateProject: (id: string) => Promise<HydrateResult>
  setProject: (p: Project, version?: number) => void
  clearConflict: () => void
  clearStale: () => void

  setWorldAnchor: (anchor: WorldAnchor) => void
  setScalePlanOptions: (plans: ScalePlan[]) => void
  selectScalePlan: (planId: string) => void
  advancePhase: () => void
  goToPhase: (phase: Phase) => void
  clearDownstream: (targetPhase?: Phase) => void
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
  setAiMode: (mode: AiMode) => void
  setValidationReport: (report: ValidationReport) => void
  setDirectorReview: (review: import('@/lib/types/project').DirectorReview) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  loadedVersion: null,
  saveConflict: null,
  stale: false,
  hydrated: false,

  loadProject: (id) => {
    const p = loadLocalSnapshot(id)
    if (!p) return false
    setHydrated(id, false)
    set({ project: p, loadedVersion: null, saveConflict: null, stale: false, hydrated: false })
    return true
  },

  hydrateProject: async (id) => {
    setHydrated(id, false)
    const local = loadLocalSnapshot(id)
    if (local && local.id === id) {
      set({ project: local, loadedVersion: null, saveConflict: null, stale: false, hydrated: false })
    }
    // 网络失败/服务端返回异常时，若已有本地快照允许离线继续工作；此时也视为"对账已完成"
    // （已尽力对账，非无限期悬挂），放行后续保存——真正的离线场景仍由现有重试/排队兜底。
    const fallbackToLocal = (): HydrateResult => {
      if (!local) return 'error'
      setHydrated(id, true)
      set((s) => ({ ...s, hydrated: true }))
      return 'ok'
    }
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (res.status === 404) return 'not-found'
      if (res.status === 401) {
        window.location.href = '/login'
        return 'error'
      }
      if (!res.ok) return fallbackToLocal()
      const data = await res.json()
      if (!data.ok || !data.project) return local ? fallbackToLocal() : 'not-found'
      // DB 胜出：无论本地快照是否存在/是否更新，均以服务端数据为准。
      setHydrated(id, true)
      clearConflictLock(id)
      set({ project: data.project, loadedVersion: data.version ?? null, saveConflict: null, stale: false, hydrated: true })
      writeLocalSnapshot(data.project)
      return 'ok'
    } catch {
      return fallbackToLocal()
    }
  },

  setProject: (p, version) => {
    // 调用方（新建/导入项目）传入的是服务端刚确认落库的权威数据，等同一次成功对账。
    setHydrated(p.id, true)
    set({ project: p, loadedVersion: version ?? null, saveConflict: null, stale: false, hydrated: true })
  },

  clearConflict: () => set({ saveConflict: null }),
  clearStale: () => set({ stale: false }),

  setWorldAnchor: (anchor) => set((s) => {
    if (!s.project) return s
    const changed = JSON.stringify(s.project.worldAnchor) !== JSON.stringify(anchor)
    // 只有下游已经生成过规模方案或结构节点时，世界锚点变更才需要标记"基于旧版本"；
    // 首次填写/AI生成世界锚点阶段（尚无下游产物）不应误报过期
    const hasDownstream = s.project.scalePlanOptions.length > 0 || s.project.nodes.length > 0
    const p: Project = {
      ...s.project,
      worldAnchor: anchor,
      updatedAt: new Date().toISOString(),
      ...(changed && hasDownstream ? { downstreamStale: true } : {}),
    }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  addCharacter: () => set((s) => {
    if (!s.project) return s
    const c: Character = { id: nanoid(8), name: '新角色', role: 'support', motivation: '', relationship: '' }
    const p = { ...s.project, characters: [...s.project.characters, c], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateCharacter: (id, patch) => set((s) => {
    if (!s.project) return s
    const characters = s.project.characters.map(c => c.id === id ? { ...c, ...patch } : c)
    const p = { ...s.project, characters, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  deleteCharacter: (id) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, characters: s.project.characters.filter(c => c.id !== id), updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setCharacters: (characters) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, characters, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setScalePlanOptions: (plans) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, scalePlanOptions: plans, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  selectScalePlan: (planId) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, selectedScalePlanId: planId, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
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
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  goToPhase: (phase) => set((s) => {
    if (!s.project) return s
    if (s.project.phaseProgress[phase] === 'locked') return s
    const p = { ...s.project, currentPhase: phase, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // targetPhase：清空下游内容后，currentPhase 不能继续停留在比实际内容更靠后的阶段
  // （例如已清空 nodes 却仍是 workshop），否则会出现"阶段已到 workshop 但节点数为 0"
  // 这种阶段与内容脱节的不一致状态。若当前阶段已经领先于 targetPhase，回退阶段并把
  // targetPhase 之后的阶段重新锁定；若当前阶段本就未超过 targetPhase，则不改变阶段。
  clearDownstream: (targetPhase) => set((s) => {
    if (!s.project) return s
    let nextPhase = s.project.currentPhase
    let nextProgress = s.project.phaseProgress
    if (targetPhase) {
      const curIdx = PHASE_ORDER.indexOf(s.project.currentPhase)
      const targetIdx = PHASE_ORDER.indexOf(targetPhase)
      if (targetIdx < curIdx) {
        nextPhase = targetPhase
        nextProgress = { ...s.project.phaseProgress }
        PHASE_ORDER.forEach((ph, i) => {
          if (i > targetIdx) nextProgress[ph] = 'locked'
        })
        nextProgress[targetPhase] = 'in_progress'
      }
    }
    const p = { ...s.project, scalePlanOptions: [], selectedScalePlanId: null, chapters: [], acts: [], nodes: [], downstreamStale: false, currentPhase: nextPhase, phaseProgress: nextProgress, updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  clearStaleFlag: () => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, downstreamStale: false, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  addChapter: (title) => set((s) => {
    if (!s.project) return s
    const chapter = { id: nanoid(8), title, order: s.project.chapters.length }
    const p = { ...s.project, chapters: [...s.project.chapters, chapter], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  addAct: (chapterId, title) => set((s) => {
    if (!s.project) return s
    const acts = s.project.acts.filter(a => a.chapterId === chapterId)
    const act = { id: nanoid(8), chapterId, title, order: acts.length, nodeIds: [] }
    const p = { ...s.project, acts: [...s.project.acts, act], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateAct: (actId, patch) => set((s) => {
    if (!s.project) return s
    const acts = s.project.acts.map(a => a.id === actId ? { ...a, ...patch } : a)
    const p = { ...s.project, acts, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 结构批量重写：acts/chapters/nodes 一起变化，走整档保存。
  bulkSetStructure: (chapters, acts, nodes) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, chapters, acts, nodes, updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 新增节点同时改写 acts（nodeIds），节点行与 acts JSONB 都要更新 —— 走整档保存，不走 saveNode。
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
      saveProject(p, s.loadedVersion ?? undefined)
      return { project: p }
    })
    return node
  },

  // 单节点自身字段变化 —— 走节点级保存（只 PATCH 这一条 nodes 行）。
  updateNode: (nodeId, patch) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n)
    const updatedNode = nodes.find(n => n.id === nodeId)
    if (!updatedNode) return s
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  // 删除节点会牵连其它节点的悬空 choices、acts.nodeIds、endings —— 多行联动，走整档保存。
  deleteNode: (nodeId) => set((s) => {
    if (!s.project) return s
    const nodes = s.project.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({ ...n, choices: n.choices.filter(c => c.targetNodeId !== nodeId) }))
    const acts = s.project.acts.map(a => ({ ...a, nodeIds: a.nodeIds.filter(id => id !== nodeId) }))
    const endings = s.project.endings.filter(e => e.nodeId !== nodeId)
    const p = { ...s.project, nodes, acts, endings, updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // choices 内嵌在所属节点的 JSONB data 里 —— 增删改 choice 只需 saveNode 所属节点。
  addChoice: (nodeId) => set((s) => {
    if (!s.project) return s
    const node = s.project.nodes.find(n => n.id === nodeId)
    if (!node) return s
    const choice: Choice = {
      id: nanoid(8), nodeId, text: '新选项', order: node.choices.length,
      targetNodeId: '', conditions: '', variableEffects: '',
    }
    const updatedNode = { ...node, choices: [...node.choices, choice] }
    const nodes = s.project.nodes.map(n => n.id === nodeId ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  updateChoice: (choiceId, patch) => set((s) => {
    if (!s.project) return s
    const owner = s.project.nodes.find(n => n.choices.some(c => c.id === choiceId))
    if (!owner) return s
    const updatedNode = { ...owner, choices: owner.choices.map(c => c.id === choiceId ? { ...c, ...patch } : c) }
    const nodes = s.project.nodes.map(n => n.id === owner.id ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  deleteChoice: (choiceId) => set((s) => {
    if (!s.project) return s
    const owner = s.project.nodes.find(n => n.choices.some(c => c.id === choiceId))
    if (!owner) return s
    const updatedNode = { ...owner, choices: owner.choices.filter(c => c.id !== choiceId) }
    const nodes = s.project.nodes.map(n => n.id === owner.id ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  addVariable: (name) => set((s) => {
    if (!s.project) return s
    const v: Variable = { id: nanoid(8), name, type: 'flag', defaultValue: '0', description: '' }
    const p = { ...s.project, variables: [...s.project.variables, v], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateVariable: (id, patch) => set((s) => {
    if (!s.project) return s
    const variables = s.project.variables.map(v => v.id === id ? { ...v, ...patch } : v)
    const p = { ...s.project, variables, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setVariables: (variables) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, variables, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  addEnding: (nodeId) => set((s) => {
    if (!s.project) return s
    const ending: Ending = { id: nanoid(8), nodeId, title: '新结局', type: 'neutral', conditions: '', description: '', variableConditions: [], requiredChoiceIds: [], reachPath: '' }
    const p = { ...s.project, endings: [...s.project.endings, ending], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateEnding: (id, patch) => set((s) => {
    if (!s.project) return s
    const endings = s.project.endings.map(e => e.id === id ? { ...e, ...patch } : e)
    const p = { ...s.project, endings, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  deleteEnding: (id) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, endings: s.project.endings.filter(e => e.id !== id), updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setEndingsDesign: (endings) => set((s) => {
    if (!s.project) return s
    const worldAnchor = s.project.worldAnchor ? { ...s.project.worldAnchor, endingsDesign: endings } : null
    const p = { ...s.project, worldAnchor, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  renameProject: (title) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, title, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setAiMode: (mode) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, aiMode: mode, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setValidationReport: (report) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, lastValidation: report, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setDirectorReview: (review) => set((s) => {
    if (!s.project) return s
    const p = { ...s.project, directorReview: review, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),
}))

// ─── 多标签页协同（BroadcastChannel）+ 保存状态桥接 ───────────────────
// 只处理整档保存（saveConflict/version/broadcast）：节点级保存没有暴露 per-node version
// （GET /api/projects/:id 不回传各节点 version），多标签页下节点粒度冲突退化为最后写入胜出，
// 结构性变更（走整档保存）仍受完整乐观锁与 stale 提示保护。
if (typeof window !== 'undefined') {
  const channel: BroadcastChannel | null = 'BroadcastChannel' in window ? new BroadcastChannel('filmgame:project') : null

  window.addEventListener('filmgame:save-state', (e) => {
    const detail = (e as CustomEvent<SaveStateDetail>).detail
    if (!detail) return
    const state = useProjectStore.getState()
    if (!state.project || state.project.id !== detail.id) return

    if (detail.state === 'saved') {
      if (detail.nodeId === undefined && detail.version !== undefined) {
        useProjectStore.setState({ loadedVersion: detail.version })
        channel?.postMessage({ id: detail.id, version: detail.version })
      }
    } else if (detail.state === 'conflict' && detail.nodeId === undefined) {
      useProjectStore.setState({ saveConflict: { currentVersion: detail.currentVersion ?? 0 } })
    }
  })

  channel?.addEventListener('message', (e: MessageEvent) => {
    const { id, version } = (e.data ?? {}) as { id?: string; version?: number }
    if (!id) return
    const state = useProjectStore.getState()
    if (!state.project || state.project.id !== id) return
    if (state.loadedVersion != null && version != null && version <= state.loadedVersion) return
    useProjectStore.setState({ stale: true })
  })
}
