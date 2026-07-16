// DB 为唯一真源的客户端持久化层（方向 B / Task 8）。
// - 整档保存：防抖(700ms) POST /api/projects/:id，带乐观锁 version。
// - 节点保存：防抖(700ms) PATCH /api/projects/:id/nodes/:nodeId。
// - 新建项目：立即（不防抖）POST /api/projects，确保路由跳转前项目已在服务端存在。
// - localStorage 仅作乐观 paint + 离线兜底缓存（filmgame:project:<id>），不再是权威源；
//   写入失败/离线时排队进 filmgame:pending:<id>，`online` 事件时自动 flush。
// - 保存状态通过 window 事件 `filmgame:save-state` 广播，供 UI（如保存指示器）监听。
import type { Project, StoryNode } from './types/project'
import { conditionsToInk, parseEffectPart } from './conditions'

const projectKey = (id: string) => `filmgame:project:${id}`
const pendingKey = (id: string) => `filmgame:pending:${id}`
const PENDING_PREFIX = 'filmgame:pending:'

// 旧版（v0.2.0 localStorage-first）遗留键——本文件不再维护它们的索引语义，
// 仅在一次性导入流（Task 9 Step 2）里读取。
const LEGACY_INDEX_KEY = 'filmgame:projects:index'
const LEGACY_ARCHIVE_INDEX_KEY = 'filmgame:projects:archive-index'
const legacyArchiveProjectKey = (id: string) => `filmgame:archive:${id}`
const LEGACY_IMPORT_DONE_KEY = 'filmgame:legacy-import-done'

export interface SaveStateDetail {
  state: 'saving' | 'saved' | 'error' | 'conflict'
  id: string
  nodeId?: string
  version?: number
  currentVersion?: number
}

function dispatchSaveState(detail: SaveStateDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SaveStateDetail>('filmgame:save-state', { detail }))
}

// ─── hydration 门禁 + 409 冲突锁 ─────────────────────────────────────────
// hydrated：GET 对账（DB 权威数据覆盖 localStorage 乐观 paint）完成前，本文件的
// saveProject/saveNode/saveProjectMeta 一律不发出网络请求——乐观 paint 只用于渲染，
// 不能触发保存副作用，否则会把尚未被纠正的旧快照写回服务器。
// conflictLock：整档/元数据/节点保存收到 409 后即锁定该项目 id，此后所有自动保存
// （含 debounce 触发、离线队列 flush）直接短路拒绝，直到用户主动"加载最新"重新对账成功。
const hydratedIds = new Set<string>()
const conflictLockedIds = new Set<string>()

export function setHydrated(id: string, value: boolean): void {
  if (value) hydratedIds.add(id)
  else hydratedIds.delete(id)
}

function isHydrated(id: string): boolean {
  return hydratedIds.has(id)
}

export function clearConflictLock(id: string): void {
  conflictLockedIds.delete(id)
}

function isConflictLocked(id: string): boolean {
  return conflictLockedIds.has(id)
}

function lockConflict(id: string): void {
  conflictLockedIds.add(id)
}

/** 401 时统一跳转登录页；其余状态原样透传给调用方处理。 */
async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
  }
  return res
}

// ─── localStorage 快照（乐观 paint + 离线兜底，非权威） ──────────────────

export function loadLocalSnapshot(id: string): Project | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(projectKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeLocalSnapshotImmediate(project: Project): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(projectKey(project.id), JSON.stringify(project))
  } catch (e) {
    console.error('[persistence] localStorage 写入失败（可能已满）:', e)
    window.dispatchEvent(new CustomEvent('filmgame:storage-error', {
      detail: { message: '本地存储空间不足，请前往项目列表清理旧项目' },
    }))
  }
}

const lsTimers = new Map<string, ReturnType<typeof setTimeout>>()
const LS_DEBOUNCE_MS = 300

