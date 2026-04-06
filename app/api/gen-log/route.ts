import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const LOG_FILE = join(process.cwd(), 'data', 'gen-log.txt')

export async function GET() {
  try {
    const text = await readFile(LOG_FILE, 'utf8').catch(() => '')
    return new NextResponse(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    return new NextResponse('', { status: 200 })
  }
}

export async function DELETE() {
  try {
    await writeFile(LOG_FILE, '', 'utf8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
