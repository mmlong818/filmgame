import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data', 'projects')

export async function GET() {
  try {
    const files = await readdir(DATA_DIR).catch(() => [] as string[])
    const summaries = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f => {
        try {
          const raw = await readFile(join(DATA_DIR, f), 'utf8')
          const p = JSON.parse(raw)
          return { id: p.id, title: p.title, updatedAt: p.updatedAt, currentPhase: p.currentPhase, nodeCount: p.nodes?.length ?? 0 }
        } catch { return null }
      })
    )
    return NextResponse.json({ ok: true, projects: summaries.filter(Boolean) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function POST(req: NextRequest) {
  try {
    const project = await req.json()
    if (!project?.id || !SAFE_ID.test(project.id)) {
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    }
    const { mkdir } = await import('fs/promises')
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(join(DATA_DIR, `${project.id}.json`), JSON.stringify(project, null, 2), 'utf8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
