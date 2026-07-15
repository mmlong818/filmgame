import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'
import { listProjects, saveProject } from '@/lib/db/projects'
import { migrateProject } from '@/lib/schema/migrations'
import { ProjectSchema } from '@/lib/schema/project'
import type { Project } from '@/lib/types/project'

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

function formatZodError(error: import('zod').ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}

export const GET = withAuth(async () => {
  try {
    const projects = await listProjects()
    return NextResponse.json({ ok: true, projects })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
})

export const POST = withAuth(async (req: NextRequest) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const rawId = (body as { id?: unknown })?.id
  if (typeof rawId !== 'string' || !SAFE_ID.test(rawId)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }

  const migrated = migrateProject(body)
  const parsed = ProjectSchema.safeParse(migrated)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: formatZodError(parsed.error) },
      { status: 400 },
    )
  }

  try {
    // ProjectSchema 对若干字段刻意比 Project 类型更宽松（见 lib/schema/project.ts 头部注释），
    // 与仓储层 fromRows 的 `as Project` 处理保持一致。
    const saved = await saveProject(parsed.data as Project)
    return NextResponse.json({ ok: true, project: saved })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
})
