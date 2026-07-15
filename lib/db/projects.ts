// 仓储层：Project ↔ (projects 行 + nodes 行) 组装/拆分、CRUD、乐观锁 version。
// toRows/fromRows 是纯转换函数；CRUD 函数负责事务、乐观锁与差量同步 nodes。
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
// 相对导入带显式 .ts 扩展名：Node strip-only 模式（scripts/migrate-json-to-db.mjs 等
// 直接 import 本文件）不做扩展名解析，tsconfig 已开 allowImportingTsExtensions。
import { db } from './index.ts'
import { projects, nodes, type ProjectRow, type NodeRow } from './schema.ts'
import { migrateProject } from '../schema/migrations.ts'
import { ProjectSchema } from '../schema/project.ts'
import type { Project, ProjectSummary, StoryNode, NodeType } from '../types/project'
import type { Phase } from '../types/phase'

// 不用构造器参数属性语法（public readonly …）——Node strip-only 模式无法直接
// import 含该语法的 .ts，而迁移脚本（scripts/migrate-json-to-db.mjs）需要直接引用本文件。
export class ConflictError extends Error {
  readonly currentVersion: number

  constructor(message: string, currentVersion: number) {
    super(message)
    this.name = 'ConflictError'
    this.currentVersion = currentVersion
  }
}

// ─── 行类型（不含仓储层管理的 version/updatedAt/archived 字段） ──────────

type ProjectRowBase = Omit<typeof projects.$inferInsert, 'version' | 'archived' | 'archivedAt'>
type NodeRowBase = Omit<typeof nodes.$inferInsert, 'version' | 'updatedAt'>

// ─── Project ↔ Rows 组装/拆分 ─────────────────────────────────────────

// sortOrder 存的是节点在 project.nodes 数组中的全局下标（node.order 是幕内局部序号，
// 会重复，不能用于重建数组顺序——工坊页"第 N 节"编号等依赖数组原始顺序）。
function nodeToRow(projectId: string, node: StoryNode, sortOrder: number): NodeRowBase {
  return {
    id: node.id,
    projectId,
    actId: node.actId,
    sortOrder,
    type: node.type,
    position: node.position,
    data: {
      order: node.order,
      title: node.title,
      emotionFunction: node.emotionFunction,
      systemFunction: node.systemFunction,
      sceneHeader: node.sceneHeader,
      sceneDesc: node.sceneDesc,
      dialogue: node.dialogue,
      choices: node.choices,
      durationSeconds: node.durationSeconds,
      notes: node.notes,
      dramaticWeight: node.dramaticWeight,
      exploreReturnNodeId: node.exploreReturnNodeId,
    },
  }
}

function rowToStoryNode(row: NodeRow): StoryNode {
  const data = row.data as Record<string, unknown>
  return {
    id: row.id,
    actId: row.actId,
    order: (data.order as number) ?? row.sortOrder,
    type: row.type as NodeType,
    position: row.position as { x: number; y: number },
    title: data.title as string,
    emotionFunction: data.emotionFunction as StoryNode['emotionFunction'],
    systemFunction: data.systemFunction as StoryNode['systemFunction'],
    sceneHeader: data.sceneHeader as StoryNode['sceneHeader'],
    sceneDesc: data.sceneDesc as string,
    dialogue: (data.dialogue as StoryNode['dialogue']) ?? [],
    choices: (data.choices as StoryNode['choices']) ?? [],
    durationSeconds: data.durationSeconds as number,
    notes: data.notes as string,
    dramaticWeight: data.dramaticWeight as StoryNode['dramaticWeight'],
    exploreReturnNodeId: data.exploreReturnNodeId as string | undefined,
  }
}

