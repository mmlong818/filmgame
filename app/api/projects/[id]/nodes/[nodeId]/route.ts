import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'
import { isSafeId, formatZodError } from '@/lib/server/validation'
import { saveNode, deleteNode, ConflictError } from '@/lib/db/projects'
import { StoryNodeSchema } from '@/lib/schema/project'
import type { StoryNode } from '@/lib/types/project'

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

export const PATCH = withAuth(
  async (req: NextRequest, { params }: { params: Promise<{ id: string; nodeId: string }> }) => {
    const { id, nodeId } = await params
    if (!isSafeId(id) || !isSafeId(nodeId)) {
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
    }

    const rawNode = (body as { node?: unknown })?.node
    const parsed = StoryNodeSchema.safeParse(rawNode)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: formatZodError(parsed.error) },
        { status: 400 },
      )
    }

    if (parsed.data.id !== nodeId) {
      return NextResponse.json({ ok: false, error: 'node id mismatch' }, { status: 400 })
    }

    const expectedVersion = readExpectedVersion(req, body)

    try {
      // StoryNodeSchema 对个别字段刻意比 StoryNode 类型更宽松（见 lib/schema/project.ts 头部注释）。
      const saved = await saveNode(id, parsed.data as StoryNode, expectedVersion)
      // 回传项目新版本：节点保存会推进 projects.version，客户端据此更新乐观锁基线，
      // 否则同一标签页的下一次整档保存会拿着旧基线自撞 409
      return NextResponse.json({ ok: true, node: saved.node, version: saved.projectVersion })
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
  async (_req: NextRequest, { params }: { params: Promise<{ id: string; nodeId: string }> }) => {
    const { id, nodeId } = await params
    if (!isSafeId(id) || !isSafeId(nodeId)) {
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    }

    try {
      const { projectVersion } = await deleteNode(id, nodeId)
      return NextResponse.json({ ok: true, version: projectVersion })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)
