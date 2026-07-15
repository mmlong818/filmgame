import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'
import { archiveProject, unarchiveProject, deleteProject } from '@/lib/db/projects'

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

function validateId(id: string): boolean {
  return SAFE_ID.test(id)
}

/** 归档：置 archived=true（不再搬运文件）。 */
export const POST = withAuth(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

    try {
      await archiveProject(id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)

/**
 * 恢复（取消归档）：置 archived=false。
 * 注意：旧版前端（app/projects/page.tsx handleRestore）目前用 DELETE 本路由表达“恢复”语义
 * （文件时代：DELETE 只是删掉归档备份文件，因为 restoreProject() 已把项目写回活跃目录）。
 * DB 模型下 DELETE 改为真删除（见下），"恢复"必须改走这个新的 PUT。Task 8 需要同步把
 * handleRestore 里的 `fetch(.../archive, {method:'DELETE'})` 改成 `{method:'PUT'}`，
 * 否则在 Task 8 落地前，"恢复" 操作会把项目连同节点一起硬删除——已在报告中特别标注。
 */
export const PUT = withAuth(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

    try {
      await unarchiveProject(id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  },
)

/** 彻底删除（级联删除 nodes）。不再有"搬运文件"语义。 */
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