/** 防抖写入最近快照，供乐观 paint 与离线兜底使用。不是权威源。 */
export function writeLocalSnapshot(project: Project): void {
  if (typeof window === 'undefined') return
  const existing = lsTimers.get(project.id)
  if (existing) clearTimeout(existing)
  lsTimers.set(project.id, setTimeout(() => {
    lsTimers.delete(project.id)
    writeLocalSnapshotImmediate(project)
  }, LS_DEBOUNCE_MS))
}

export function removeLocalSnapshot(id: string): void {
  if (typeof window === 'undefined') return
  const timer = lsTimers.get(id)
  if (timer) { clearTimeout(timer); lsTimers.delete(id) }
  localStorage.removeItem(projectKey(id))
}

// ─── 离线兜底队列（filmgame:pending:<id>） ───────────────────────────────

type PendingOp =
  | { kind: 'project'; project: Project; expectedVersion?: number }
  | { kind: 'projectMeta'; project: Project; expectedVersion?: number }
  | { kind: 'node'; node: StoryNode; expectedVersion?: number }

function readPending(id: string): PendingOp[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(pendingKey(id))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function writePending(id: string, ops: PendingOp[]): void {
  if (typeof window === 'undefined') return
  try {
    if (ops.length === 0) localStorage.removeItem(pendingKey(id))
    else localStorage.setItem(pendingKey(id), JSON.stringify(ops))
  } catch { /* ignore：兜底队列写入失败没有更下游的兜底，只能放弃 */ }
}

function matchesPendingOp(existing: PendingOp, op: PendingOp): boolean {
  if (op.kind === 'node') return existing.kind === 'node' && existing.node.id === op.node.id
  return existing.kind === op.kind
}

function enqueuePending(id: string, op: PendingOp): void {
  const ops = readPending(id).filter((existing) => !matchesPendingOp(existing, op))
  ops.push(op)
  writePending(id, ops)
}

function dequeuePending(id: string, op: PendingOp): void {
  const ops = readPending(id).filter((existing) => !matchesPendingOp(existing, op))
  writePending(id, ops)
}

// ─── 网络发送：指数退避重试 3 次 ──────────────────────────────────────

type SendResult =
  | { ok: true; data: { ok: true; project?: Project; node?: StoryNode; version?: number } }
  | { ok: false; conflict: { currentVersion: number } }
  | { ok: false; fatal: true } // 401，已跳转登录，调用方不应重试/入队
  | { ok: false } // 重试耗尽

const RETRY_DELAYS_MS = [1000, 2000, 4000]

async function sendWithRetry(url: string, body: unknown, method: 'POST' | 'PATCH'): Promise<SendResult> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) return { ok: false, fatal: true }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        return { ok: false, conflict: { currentVersion: data.currentVersion ?? 0 } }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'unknown error')
      return { ok: true, data }
    } catch {
      if (attempt === RETRY_DELAYS_MS.length) return { ok: false }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }
  return { ok: false }
}

// ─── 整档保存（防抖） ────────────────────────────────────────────────

const projectSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 700

/** 防抖(700ms) 整档保存。expectedVersion 传入即启用乐观锁（409 冲突检测）。 */
export function saveProject(project: Project, expectedVersion?: number): void {
  if (typeof window === 'undefined') return
  writeLocalSnapshot(project)
  if (!isHydrated(project.id)) return // 对账未完成：乐观 paint 不能触发保存副作用
  if (isConflictLocked(project.id)) {
    dispatchSaveState({ state: 'conflict', id: project.id })
    return
  }

  const existing = projectSaveTimers.get(project.id)
  if (existing) clearTimeout(existing)
  projectSaveTimers.set(project.id, setTimeout(() => {
    projectSaveTimers.delete(project.id)
    void performProjectSave(project, expectedVersion)
  }, DEBOUNCE_MS))
}