/** Project → projectRow（不含 nodes）+ nodeRows[]。纯转换，不做任何 DB 调用。 */
export function toRows(project: Project): { projectRow: ProjectRowBase; nodeRows: NodeRowBase[] } {
  const projectRow: ProjectRowBase = {
    id: project.id,
    title: project.title,
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
    currentPhase: project.currentPhase,
    selectedScalePlanId: project.selectedScalePlanId,
    schemaVersion: project.schemaVersion ?? 1,
    downstreamStale: project.downstreamStale ?? false,
    phaseProgress: project.phaseProgress,
    worldAnchor: project.worldAnchor,
    characters: project.characters,
    scalePlanOptions: project.scalePlanOptions,
    chapters: project.chapters,
    acts: project.acts,
    variables: project.variables,
    endings: project.endings,
    lastValidation: project.lastValidation,
    directorReview: project.directorReview,
  }

  const nodeRows = project.nodes.map((node, index) => nodeToRow(project.id, node, index))

  return { projectRow, nodeRows }
}

/** (projectRow, nodeRows) → 完整 Project（nodes 按 sortOrder 排序），经 migrateProject + ProjectSchema.parse 校验。 */
export function fromRows(projectRow: ProjectRow, nodeRows: NodeRow[]): Project {
  const sortedNodes = [...nodeRows].sort((a, b) => a.sortOrder - b.sortOrder)

  const doc = {
    id: projectRow.id,
    title: projectRow.title,
    createdAt: projectRow.createdAt.toISOString(),
    updatedAt: projectRow.updatedAt.toISOString(),
    currentPhase: projectRow.currentPhase,
    phaseProgress: projectRow.phaseProgress,
    worldAnchor: projectRow.worldAnchor,
    characters: projectRow.characters,
    selectedScalePlanId: projectRow.selectedScalePlanId,
    scalePlanOptions: projectRow.scalePlanOptions,
    chapters: projectRow.chapters,
    acts: projectRow.acts,
    nodes: sortedNodes.map(rowToStoryNode),
    variables: projectRow.variables,
    endings: projectRow.endings,
    lastValidation: projectRow.lastValidation,
    directorReview: projectRow.directorReview,
    downstreamStale: projectRow.downstreamStale,
    schemaVersion: projectRow.schemaVersion,
  }

  const migrated = migrateProject(doc)
  return ProjectSchema.parse(migrated) as Project
}

// ─── 读 ────────────────────────────────────────────────────────────────

export async function getProject(id: string): Promise<Project | null> {
  const result = await getProjectWithVersion(id)
  return result ? result.project : null
}

/**
 * 同 getProject，但附带 projects 行的乐观锁 version——供 API 路由把 version 回传给
 * 客户端（用于后续保存时的 If-Match/expectedVersion）。fromRows 组装出的 Project 本身
 * 不含 version 字段（乐观锁是仓储层/DB 概念，不属于文档模型），故用独立函数返回。
 */
export async function getProjectWithVersion(
  id: string,
): Promise<{ project: Project; version: number } | null> {
  const [projectRow] = await db.select().from(projects).where(eq(projects.id, id))
  if (!projectRow) return null

  const nodeRows = await db.select().from(nodes).where(eq(nodes.projectId, id))
  return { project: fromRows(projectRow, nodeRows), version: projectRow.version }
}

export async function listProjects(
  options: { includeArchived?: boolean } = {},
): Promise<ProjectSummary[]> {
  const { includeArchived = false } = options

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      updatedAt: projects.updatedAt,
      currentPhase: projects.currentPhase,
      archived: projects.archived,
      archivedAt: projects.archivedAt,
      nodeCount: sql<number>`count(${nodes.id})::int`,
    })
    .from(projects)
    .leftJoin(nodes, eq(nodes.projectId, projects.id))
    .where(includeArchived ? undefined : eq(projects.archived, false))
    .groupBy(
      projects.id,
      projects.title,
      projects.updatedAt,
      projects.currentPhase,
      projects.archived,
      projects.archivedAt,
    )
    .orderBy(desc(projects.updatedAt))

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    currentPhase: row.currentPhase as Phase,
    nodeCount: row.nodeCount,
    archived: row.archived,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : undefined,
  }))
}

// ─── 写 ────────────────────────────────────────────────────────────────

