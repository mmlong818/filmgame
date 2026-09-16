import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project, StoryNode, Choice, Variable, WorldAnchor, ScalePlan, ValidationReport, Chapter, Act, Character, Ending, EndingDesign, AiMode } from '@/lib/types/project'
import type { Phase } from '@/lib/types/phase'
import { loadLocalSnapshot, writeLocalSnapshot, saveProject, saveProjectMeta, saveNode, setHydrated, clearConflictLock, resetConfirmedVersion } from '@/lib/persistence'
import type { SaveStateDetail } from '@/lib/persistence'
import { bindHistory, pushUndo, clearHistory, isRestoring, invalidateRedo, recordAfterState } from '@/lib/store/history'
import { adoptUnboundVariableRefs, adoptUnboundSpeakers } from '@/lib/refs/adopt'
import { mergeWindowEdits } from '@/lib/store/merge'
import { removeNodes, swapOrder } from '@/lib/store/structureOps'
import { normalizeVarName, normalizeCharName, uniqueName, reconcileByName } from '@/lib/refs/names'
import { bindNodeRefs, bindChoiceRefs, bindEndingRefs, newBindReport } from '@/lib/refs/bind'

/** AI 批量覆盖的入参：id 可缺省，由 store 按名字对账分配（沿用同名旧 id / 新增才发新 id） */
type Incoming<T extends { id: string }> = Omit<T, 'id'> & { id?: string }