async function performProjectSave(project: Project, expectedVersion?: number): Promise<void> {
  if (isConflictLocked(project.id)) {
    dispatchSaveState({ state: 'conflict', id: project.id })
    return
  }
  dispatchSaveState({ state: 'saving', id: project.id })
  const body = expectedVersion !== undefined ? { ...project, version: expectedVersion } : project
  const result = await sendWithRetry(`/api/projects/${project.id}`, body, 'POST')

  if (result.ok) {
    // saveProject 仓储层是 project.version 的唯一 mutator：expectedVersion 校验通过后
    // 服务端必为 expectedVersion+1（见 lib/db/projects.ts saveProject）；未知基线时无法推算，version 留空。
    const version = expectedVersion !== undefined ? expectedVersion + 1 : undefined
    dispatchSaveState({ state: 'saved', id: project.id, version })
    dequeuePending(project.id, { kind: 'project', project, expectedVersion })
    return
  }
  if ('conflict' in result) {
    lockConflict(project.id)
    dispatchSaveState({ state: 'conflict', id: project.id, currentVersion: result.conflict.currentVersion })
    return
  }
  if ('fatal' in result) return // 401 已跳转登录

  enqueuePending(project.id, { kind: 'project', project, expectedVersion })
  dispatchSaveState({ state: 'error', id: project.id })
}

/** 立即（不防抖）创建新项目，用于「新建/导入」流程——路由跳转前必须确认服务端已落库。 */
export async function createProject(
  project: Project,
): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  writeLocalSnapshotImmediate(project)
  dispatchSaveState({ state: 'saving', id: project.id })
  try {
    const res = await authFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }))
    if (res.ok && data.ok) {
      dispatchSaveState({ state: 'saved', id: project.id, version: 1 })
      return { ok: true, project: data.project as Project }
    }
    dispatchSaveState({ state: 'error', id: project.id })
    return { ok: false, error: data.error || `HTTP ${res.status}` }
  } catch (err) {
    dispatchSaveState({ state: 'error', id: project.id })
    return { ok: false, error: String(err) }
  }
}

// ─── 项目级元数据保存（防抖，PATCH，不触碰 nodes 表） ────────────────────

const projectMetaSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 防抖(700ms) 项目元数据保存：只 PATCH projects 行的非 nodes 字段（角色/变量/结局定义、
 * worldAnchor、acts、chapters、phase、validationReport、directorReview 等），
 * 不携带/不触碰 nodes 表，避免调用方内存里的陈旧 nodes 快照覆盖数据库最新节点内容。
 */
export function saveProjectMeta(project: Project, expectedVersion?: number): void {
  if (typeof window === 'undefined') return
  writeLocalSnapshot(project)
  if (!isHydrated(project.id)) return
  if (isConflictLocked(project.id)) {
    dispatchSaveState({ state: 'conflict', id: project.id })
    return
  }

  const existing = projectMetaSaveTimers.get(project.id)
  if (existing) clearTimeout(existing)
  projectMetaSaveTimers.set(project.id, setTimeout(() => {
    projectMetaSaveTimers.delete(project.id)
    void performProjectMetaSave(project, expectedVersion)
  }, DEBOUNCE_MS))
}

async function performProjectMetaSave(project: Project, expectedVersion?: number): Promise<void> {
  if (isConflictLocked(project.id)) {
    dispatchSaveState({ state: 'conflict', id: project.id })
    return
  }
  dispatchSaveState({ state: 'saving', id: project.id })
  const body = expectedVersion !== undefined ? { ...project, version: expectedVersion } : project
  const result = await sendWithRetry(`/api/projects/${project.id}`, body, 'PATCH')

  if (result.ok) {
    const version = expectedVersion !== undefined ? expectedVersion + 1 : undefined
    dispatchSaveState({ state: 'saved', id: project.id, version })
    dequeuePending(project.id, { kind: 'projectMeta', project, expectedVersion })
    return
  }
  if ('conflict' in result) {
    lockConflict(project.id)
    dispatchSaveState({ state: 'conflict', id: project.id, currentVersion: result.conflict.currentVersion })
    return
  }
  if ('fatal' in result) return

  enqueuePending(project.id, { kind: 'projectMeta', project, expectedVersion })
  dispatchSaveState({ state: 'error', id: project.id })
}

