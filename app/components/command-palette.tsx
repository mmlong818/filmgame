'use client'
// ⌘K 命令面板 + 全局快捷键宿主（⌘Z 撤销 / ⇧⌘Z 重做）。
// 命令源：阶段跳转、预览、项目级动作、节点检索（跳转工坊 ?node=）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'
import { useHistoryStore, undo, redo } from '@/lib/store/history'
import { useAiTaskStore } from '@/lib/ai/taskStore'
import { PHASES } from '@/lib/types/phase'
import { nodeTypeStyle } from '@/lib/ui/nodeTypes'
import { useToast } from './toast'

interface Command {
  id: string
  /** 分组标题 */
  group: string
  label: string
  hint?: string
  run: () => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const project = useProjectStore(s => s.project)
  const goToPhase = useProjectStore(s => s.goToPhase)
  const undoCount = useHistoryStore(s => s.undoStack.length)
  const redoCount = useHistoryStore(s => s.redoStack.length)
  const aiTasks = useAiTaskStore(s => s.tasks)
  const { toast } = useToast()

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0) }, [])

  // 全局快捷键：⌘K 开关面板；⌘Z / ⇧⌘Z 撤销重做（输入态放行给原生行为）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        return
      }
      if (mod && e.key.toLowerCase() === 'z' && !isTypingTarget(e.target)) {
        e.preventDefault()
        const label = e.shiftKey ? redo() : undo()
        if (label) toast(`${e.shiftKey ? '已重做' : '已撤销'}：${label}`, 'info')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // 在项目内才提供阶段/节点命令
  const inProject = Boolean(project) && pathname?.startsWith('/project/')

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []
    if (inProject && project) {
      for (const ph of PHASES) {
        const locked = project.phaseProgress[ph.key] === 'locked'
        if (locked) continue
        list.push({
          id: `phase-${ph.key}`,
          group: '阶段',
          label: `前往 · ${ph.label}`,
          hint: ph.description,
          run: () => { goToPhase(ph.key); router.push(`/project/${project.id}/${ph.key}`) },
        })
      }
      list.push({
        id: 'preview',
        group: '阶段',
        label: '预览播放',
        hint: '实时体验交互剧情',
        run: () => router.push(`/project/${project.id}/preview`),
      })
      if (undoCount > 0) {
        list.push({ id: 'undo', group: '编辑', label: '撤销上一步', hint: '⌘Z', run: () => { const l = undo(); if (l) toast(`已撤销：${l}`, 'info') } })
      }
      if (redoCount > 0) {
        list.push({ id: 'redo', group: '编辑', label: '重做', hint: '⇧⌘Z', run: () => { const l = redo(); if (l) toast(`已重做：${l}`, 'info') } })
      }
      for (const t of aiTasks) {
        list.push({ id: `cancel-${t.id}`, group: 'AI 任务', label: `中止 · ${t.label}`, hint: '正在运行', run: () => t.cancel() })
      }
      // 节点检索（有输入时才展开，避免长列表刷屏）
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        for (const n of project.nodes) {
          if (!n.title.toLowerCase().includes(q)) continue
          list.push({
            id: `node-${n.id}`,
            group: '节点',
            label: n.title,
            hint: nodeTypeStyle(n.type).label,
            run: () => router.push(`/project/${project.id}/workshop?node=${n.id}`),
          })
          if (list.filter(c => c.group === '节点').length >= 8) break
        }
      }
    }
    list.push({ id: 'projects', group: '全局', label: '项目列表', hint: '返回档案室', run: () => router.push('/projects') })
    list.push({ id: 'new-project', group: '全局', label: '新建项目', run: () => router.push('/projects?new=1') })
    return list
  }, [inProject, project, query, undoCount, redoCount, aiTasks, goToPhase, router, toast])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => { setActive(0) }, [query, open])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const exec = (c: Command) => { close(); c.run() }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/40 pt-[14vh] px-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div role="dialog" aria-modal="true" aria-label="命令面板" className="paper-sheet w-full max-w-xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close() }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[active]; if (c) exec(c) }
          }}
          placeholder="输入命令或检索节点…"
          className="w-full bg-transparent border-b border-line px-4 py-3 text-[14px] text-ink placeholder:text-pencil/70 focus:outline-none"
        />
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-pencil text-[13px]">没有匹配的命令</div>}
          {filtered.map((c, i) => {
            const showGroup = i === 0 || filtered[i - 1].group !== c.group
            return (
              <div key={c.id}>
                {showGroup && <div className="px-4 pt-2 pb-1 text-[10px] tracking-[0.25em] text-pencil">{c.group}</div>}
                <button
                  type="button"
                  data-active={i === active}
                  onClick={() => exec(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full cursor-pointer flex items-baseline gap-3 px-4 py-2 text-left text-[13px] ${
                    i === active ? 'bg-paper-dim text-ink' : 'text-ink-soft'
                  }`}
                >
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-pencil">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 border-t border-line-soft px-4 py-2 text-[10.5px] text-pencil">
          <span>↑↓ 选择</span><span>回车 执行</span><span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
