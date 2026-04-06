import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data', 'projects')
const ARCHIVE_DIR = join(process.cwd(), 'data', 'archive')
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!SAFE_ID.test(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  try {
    const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf8')
    const project = JSON.parse(raw)
    await mkdir(ARCHIVE_DIR, { recursive: true })
    await writeFile(join(ARCHIVE_DIR, `${id}.json`), JSON.stringify({ ...project, archived: true, archivedAt: new Date().toISOString() }, null, 2), 'utf8')
    await unlink(join(DATA_DIR, `${id}.json`)).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!SAFE_ID.test(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  await unlink(join(ARCHIVE_DIR, `${id}.json`)).catch(() => {})
  return NextResponse.json({ ok: true })
}