// ─── 节点级保存（防抖） ──────────────────────────────────────────────

const nodeSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 防抖(700ms) 单节点保存，仅写一条小体积 PATCH，避免整档保存的写放大。 */
export function saveNode(projectId: string, node: StoryNode, expectedVersion?: number): void {
  if (typeof window === 'undefined') return
  if (!isHydrated(projectId)) return
  if (isConflictLocked(projectId)) {
    dispatchSaveState({ state: 'conflict', id: projectId, nodeId: node.id })
    return
  }
  const timerKey = `${projectId}:${node.id}`
  const existing = nodeSaveTimers.get(timerKey)
  if (existing) clearTimeout(existing)
  nodeSaveTimers.set(timerKey, setTimeout(() => {
    nodeSaveTimers.delete(timerKey)
    void performNodeSave(projectId, node, expectedVersion)
  }, DEBOUNCE_MS))
}

async function performNodeSave(projectId: string, node: StoryNode, expectedVersion?: number): Promise<void> {
  if (isConflictLocked(projectId)) {
    dispatchSaveState({ state: 'conflict', id: projectId, nodeId: node.id })
    return
  }
  dispatchSaveState({ state: 'saving', id: projectId, nodeId: node.id })
  const body = expectedVersion !== undefined ? { node, version: expectedVersion } : { node }
  const result = await sendWithRetry(`/api/projects/${projectId}/nodes/${node.id}`, body, 'PATCH')

  if (result.ok) {
    dispatchSaveState({ state: 'saved', id: projectId, nodeId: node.id })
    dequeuePending(projectId, { kind: 'node', node, expectedVersion })
    return
  }
  if ('conflict' in result) {
    lockConflict(projectId)
    dispatchSaveState({ state: 'conflict', id: projectId, nodeId: node.id, currentVersion: result.conflict.currentVersion })
    return
  }
  if ('fatal' in result) return

  enqueuePending(projectId, { kind: 'node', node, expectedVersion })
  dispatchSaveState({ state: 'error', id: projectId, nodeId: node.id })
}

// ─── 离线 flush（`online` 事件触发） ─────────────────────────────────
// 三个 flushXOp 分别对应 PendingOp 的三种 kind，返回 false 时 flushPendingForId 停止
// 继续处理剩余待发送项（409 冲突需用户决策；仍失败/离线则保留队列等待下次 online）。

async function flushProjectOp(id: string, op: Extract<PendingOp, { kind: 'project' }>): Promise<boolean> {
  const body = op.expectedVersion !== undefined ? { ...op.project, version: op.expectedVersion } : op.project
  const result = await sendWithRetry(`/api/projects/${id}`, body, 'POST')
  if (result.ok) {
    dequeuePending(id, op)
    const version = op.expectedVersion !== undefined ? op.expectedVersion + 1 : undefined
    dispatchSaveState({ state: 'saved', id, version })
    return true
  }
  if ('conflict' in result) {
    lockConflict(id)
    dispatchSaveState({ state: 'conflict', id, currentVersion: result.conflict.currentVersion })
  }
  return false
}

async function flushProjectMetaOp(id: string, op: Extract<PendingOp, { kind: 'projectMeta' }>): Promise<boolean> {
  const body = op.expectedVersion !== undefined ? { ...op.project, version: op.expectedVersion } : op.project
  const result = await sendWithRetry(`/api/projects/${id}`, body, 'PATCH')
  if (result.ok) {
    dequeuePending(id, op)
    const version = op.expectedVersion !== undefined ? op.expectedVersion + 1 : undefined
    dispatchSaveState({ state: 'saved', id, version })
    return true
  }
  if ('conflict' in result) {
    lockConflict(id)
    dispatchSaveState({ state: 'conflict', id, currentVersion: result.conflict.currentVersion })
  }
  return false
}