// 引用层（docs/plans/2026-09-16-id-refs.md 期 1b）：所有会改动 conditions / variableEffects / speaker /
// variablesRead|Write / 结局条件 的写入最终都汇到下面几个 action，绑定就放在这里——UI 层不必各自记得双写。
const bindNode = (p: Project, node: StoryNode) => bindNodeRefs(node, p.variables, p.characters, newBindReport())
const touchesNodeRefs = (patch: Partial<StoryNode>) => 'dialogue' in patch || 'choices' in patch || 'systemFunction' in patch

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
  /** 最后一次与服务端对齐的快照：冷启动时是乐观 paint 的 localStorage 副本，对账成功后是
      服务端确认副本的深拷贝。作为字段级合并（mergeWindowEdits）的基线常驻——二次对账
      （409 后点「加载最新」、stale 提示刷新）时用它识别本地未落库编辑，避免 DB 副本
      无条件覆盖。曾在水合完成后清空，导致二次对账拿 localStorage（已含本地编辑）当基线，
      合并短路、本地编辑无声丢失。 */
  paintBase: Project | null
  /** GET 对账失败、正以本地快照离线工作：网络保存被门禁挡下（version 基线未知不发绕过乐观锁的写入），等待重连后重新对账并合并本地编辑。 */
  offline: boolean

  /** 同步：仅从 localStorage 快照乐观 paint（不发网络请求）。供极早期渲染兜底使用。 */
  loadProject: (id: string) => boolean
  /** 异步：先本地快照乐观 paint，再 GET 对账，DB 胜出，记录 loadedVersion。 */
  hydrateProject: (id: string) => Promise<HydrateResult>
  setProject: (p: Project, version?: number) => void
  /** 撤销/重做恢复：整档替换当前项目并走整档保存（乐观锁基线沿用服务端确认值）。 */
  restoreSnapshot: (p: Project) => void
  clearConflict: () => void
  clearStale: () => void

  setWorldAnchor: (anchor: WorldAnchor) => void
  setScalePlanOptions: (plans: ScalePlan[]) => void
  selectScalePlan: (planId: string) => void
  advancePhase: () => void
  goToPhase: (phase: Phase) => void
  clearDownstream: (targetPhase?: Phase) => void
  resetStructure: () => void
  clearStaleFlag: () => void

  addCharacter: () => void
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  setCharacters: (characters: Incoming<Character>[]) => void

  addChapter: (title: string) => void
  updateChapter: (chapterId: string, patch: Partial<Chapter>) => void
  /** 级联删除其下全部幕与节点（清理牵连的 choices / endings） */
  deleteChapter: (chapterId: string) => void
  addAct: (chapterId: string, title: string) => void
  updateAct: (actId: string, patch: Partial<Act>) => void
  /** 级联删除其下全部节点 */
  deleteAct: (actId: string) => void
  /** 与相邻同级项交换顺序；已在首/末则不动 */
  moveChapter: (chapterId: string, dir: -1 | 1) => void
  moveAct: (actId: string, dir: -1 | 1) => void
  /** 在所属幕的 nodeIds 内与相邻项交换；nodeIds 是节点顺序的唯一真源，node.order 随之重写 */
  moveNode: (nodeId: string, dir: -1 | 1) => void
  bulkSetStructure: (chapters: Chapter[], acts: Act[], nodes: StoryNode[]) => void
  addNode: (actId: string) => StoryNode
  updateNode: (nodeId: string, patch: Partial<StoryNode>) => void
  deleteNode: (nodeId: string) => void

  addChoice: (nodeId: string) => void
  updateChoice: (choiceId: string, patch: Partial<Choice>) => void
  deleteChoice: (choiceId: string) => void

  addVariable: (name: string) => void
  updateVariable: (id: string, patch: Partial<Variable>) => void
  setVariables: (variables: Incoming<Variable>[]) => void

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
  paintBase: null,
  offline: false,

  loadProject: (id) => {
    const p = loadLocalSnapshot(id)
    if (!p) return false
    if (get().project?.id !== id) clearHistory()
    setHydrated(id, false)
    set({ project: p, paintBase: p, loadedVersion: null, saveConflict: null, stale: false, hydrated: false, offline: false })
    return true
  },

  hydrateProject: async (id) => {
    if (get().project?.id !== id) clearHistory()
    setHydrated(id, false)
    const prior = get()
    let base: Project | null = null
    if (prior.project?.id === id && prior.paintBase?.id === id) {
      // 对账重试（离线兜底后 online / 手动重连）或二次对账（409 冲突后「加载最新」、
      // stale 刷新）：沿用最后一次服务端对齐快照当基线并保留 store 里期间累积的本地编辑；
      // 不能重新用 localStorage 快照当基线——它已含这些编辑，会让合并误判"无改动"。
      base = prior.paintBase
    } else {
      const local = loadLocalSnapshot(id)
      if (local && local.id === id) {
        base = local
        set({ project: local, paintBase: local, loadedVersion: null, saveConflict: null, stale: false, hydrated: false, offline: false })
      }
    }
    // 网络失败/服务端返回异常：若已有本地数据，允许离线继续编辑（写入 localStorage），但保持
    // 未水合——persistence 门禁挡下所有网络保存，绝不在 version 基线未知时发出绕过乐观锁的
    // 写入（否则陈旧快照会无条件覆盖其他设备已落库的新数据）。offline 置位供 UI 提示与重连。
    const fallbackToLocal = (): HydrateResult => {
      const s = get()
      if (!s.project || s.project.id !== id) return 'error'
      set({ offline: true })
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
      if (!data.ok || !data.project) return base ? fallbackToLocal() : 'not-found'
      // DB 胜出，但对账窗口/离线期间的本地编辑按字段级合并到 DB 副本，不静默丢弃。
      const current = get().project
      const { project: merged, changed } = mergeWindowEdits(data.project, base, current?.id === id ? current : null)
      setHydrated(id, true)
      clearConflictLock(id)
      resetConfirmedVersion(id, data.version ?? undefined)
      // paintBase 保留为服务端确认副本的深拷贝（不能与 project 同引用，否则下次合并
      // current === base 短路）；后续本地编辑相对它 diff。整档保存成功时不前进基线
      // （save-state 事件不携带落库内容，用回调时刻的 store.project 会把未保存的编辑
      // 吸进基线导致下次对账误判"无差异"）——已保存的编辑在下次对账 diff 时与 DB 相等，
      // 不会误报，代价可接受。
      set({ project: merged, paintBase: structuredClone(data.project as Project), loadedVersion: data.version ?? null, saveConflict: null, stale: false, hydrated: true, offline: false })
      writeLocalSnapshot(merged)
      // 合并出的本地编辑以刚确认的 DB version 为基线落库；期间再有并发写入会 409 走冲突流程。
      if (changed) saveProject(merged, data.version ?? undefined)
      return 'ok'
    } catch {
      return fallbackToLocal()
    }
  },

  setProject: (p, version) => {
    // 调用方（新建/导入项目）传入的是服务端刚确认落库的权威数据，等同一次成功对账。
    if (get().project?.id !== p.id) clearHistory()
    setHydrated(p.id, true)
    resetConfirmedVersion(p.id, version)
    set({ project: p, paintBase: structuredClone(p), loadedVersion: version ?? null, saveConflict: null, stale: false, hydrated: true, offline: false })
  },

  restoreSnapshot: (p) => set((s) => {
    if (!s.project || s.project.id !== p.id) return s
    const restored: Project = { ...p, updatedAt: new Date().toISOString() }
    saveProject(restored, s.loadedVersion ?? undefined)
    return { project: restored }
  }),

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

  // 角色名在项目内唯一（重名自动加「 2」后缀）：名字→id 的解析才是确定的，见 docs/plans/2026-09-16-id-refs.md 期 0
  addCharacter: () => set((s) => {
    if (!s.project) return s
    const taken = new Set(s.project.characters.map(c => normalizeCharName(c.name)))
    const c: Character = { id: nanoid(8), name: uniqueName('新角色', taken, normalizeCharName, ' '), role: 'support', motivation: '', relationship: '' }
    const p = { ...s.project, characters: [...s.project.characters, c], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateCharacter: (id, patch) => set((s) => {
    if (!s.project) return s
    const prev = s.project.characters.find(c => c.id === id)
    if (patch.name !== undefined) {
      const others = new Set(s.project.characters.filter(c => c.id !== id).map(c => normalizeCharName(c.name)))
      patch = { ...patch, name: uniqueName(patch.name, others, normalizeCharName, ' ') }
    }
    const characters = s.project.characters.map(c => c.id === id ? { ...c, ...patch } : c)
    // 改名：先把此刻按旧名能解析到的未绑定对白认领到 speakerId（原文串不动），再改名字表；
    // 显示经 speakerLabel 自动跟随。只有真认领到东西才碰节点、走整档保存
    const adopted = prev && patch.name !== undefined ? adoptUnboundSpeakers(s.project) : null
    const p = { ...(adopted ?? s.project), characters, updatedAt: new Date().toISOString() }
    if (adopted) saveProject(p, s.loadedVersion ?? undefined)
    else saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  deleteCharacter: (id) => set((s) => {
    if (!s.project) return s
    pushUndo('删除角色', s.project)
    const p = { ...s.project, characters: s.project.characters.filter(c => c.id !== id), updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 按名字对账：同名沿用旧 id，否则「AI 生成角色」一次就让全项目 speakerId 集体悬空
  setCharacters: (incoming) => set((s) => {
    if (!s.project) return s
    pushUndo('批量覆盖角色', s.project)
    const characters = reconcileByName(s.project.characters, incoming, normalizeCharName, () => nanoid(8), ' ')
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
    pushUndo('清空下游内容', s.project)
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
    // nodes 清空后 endings 的 nodeId 全部悬空，必须一并清空（结局设计 endingsDesign 在 worldAnchor 里，不受影响）
    const p = { ...s.project, scalePlanOptions: [], selectedScalePlanId: null, chapters: [], acts: [], nodes: [], endings: [], downstreamStale: false, currentPhase: nextPhase, phaseProgress: nextProgress, updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 「重新 AI 设计」：清空结构内容（保留规模方案）并把阶段回退到 structure。必须同时把
  // workshop/validate 重新锁定，不能只改 currentPhase——否则后续阶段标签仍可点击，会进入
  // "0 节点的工坊"这种阶段与内容脱节的状态。单个 action 一次保存，避免拆成"清空 + 回退阶段"
  // 两个 action 产生两条并发的项目级保存。
  resetStructure: () => set((s) => {
    if (!s.project) return s
    pushUndo('重新设计结构', s.project)
    const structIdx = PHASE_ORDER.indexOf('structure')
    const progress = { ...s.project.phaseProgress }
    PHASE_ORDER.forEach((ph, i) => { if (i > structIdx) progress[ph] = 'locked' })
    progress.structure = 'in_progress'
    const p: Project = { ...s.project, chapters: [], acts: [], nodes: [], endings: [], currentPhase: 'structure', phaseProgress: progress, updatedAt: new Date().toISOString() }
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

  updateChapter: (chapterId, patch) => set((s) => {
    if (!s.project) return s
    const chapters = s.project.chapters.map(c => c.id === chapterId ? { ...c, ...patch } : c)
    const p = { ...s.project, chapters, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  deleteChapter: (chapterId) => set((s) => {
    if (!s.project) return s
    pushUndo('删除章', s.project)
    const actIds = new Set(s.project.acts.filter(a => a.chapterId === chapterId).map(a => a.id))
    const nodeIds = new Set(s.project.acts.filter(a => actIds.has(a.id)).flatMap(a => a.nodeIds))
    const removed = removeNodes(s.project, nodeIds)
    const p = {
      ...s.project, ...removed,
      acts: removed.acts.filter(a => !actIds.has(a.id)),
      chapters: s.project.chapters.filter(c => c.id !== chapterId),
      updatedAt: new Date().toISOString(),
    }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  moveChapter: (chapterId, dir) => set((s) => {
    if (!s.project) return s
    const orderOf = swapOrder(s.project.chapters, chapterId, dir)
    if (!orderOf) return s
    const chapters = s.project.chapters.map(c => ({ ...c, order: orderOf.get(c.id) ?? c.order }))
    const p = { ...s.project, chapters, updatedAt: new Date().toISOString() }
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

  deleteAct: (actId) => set((s) => {
    if (!s.project) return s
    const act = s.project.acts.find(a => a.id === actId)
    if (!act) return s
    pushUndo('删除幕', s.project)
    const removed = removeNodes(s.project, new Set(act.nodeIds))
    const p = { ...s.project, ...removed, acts: removed.acts.filter(a => a.id !== actId), updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  moveAct: (actId, dir) => set((s) => {
    if (!s.project) return s
    const act = s.project.acts.find(a => a.id === actId)
    if (!act) return s
    const orderOf = swapOrder(s.project.acts.filter(a => a.chapterId === act.chapterId), actId, dir)
    if (!orderOf) return s
    const acts = s.project.acts.map(a => orderOf.has(a.id) ? { ...a, order: orderOf.get(a.id)! } : a)
    const p = { ...s.project, acts, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 改了 acts.nodeIds 又重写节点 order —— 跨行，走整档保存
  moveNode: (nodeId, dir) => set((s) => {
    if (!s.project) return s
    const act = s.project.acts.find(a => a.nodeIds.includes(nodeId))
    if (!act) return s
    const i = act.nodeIds.indexOf(nodeId)
    const j = i + dir
    if (j < 0 || j >= act.nodeIds.length) return s
    const nodeIds = [...act.nodeIds]
    ;[nodeIds[i], nodeIds[j]] = [nodeIds[j], nodeIds[i]]
    const orderOf = new Map(nodeIds.map((id, idx) => [id, idx]))
    const acts = s.project.acts.map(a => a.id === act.id ? { ...a, nodeIds } : a)
    const nodes = s.project.nodes.map(n => orderOf.has(n.id) && n.order !== orderOf.get(n.id) ? { ...n, order: orderOf.get(n.id)! } : n)
    const p = { ...s.project, acts, nodes, updatedAt: new Date().toISOString() }
    saveProject(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 结构批量重写：acts/chapters/nodes 一起变化，走整档保存。
  bulkSetStructure: (chapters, acts, nodes) => set((s) => {
    if (!s.project) return s
    if (s.project.nodes.length > 0 || s.project.chapters.length > 0) pushUndo('结构批量覆盖', s.project)
    // 结构被整体替换后，绑定在旧节点上的结局实例是悬空引用，只保留仍指向现存节点的
    const nodeIds = new Set(nodes.map(n => n.id))
    const endings = s.project.endings.filter(e => nodeIds.has(e.nodeId))
    // AI 生成/定向重构落库的节点带的是名字串，这里统一解析绑定（调用方须先把孤儿变量登记进变量表）
    const boundNodes = nodes.map(n => bindNode(s.project!, n))
    const p = { ...s.project, chapters, acts, nodes: boundNodes, endings, updatedAt: new Date().toISOString() }
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
    const prev = s.project.nodes.find(n => n.id === nodeId)
    if (!prev) return s
    // ending / explore 没有出边（explore 靠 exploreReturnNodeId 回主线）。改成这两类时
    // 一并清掉 choices：否则校验引擎沿残留 choices 算可达、预览却不渲染选项，报告全绿玩家却卡死。
    const dropChoices = (patch.type === 'ending' || patch.type === 'explore') && prev.choices.length > 0
    if (dropChoices) pushUndo('修改节点类型', s.project)
    const merged = { ...prev, ...patch, ...(dropChoices ? { choices: [] } : {}) }
    const updatedNode = touchesNodeRefs(patch) ? bindNode(s.project, merged) : merged
    const nodes = s.project.nodes.map(n => n.id === nodeId ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  // 删除节点会牵连其它节点的悬空 choices、acts.nodeIds、endings —— 多行联动，走整档保存。
  deleteNode: (nodeId) => set((s) => {
    if (!s.project) return s
    pushUndo('删除节点', s.project)
    const p = { ...s.project, ...removeNodes(s.project, new Set([nodeId])), updatedAt: new Date().toISOString() }
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
    const rebind = 'conditions' in patch || 'variableEffects' in patch
    const updatedNode = {
      ...owner,
      choices: owner.choices.map(c => {
        if (c.id !== choiceId) return c
        const next = { ...c, ...patch }
        return rebind ? bindChoiceRefs(next, s.project!.variables, newBindReport()) : next
      }),
    }
    const nodes = s.project.nodes.map(n => n.id === owner.id ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  deleteChoice: (choiceId) => set((s) => {
    if (!s.project) return s
    pushUndo('删除选项', s.project)
    const owner = s.project.nodes.find(n => n.choices.some(c => c.id === choiceId))
    if (!owner) return s
    const updatedNode = { ...owner, choices: owner.choices.filter(c => c.id !== choiceId) }
    const nodes = s.project.nodes.map(n => n.id === owner.id ? updatedNode : n)
    const p = { ...s.project, nodes, updatedAt: new Date().toISOString() }
    writeLocalSnapshot(p)
    saveNode(p.id, updatedNode)
    return { project: p }
  }),

  // 变量名在项目内唯一（重名自动加 _2 后缀，保持合法标识符），理由同 addCharacter
  addVariable: (name) => set((s) => {
    if (!s.project) return s
    const taken = new Set(s.project.variables.map(v => normalizeVarName(v.name)))
    const v: Variable = { id: nanoid(8), name: uniqueName(name, taken, normalizeVarName), type: 'flag', defaultValue: '0', description: '' }
    const p = { ...s.project, variables: [...s.project.variables, v], updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  updateVariable: (id, patch) => set((s) => {
    if (!s.project) return s
    const prev = s.project.variables.find(v => v.id === id)
    if (patch.name !== undefined) {
      const others = new Set(s.project.variables.filter(v => v.id !== id).map(v => normalizeVarName(v.name)))
      patch = { ...patch, name: uniqueName(patch.name, others, normalizeVarName) }
    }
    const variables = s.project.variables.map(v => v.id === id ? { ...v, ...patch } : v)
    // 改名：先把此刻按旧名能解析到的未绑定引用认领到 varId（原文串不动、不再字符串重写），再改名字表；
    // 预览/校验/导出经 refLabel 自动跟随。只有真认领到东西才碰节点、走整档保存
    const adopted = prev && patch.name !== undefined ? adoptUnboundVariableRefs(s.project) : null
    const p = { ...(adopted ?? s.project), variables, updatedAt: new Date().toISOString() }
    if (adopted) saveProject(p, s.loadedVersion ?? undefined)
    else saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  // 按名字对账：同名沿用旧 id，否则「AI 建议变量」一次就让全项目变量引用集体悬空
  setVariables: (incoming) => set((s) => {
    if (!s.project) return s
    pushUndo('批量覆盖变量', s.project)
    const variables = reconcileByName(s.project.variables, incoming, normalizeVarName, () => nanoid(8))
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
    const rebind = 'conditions' in patch || 'variableConditions' in patch
    const endings = s.project.endings.map(e => {
      if (e.id !== id) return e
      const next = { ...e, ...patch }
      return rebind ? bindEndingRefs(next, s.project!.variables, newBindReport()) : next
    })
    const p = { ...s.project, endings, updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  deleteEnding: (id) => set((s) => {
    if (!s.project) return s
    pushUndo('删除结局', s.project)
    const p = { ...s.project, endings: s.project.endings.filter(e => e.id !== id), updatedAt: new Date().toISOString() }
    saveProjectMeta(p, s.loadedVersion ?? undefined)
    return { project: p }
  }),

  setEndingsDesign: (endings) => set((s) => {
    if (!s.project) return s
    pushUndo('覆盖结局设计', s.project)
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

// 撤销/重做恢复通道（history.ts 不反向依赖本模块）
bindHistory({
  getProject: () => useProjectStore.getState().project,
  restore: (p) => useProjectStore.getState().restoreSnapshot(p),
})

// 撤销之后的任何新编辑都使重做快照过期——继续重做会用旧快照整档覆盖新编辑。
// 大量非破坏性 action（updateNode/updateChoice/setWorldAnchor…）不经过 pushUndo，
// 无法靠逐个 action 清 redo 栈（必有遗漏），改在 store 唯一出口统一拦截：
// 同一项目内的 project 引用变化、且不是 undo/redo 恢复本身引起的，一律清空 redo 栈。
// （跨项目切换由 clearHistory 处理；hydrate 对账更新同样清空——对账合并了远端数据，
// 旧的重做快照同样过期。）
useProjectStore.subscribe((state, prev) => {
  if (
    state.project && prev.project &&
    state.project !== prev.project &&
    state.project.id === prev.project.id &&
    !isRestoring()
  ) {
    invalidateRedo()
    // pushUndo 在 action 的 set 回调内调用，因此紧随其后的第一次变更就是该 action 的结果——
    // 记为「动作后」快照，供撤销时只回退动作触碰的条目、保留其后的编辑（见 history.revertTouched）
    recordAfterState(state.project)
  }
})

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
      // 节点级保存现在同样推进 projects.version 并回传，一并更新基线与广播——
      // 其它标签页据此显示 stale 提示（此前节点编辑对它们完全不可见，会被整档保存覆盖）
      if (detail.version !== undefined) {
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
