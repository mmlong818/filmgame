import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'
import { getProjectWithVersion, saveProject, deleteProject, ConflictError } from '@/lib/db/projects'
import { migrateProject } from '@/lib/schema/migrations'
import { ProjectSchema } from '@/lib/schema/project'
import type { Project } from '@/lib/types/project'

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

function validateId(id: string): boolean {
  return SAFE_ID.test(id)
}

function formatZodError(error: import('zod').ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}

/** body.version 优先；否则取 If-Match 头（数字字符串）；都没有则不做乐观锁校验 */
function readExpectedVersion(req: NextRequest, body: unknown): number | undefined {
  const bodyVersion = (body as { version?: unknown })?.version
  if (typeof bodyVersion === 'number' && Number.isFinite(bodyVersion)) return bodyVersion

  const ifMatch = req.headers.get('if-match')
  if (ifMatch) {
    const parsed = Number(ifMatch)
    if (Number.isFinite(parsed)) return parsed
  }

  return undefined
}

export const GET = withAuth(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

    try {
      const result = await getProjectWithVersion(id)
      if (!result) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      return NextResponse.json({ ok: true, project: result.project, version: result.version })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)

export const POST = withAuth(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
    }

    const bodyId = (body as { id?: unknown })?.id
    if (typeof bodyId === 'string' && bodyId !== id) {
      return NextResponse.json({ ok: false, error: 'id mismatch' }, { status: 400 })
    }

    const migrated = migrateProject({ ...(body as Record<string, unknown>), id })
    const parsed = ProjectSchema.safeParse(migrated)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: formatZodError(parsed.error) },
        { status: 400 },
      )
    }

    const expectedVersion = readExpectedVersion(req, body)

    try {
      const saved = await saveProject(parsed.data as Project, expectedVersion)
      return NextResponse.json({ ok: true, project: saved })
    } catch (err) {
      if (err instanceof ConflictError) {
        return NextResponse.json(
          { ok: false, errorType: 'conflict', currentVersion: err.currentVersion },
          { status: 409 },
        )
      }
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)

export const DELETE = withAuth(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

    try {
      await deleteProject(id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)