async function flushNodeOp(id: string, op: Extract<PendingOp, { kind: 'node' }>): Promise<boolean> {
  const body = op.expectedVersion !== undefined ? { node: op.node, version: op.expectedVersion } : { node: op.node }
  const result = await sendWithRetry(`/api/projects/${id}/nodes/${op.node.id}`, body, 'PATCH')
  if (result.ok) {
    dequeuePending(id, op)
    dispatchSaveState({ state: 'saved', id, nodeId: op.node.id })
    return true
  }
  if ('conflict' in result) {
    lockConflict(id)
    dispatchSaveState({ state: 'conflict', id, nodeId: op.node.id, currentVersion: result.conflict.currentVersion })
  }
  return false
}

async function flushPendingForId(id: string): Promise<void> {
  if (isConflictLocked(id)) {
    dispatchSaveState({ state: 'conflict', id })
    return
  }
  for (const op of readPending(id)) {
    const ok = op.kind === 'project' ? await flushProjectOp(id, op)
      : op.kind === 'projectMeta' ? await flushProjectMetaOp(id, op)
      : await flushNodeOp(id, op)
    if (!ok) return
  }
}

/** 扫描所有 filmgame:pending:* 键并逐一 flush。手动调用或 `online` 事件触发。 */
export function flushPending(): void {
  if (typeof window === 'undefined') return
  const ids: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PENDING_PREFIX)) ids.push(key.slice(PENDING_PREFIX.length))
  }
  for (const id of ids) void flushPendingForId(id)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushPending())
}

// ─── 一次性 localStorage 遗留数据导入（Task 9 Step 2） ──────────────────
// 旧版（v0.2.0）把 localStorage 当作权威源，索引/项目/归档键与当前的「快照缓存」共用同一
// 键格式（filmgame:project:<id> 等）。升级后这批数据可能包含从未同步到服务端的草稿，
// 需要在项目列表页提示用户一次性导入。全程非破坏：导入成功前不删除任何 localStorage 键；
// 全部成功后只写一个 marker 键，不物理删除旧键。

interface LegacySummary { id: string; updatedAt?: string }

function readLegacyIndex(key: string): LegacySummary[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((s): s is LegacySummary => !!s && typeof s.id === 'string') : []
  } catch { return [] }
}

function isValidLegacyProject(doc: unknown): doc is Project {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as Record<string, unknown>
  return typeof d.id === 'string' && typeof d.title === 'string' && Array.isArray(d.nodes)
}

/** 项目列表页用于判断是否展示「检测到本地未同步数据」提示。 */
export function hasUnimportedLegacyData(): boolean {
  if (typeof window === 'undefined') return false
  if (localStorage.getItem(LEGACY_IMPORT_DONE_KEY)) return false
  return readLegacyIndex(LEGACY_INDEX_KEY).length > 0 || readLegacyIndex(LEGACY_ARCHIVE_INDEX_KEY).length > 0
}

export interface LegacyImportReport {
  imported: number
  skipped: number
  failed: number
  failures: Array<{ id: string; reason: string }>
}