/** 整档保存：事务内 upsert projectRow（version 自增，可选乐观锁）+ 差量同步 nodes（按 id upsert，删除多余行）。 */
export async function saveProject(project: Project, expectedVersion?: number): Promise<Project> {
  const { projectRow, nodeRows } = toRows(project)

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ version: projects.version })
      .from(projects)
      .where(eq(projects.id, project.id))

    if (expectedVersion !== undefined) {
      if (!existing) throw new ConflictError(`project ${project.id} not found`, 0)
      if (existing.version !== expectedVersion) {
        throw new ConflictError(`project ${project.id} version conflict`, existing.version)
      }
    }

    const newVersion = existing ? existing.version + 1 : 1

    await tx
      .insert(projects)
      .values({ ...projectRow, version: newVersion })
      .onConflictDoUpdate({ target: projects.id, set: { ...projectRow, version: newVersion } })

    const now = new Date()
    const incomingIds = nodeRows.map((row) => row.id)

    for (const row of nodeRows) {
      const { id, ...rest } = row
      await tx
        .insert(nodes)
        .values({ ...row, updatedAt: now })
        .onConflictDoUpdate({
          target: nodes.id,
          set: { ...rest, updatedAt: now, version: sql`${nodes.version} + 1` },
        })
    }

    await tx
      .delete(nodes)
      .where(
        incomingIds.length > 0
          ? and(eq(nodes.projectId, project.id), notInArray(nodes.id, incomingIds))
          : eq(nodes.projectId, project.id),
      )

    const [savedProjectRow] = await tx.select().from(projects).where(eq(projects.id, project.id))
    const savedNodeRows = await tx.select().from(nodes).where(eq(nodes.projectId, project.id))
    return fromRows(savedProjectRow, savedNodeRows)
  })
}

/**
 * 单节点保存：只 upsert 该 node 行 + bump 该行 version，并 bump projects.updatedAt。
 * 不 bump projects.version —— 避免节点级保存与整档保存互相触发 409（计划 Task 4 明确规避）。
 */
export async function saveNode(
  projectId: string,
  node: StoryNode,
  expectedVersion?: number,
): Promise<StoryNode> {
  return db.transaction(async (tx) => {
    const [existingNode] = await tx
      .select({ version: nodes.version, sortOrder: nodes.sortOrder })
      .from(nodes)
      .where(eq(nodes.id, node.id))

    if (expectedVersion !== undefined) {
      if (!existingNode) throw new ConflictError(`node ${node.id} not found`, 0)
      if (existingNode.version !== expectedVersion) {
        throw new ConflictError(`node ${node.id} version conflict`, existingNode.version)
      }
    }

    // 已存在则保持原全局下标；新节点追加到末尾
    let sortOrder: number
    if (existingNode) {
      sortOrder = existingNode.sortOrder
    } else {
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(${nodes.sortOrder}), -1)::int` })
        .from(nodes)
        .where(eq(nodes.projectId, projectId))
      sortOrder = maxRow.max + 1
    }

    const now = new Date()
    const row = nodeToRow(projectId, node, sortOrder)
    const { id, ...rest } = row

    await tx
      .insert(nodes)
      .values({ ...row, updatedAt: now })
      .onConflictDoUpdate({
        target: nodes.id,
        set: { ...rest, updatedAt: now, version: sql`${nodes.version} + 1` },
      })

    await tx.update(projects).set({ updatedAt: now }).where(eq(projects.id, projectId))

    const [savedRow] = await tx.select().from(nodes).where(eq(nodes.id, node.id))
    return rowToStoryNode(savedRow)
  })
}

export async function deleteNode(projectId: string, nodeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.projectId, projectId)))
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  })
}

export async function archiveProject(id: string): Promise<void> {
  await db
    .update(projects)
    .set({ archived: true, archivedAt: new Date() })
    .where(eq(projects.id, id))
}

export async function unarchiveProject(id: string): Promise<void> {
  await db
    .update(projects)
    .set({ archived: false, archivedAt: null })
    .where(eq(projects.id, id))
}

export async function deleteProject(id: string): Promise<void> {
  // nodes 通过 FK on delete cascade 级联删除
  await db.delete(projects).where(eq(projects.id, id))
}
