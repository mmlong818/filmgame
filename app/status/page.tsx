'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export default function StatusPage() {
  const [log, setLog] = useState<string>('')
  const [lastLen, setLastLen] = useState(0)
  const [active, setActive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch('/api/gen-log', { cache: 'no-store' })
      const text = await r.text()
      if (text.length !== lastLen) {
        setLog(text)
        setLastLen(text.length)
        setActive(true)
        setTimeout(() => setActive(false), 800)
      }
    } catch { /* ignore */ }
  }, [lastLen])

  useEffect(() => {
    fetchLog()
    pollRef.current = setInterval(fetchLog, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchLog])

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  async function clearLog() {
    await fetch('/api/gen-log', { method: 'DELETE' })
    setLog('')
    setLastLen(0)
  }

  const lines = log.split('\n').filter(Boolean)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#0d0d0d', fontFamily: "'Cascadia Code', 'Consolas', monospace" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: active ? '#22c55e' : '#3a3a3a', transition: 'background 0.3s' }}
          />
          <span className="text-xs font-medium" style={{ color: '#888' }}>
            FILMGAME GEN
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: '#444' }}>{lines.length} 行</span>
          <button
            onClick={clearLog}
            className="text-xs px-2 py-0.5 transition-colors"
            style={{ color: '#555', border: '1px solid #2a2a2a' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555' }}
          >
            清空
          </button>
        </div>
      </div>

      {/* Log area */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ fontSize: '12px', lineHeight: '1.7' }}>
        {lines.length === 0 ? (
          <div style={{ color: '#333' }} className="mt-8 text-center text-xs">
            等待任务启动...
          </div>
        ) : (
          lines.map((line, i) => <LogLine key={i} line={line} isLast={i === lines.length - 1} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div
        className="px-4 py-1.5 text-xs shrink-0"
        style={{ color: '#333', borderTop: '1px solid #1a1a1a' }}
      >
        每 2s 刷新 · node scripts/watch.mjs [gen-seeds|gen-project]
      </div>
    </div>
  )
}

function LogLine({ line, isLast }: { line: string; isLast: boolean }) {
  let color = '#555'
  if (line.includes('✓')) color = '#4ade80'
  else if (line.includes('✗')) color = '#f87171'
  else if (line.includes('↻')) color = '#fbbf24'
  else if (line.includes('█') || line.includes('═') || line.includes('【')) color = '#818cf8'
  else if (line.includes('Phase') || line.includes('阶段') || line.includes('第') && line.includes('轮')) color = '#38bdf8'
  else if (line.includes('✅') || line.includes('完成')) color = '#4ade80'
  else if (line.startsWith('  →')) color = '#94a3b8'

  return (
    <div
      style={{
        color,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        background: isLast ? 'rgba(255,255,255,0.03)' : 'transparent',
        padding: isLast ? '0 4px' : '0',
      }}
    >
      {line}
    </div>
  )
}