/** 扫描旧版 localStorage 键，按 id+updatedAt 去重后一次性 POST 导入到服务端。非破坏。 */
export async function importLegacyLocalData(): Promise<LegacyImportReport> {
  const report: LegacyImportReport = { imported: 0, skipped: 0, failed: 0, failures: [] }
  if (typeof window === 'undefined') return report

  let serverProjects: Array<{ id: string; updatedAt: string }> = []
  try {
    const res = await authFetch('/api/projects?archived=true')
    const data = await res.json()
    if (data.ok && Array.isArray(data.projects)) serverProjects = data.projects
  } catch { /* 网络失败：仍尝试导入，服务端 upsert 会覆盖，不会丢数据 */ }
  const serverMap = new Map(serverProjects.map((p) => [p.id, p.updatedAt]))

  const candidates: Array<{ id: string; archived: boolean }> = [
    ...readLegacyIndex(LEGACY_INDEX_KEY).map((s) => ({ id: s.id, archived: false })),
    ...readLegacyIndex(LEGACY_ARCHIVE_INDEX_KEY).map((s) => ({ id: s.id, archived: true })),
  ]

  for (const { id, archived } of candidates) {
    const rawKey = archived ? legacyArchiveProjectKey(id) : projectKey(id)
    try {
      const raw = localStorage.getItem(rawKey)
      if (!raw) { report.skipped++; continue }
      const doc = JSON.parse(raw)
      if (!isValidLegacyProject(doc)) {
        report.failed++
        report.failures.push({ id, reason: '缺少必要字段（id/title/nodes）' })
        continue
      }
      const serverUpdatedAt = serverMap.get(id)
      if (serverUpdatedAt && new Date(serverUpdatedAt).getTime() >= new Date(doc.updatedAt ?? 0).getTime()) {
        report.skipped++
        continue
      }
      const res = await authFetch(`/api/projects/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...doc, id }),
      })
      const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }))
      if (res.ok && data.ok) {
        if (archived) {
          await authFetch(`/api/projects/${id}/archive`, { method: 'POST' }).catch(() => {})
        }
        report.imported++
      } else {
        report.failed++
        report.failures.push({ id, reason: data.error || `HTTP ${res.status}` })
      }
    } catch (err) {
      report.failed++
      report.failures.push({ id, reason: String(err) })
    }
  }

  if (report.failed === 0) {
    try { localStorage.setItem(LEGACY_IMPORT_DONE_KEY, new Date().toISOString()) } catch { /* ignore */ }
  }

  return report
}

// ─── 导出（纯客户端，无关 DB） ───────────────────────────────────────

export function exportProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title}-${project.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportInk(project: Project): void {
  const lines: string[] = []
  lines.push(`// ${project.title}`)
  lines.push(`// 由 filmgame 导出 · ${new Date().toLocaleDateString('zh-CN')}`)
  lines.push('')

  const inkVarName = (name: string): string => {
    const direct = name.replace(/[^a-zA-Z0-9_]/g, '_')
    const fixed = /^[0-9]/.test(direct) ? `var_${direct}` : direct
    if (!fixed || fixed === '_' || fixed.replace(/_/g, '') === '') {
      const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      return `var_${hash}`
    }
    return fixed
  }
  // 解析交给 lib/conditions.ts 的 parseEffectPart 统一处理（同时认识 AI 生成的
  // "name+1" 后缀写法与工坊快捷按钮的 "+name" 前缀写法，此前这里只认后者，
  // 导致 89 个 AI 生成选项的 variableEffects 在导出的 .ink 里全部消失，无法变更任何变量）。
  const applyInkEffects = (effects: string): string[] => {
    if (!effects.trim()) return []
    return effects.split(',').map(part => {
      const parsed = parseEffectPart(part)
      if (!parsed) return ''
      const name = inkVarName(parsed.name)
      if (parsed.kind === 'set') {
        const val = typeof parsed.value === 'number' ? parsed.value : `"${parsed.value}"`
        return `~ ${name} = ${val}`
      }
      const op = parsed.kind === 'inc' ? '+' : '-'
      return `~ ${name} = ${name} ${op} ${parsed.value}`
    }).filter(Boolean)
  }

  if (project.variables.length > 0) {
    const mappings: string[] = []
    for (const v of project.variables) {
      const converted = inkVarName(v.name)
      if (converted !== v.name) mappings.push(`// 变量映射: ${converted} = "${v.name}"`)
      const val = isNaN(Number(v.defaultValue)) ? `"${v.defaultValue}"` : v.defaultValue
      lines.push(`VAR ${converted} = ${val}`)
    }
    if (mappings.length > 0) {
      lines.unshift('', ...mappings)
    }
    lines.push('')
  }

  // 节点 id 是 nanoid，默认字母表含 '-' 和 '_'，而 ink 的 knot 名/divert 目标必须是合法标识符
  // （字母/下划线开头，仅含字母数字下划线）——直接把原始 id 当 knot 名会产出 `=== -mgaNQkr ===`
  // 这种 ink 解析器无法识别的语法（连字符在 ink 里不是合法标识符字符，且不能作为开头）。
  // 统一映射成 `n_<sanitized>` 形式，knot 声明和所有 divert 目标都必须使用同一份映射，否则连不上。
  const knotNameCache = new Map<string, string>()
  const usedKnotNames = new Set<string>()
  const inkKnotName = (id: string): string => {
    const cached = knotNameCache.get(id)
    if (cached) return cached
    let base = `n_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
    let candidate = base
    let suffix = 1
    while (usedKnotNames.has(candidate)) {
      candidate = `${base}_${suffix++}`
    }
    usedKnotNames.add(candidate)
    knotNameCache.set(id, candidate)
    return candidate
  }

  const nodeMap = new Map(project.nodes.map(n => [n.id, n]))
  const startNode = project.nodes.find(n => n.type === 'start') ?? project.nodes[0]
  if (startNode) lines.push(`-> ${inkKnotName(startNode.id)}`)
  lines.push('')

  for (const node of project.nodes) {
    lines.push(`=== ${inkKnotName(node.id)} ===`)
    if (node.title) lines.push(`// ${node.title}`)
    if (node.sceneDesc) lines.push(`// [场景] ${node.sceneDesc}`)
    for (const line of node.dialogue) {
      if (line.speaker && line.text) lines.push(`${line.speaker}: ${line.text}`)
      else if (line.text) lines.push(line.text)
    }
    if (node.type === 'ending') {
      const ending = project.endings.find(e => e.nodeId === node.id)
      if (ending) lines.push(`// [结局: ${ending.title}] ${ending.description}`)
      lines.push('-> END')
    } else if (node.choices.length === 0) {
      // 探索节点（explore）没有自己的选项，靠 exploreReturnNodeId 在预览里自动回到主线
      // （见 preview/page.tsx 的"返回故事主线"按钮）。此前导出忽略了这个字段，一律 -> END，
      // 玩家在 ink 播放器里进入探索内容后就再也回不到主线——和预览里的实际行为不一致。
      const returnTarget = node.exploreReturnNodeId ? nodeMap.get(node.exploreReturnNodeId) : undefined
      lines.push(returnTarget ? `-> ${inkKnotName(returnTarget.id)}` : '-> END')
    } else if (node.choices.length === 1 && node.type !== 'branch') {
      const c = node.choices[0]
      const cTarget = nodeMap.get(c.targetNodeId)
      applyInkEffects(c.variableEffects).forEach(l => lines.push(l))
      lines.push(`-> ${cTarget ? inkKnotName(c.targetNodeId) : 'END'}`)
    } else {
      for (const choice of node.choices) {
        const target = nodeMap.get(choice.targetNodeId)
        const inkCond = conditionsToInk(choice.conditions ?? '')
        if (inkCond) {
          lines.push(`{ ${inkCond}:`)
          lines.push(`  + [${choice.text}]`)
          applyInkEffects(choice.variableEffects).forEach(l => lines.push(`    ${l}`))
          lines.push(`    -> ${target ? inkKnotName(choice.targetNodeId) : 'END'}`)
          lines.push(`}`)
        } else {
          lines.push(`+ [${choice.text}]`)
          applyInkEffects(choice.variableEffects).forEach(l => lines.push(`  ${l}`))
          lines.push(`  -> ${target ? inkKnotName(choice.targetNodeId) : 'END'}`)
        }
      }
    }
    lines.push('')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title}.ink`
  a.click()
  URL.revokeObjectURL(url)
}
