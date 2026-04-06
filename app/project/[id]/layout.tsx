'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSelectedLayoutSegment, useParams } from 'next/navigation'
import Link from 'next/link'
import { useProjectStore } from '@/lib/store/projectStore'
import { useToast } from '@/app/components/toast'
import { PHASES } from '@/lib/types/phase'
import type { Phase } from '@/lib/types/phase'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const segment = useSelectedLayoutSegment()
  const params = useParams()
  const id = params.id as string
  const { project, loadProject, renameProject } = useProjectStore()
  const { toast } = useToast()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!project || project.id !== id) {
      const ok = loadProject(id)
      if (!ok) setNotFound(true)
    }
  }, [id, project, loadProject, router])

  useEffect(() => {
    function handleStorageError(e: Event) {
      const detail = (e as CustomEvent).detail
      toast(detail?.message ?? '本地存储空间不足，请清理旧项目', 'error')
    }
    window.addEventListener('filmgame:storage-error', handleStorageError)
    return () => window.removeEventListener('filmgame:storage-error', handleStorageError)
  }, [toast])

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--shell)' }}>
        <div className="text-center">
          <div className="text-6xl mb-6 opacity-30">🎬</div>
          <h2 className="text-xl font-light mb-3" style={{ color: 'var(--shell-fg)' }}>项目不存在</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--shell-fg-3)' }}>该项目可能已被删除，或链接已失效</p>
          <div className="flex items-center gap-3 justify-center">
            <Link href="/projects" className="px-4 py-2 text-sm" style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}>
              返回项目列表
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--shell-fg-2)' }}>加载中...</div>
      </div>
    )
  }

  const currentSegment = (segment ?? '') as Phase

  return (
    <div className="min-h-screen flex flex-col">
      {/* Art Deco header */}
      <header
        className="filmgame-shell h-14 px-4 flex items-center gap-3 shrink-0"
        style={{ borderBottom: '1px solid var(--shell-border)' }}
      >
        {/* Gold top accent line — 2px */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: '2px', background: 'linear-gradient(90deg, transparent, var(--gold-dim) 15%, var(--gold-mid) 40%, var(--gold-bright) 50%, var(--gold-mid) 60%, var(--gold-dim) 85%, transparent)' }}
        />

        {/* Back */}
        <Link
          href="/projects"
          className="text-xs font-medium tracking-wide transition-colors shrink-0"
          style={{ color: 'var(--shell-fg-3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg-3)' }}
        >
          ← 返回
        </Link>

        <span style={{ color: 'var(--shell-border)' }} className="select-none text-xs">|</span>

        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { renameProject(titleDraft.trim() || project.title); setEditingTitle(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { renameProject(titleDraft.trim() || project.title); setEditingTitle(false) }
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            className="text-sm font-medium outline-none bg-transparent max-w-48"
            style={{ color: 'var(--shell-fg)', borderBottom: '1px solid var(--gold-mid)' }}
          />
        ) : (
          <h1
            className="text-sm font-medium cursor-pointer transition-colors truncate max-w-48"
            style={{ color: 'var(--shell-fg)' }}
            onClick={() => { setTitleDraft(project.title); setEditingTitle(true) }}
            title="点击重命名"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold-bright)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg)' }}
          >
            {project.title}
          </h1>
        )}

        {/* Phase tabs */}
        <nav className="flex items-center ml-6 gap-0.5">
          {PHASES.map((phase, i) => {
            const status = project.phaseProgress[phase.key]
            const isActive = currentSegment === phase.key

            if (status === 'locked') {
              return (
                <span
                  key={phase.key}
                  className="text-xs font-medium px-3 py-2.5 border-b-2 border-transparent cursor-not-allowed"
                  style={{ color: 'var(--shell-fg-3)', opacity: 0.35 }}
                >
                  {i + 1}. {phase.label}
                </span>
              )
            }

            let phaseBadge: React.ReactNode = null
            if (phase.key === 'workshop' && project.nodes.length > 0) {
              const total = project.nodes.length
              const filled = project.nodes.filter(n => n.dialogue && n.dialogue.length >= 2 && n.emotionFunction?.tension > 0).length
              phaseBadge = <span className="text-xs opacity-60 ml-1">({filled}/{total})</span>
            } else if (phase.key === 'world' && project.characters.length > 0) {
              phaseBadge = <span className="text-xs opacity-60 ml-1">({project.characters.length}角)</span>
            } else if (phase.key === 'scale' && project.selectedScalePlanId) {
              phaseBadge = <span className="text-xs opacity-60 ml-1">(已选)</span>
            } else if (phase.key === 'structure' && project.nodes.length > 0) {
              phaseBadge = <span className="text-xs opacity-60 ml-1">({project.nodes.length}节)</span>
            } else if (phase.key === 'validate' && project.lastValidation) {
              phaseBadge = <span className="text-xs opacity-60 ml-1">({project.lastValidation.passRate}%)</span>
            }

            return (
              <Link
                key={phase.key}
                href={`/project/${project.id}/${phase.key}`}
                className="text-xs font-medium px-3 py-2.5 border-b-2 transition-all relative"
                style={{
                  borderBottomColor: isActive ? 'var(--gold-bright)' : 'transparent',
                  color: isActive ? 'var(--gold-bright)' : 'var(--shell-fg-3)',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg-2)'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg-3)'
                }}
              >
                {status === 'done' && <span className="text-green-500 mr-1">✓</span>}
                {i + 1}. {phase.label}
                {phaseBadge}
                {phase.key === 'validate' && project.downstreamStale && (
                  <span className="absolute top-1.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" title="有改动，建议重新校验" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Preview */}
        <div className="ml-auto">
          <Link
            href={`/project/${project.id}/preview`}
            className="text-xs px-3 py-1.5 font-medium transition-colors"
            style={{
              background: segment === 'preview' ? 'var(--gold-mid)' : 'rgba(200,168,76,0.15)',
              color: segment === 'preview' ? 'var(--shell)' : 'var(--gold-bright)',
              border: '1px solid var(--gold-dim)',
            }}
            onMouseEnter={e => {
              if (segment !== 'preview') {
                (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,76,0.25)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)'
              }
            }}
            onMouseLeave={e => {
              if (segment !== 'preview') {
                (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,76,0.15)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-dim)'
              }
            }}
          >
            ▶ 预览
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-white">
        {children}
      </main>
    </div>
  )
}
