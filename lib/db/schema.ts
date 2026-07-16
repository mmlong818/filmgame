// Drizzle 表定义（projects / nodes / settings）
import type { InferSelectModel } from 'drizzle-orm'
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  currentPhase: text('current_phase').notNull(),
  selectedScalePlanId: text('selected_scale_plan_id'),
  schemaVersion: integer('schema_version').notNull().default(1),
  version: integer('version').notNull().default(1),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  downstreamStale: boolean('downstream_stale').notNull().default(false),
  // AI 双模式：'fast' | 'thinking'；为空时按 'thinking' 处理（见 lib/schema/migrations.ts normalizeLegacy）。
  aiMode: text('ai_mode'),

  // JSONB 小集合（不含 nodes，nodes 独立成表）
  phaseProgress: jsonb('phase_progress').notNull(),
  worldAnchor: jsonb('world_anchor'),
  characters: jsonb('characters').notNull(),
  scalePlanOptions: jsonb('scale_plan_options').notNull(),
  chapters: jsonb('chapters').notNull(),
  acts: jsonb('acts').notNull(),
  variables: jsonb('variables').notNull(),
  endings: jsonb('endings').notNull(),
  lastValidation: jsonb('last_validation'),
  directorReview: jsonb('director_review'),
})

export const nodes = pgTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actId: text('act_id').notNull(),
    // "order" 是 SQL 保留字，列名改为 sort_order 避免到处加引号转义
    sortOrder: integer('sort_order').notNull(),
    type: text('type').notNull(),
    position: jsonb('position').notNull(),
    // data 承载：title/emotionFunction/systemFunction/sceneHeader/sceneDesc/
    // dialogue/choices/durationSeconds/notes/dramaticWeight/exploreReturnNodeId
    data: jsonb('data').notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_nodes_project').on(table.projectId, table.sortOrder)],
)

export const settings = pgTable('settings', {
  id: text('id').primaryKey(), // 固定 'singleton'
  provider: text('provider').notNull(),
  model: text('model'),
  baseUrl: text('base_url'),
  apiKeyEnc: text('api_key_enc'),
  // 双模式各自使用的模型 ID；为空时按 provider 给默认（见 lib/ai/lc-providers.ts resolveModel）。
  modelFast: text('model_fast'),
  modelThinking: text('model_thinking'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export type ProjectRow = InferSelectModel<typeof projects>
export type NodeRow = InferSelectModel<typeof nodes>
export type SettingsRow = InferSelectModel<typeof settings>
