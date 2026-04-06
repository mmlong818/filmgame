import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data', 'projects')
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

function validateId(id: string): boolean {
  return SAFE_ID.test(id)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf8')
    return NextResponse.json({ ok: true, project: JSON.parse(raw) })
  } catch {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    const project = await req.json()
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(project, null, 2), 'utf8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!validateId(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    await unlink(join(DATA_DIR, `${id}.json`))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }
}
