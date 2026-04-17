'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { nanoid } from 'nanoid'
import { listProjects, archiveProject, deleteProject, saveProject, listArchivedProjects, restoreProject, permanentDeleteProject } from '@/lib/persistence'
import { createEmptyProject, useProjectStore } from '@/lib/store/projectStore'
import { PHASES } from '@/lib/types/phase'
import type { ProjectSummary } from '@/lib/types/project'
import { useToast } from '@/app/components/toast'
import { ArtDecoRule, ArtDecoStepCorner, ShellWordmark, GoldBar } from '@/app/components/art-deco'
import { AISettingsModal } from '@/app/components/ai-settings-modal'

const PROJECT_TEMPLATES = [
  { id: 'thriller', label: '悬疑惊悚', emoji: '🕵️', title: '未命名悬疑项目', world: { storyCore: '主角发现一个秘密，揭露它将毁掉一切，但不揭露将让错误延续。', theme: '真相的代价——知道真相是否让我们更自由，还是更痛苦？', genre: '悬疑惊悚', worldRules: '1. 每个人都有一个不想被发现的秘密\n2. 真相只会在最意想不到的时刻浮现\n3. 信任一旦破裂无法完全修复', durationMinutes: 90, endingCount: 3 } },
  { id: 'romance',  label: '浪漫爱情', emoji: '💫', title: '未命名爱情项目', world: { storyCore: '两个人在错误的时间相遇，爱上了彼此，但他们各自都有无法共存的过去。', theme: '爱的本质——是占有还是放手？', genre: '浪漫剧情', worldRules: '1. 每个人都在寻找被真正理解的感觉\n2. 过去的伤害会以意想不到的方式重现\n3. 选择意味着放弃另一种可能', durationMinutes: 75, endingCount: 4 } },
  { id: 'scifi',    label: '科幻冒险', emoji: '🚀', title: '未命名科幻项目', world: { storyCore: '人类发现了改变文明的技术，主角必须决定是让它公开还是永远封存。', theme: '进步的悖论——我们有能力做的事，是否都应该去做？', genre: '科幻惊悚', worldRules: '1. 技术可以解决旧问题但必然创造新问题\n2. 没有人能预见自己发明的全部后果\n3. 权力从不会自动消失，只会转移', durationMinutes: 120, endingCount: 4 } },
  { id: 'family',   label: '家庭情感', emoji: '🏠', title: '未命名家庭项目', world: { storyCore: '一个家庭在危机面前，每个成员的选择揭露了他们真正的恐惧和欲望。', theme: '家庭的本质——是血缘的束缚还是选择的归属？', genre: '情感剧', worldRules: '1. 家庭里的沉默比争吵更能积累伤害\n2. 每个成员对同一件事都有完全不同的记忆\n3. 真正的原谅需要首先理解', durationMinutes: 60, endingCount: 3 } },
  { id: 'horror',   label: '恐怖心理', emoji: '👁️', title: '未命名恐怖项目', world: { storyCore: '主角开始怀疑自己的现实——他经历的恐怖，是外在的威胁还是内心崩溃的表现？', theme: '现实的脆弱性——我们所相信的现实，究竟有多少是我们自己构建的？', genre: '心理恐怖', worldRules: '1. 感知无法完全信任，但行动依然有后果\n2. 最大的恐惧来自不确定性而非明确的威胁\n3. 每个人的理智都有一个临界点', durationMinutes: 80, endingCount: 3 } },
]

type ProjectTemplate = typeof PROJECT_TEMPLATES[number]

const PHASE_LABELS: Record<string, string> = { world: '世界锚点', scale: '规模规划', structure: '故事结构', workshop: '剧本工坊', validate: '全局校验' }
const PHASE_STEPS = ['world', 'scale', 'structure', 'workshop', 'validate']

function ProjectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[]>([])
  const [permDeleteId, setPermDeleteId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result as string
        const data = JSON.parse(raw)
        if (!data.id || !data.title || !Array.isArray(data.nodes)) {
          toast('JSON 格式错误：缺少必要字段（id / title / nodes）')
          return
        }
        const newId: string = nanoid(8)
        const imported = { ...data, id: newId, updatedAt: new Date().toISOString() }
        saveProject(imported)
        useProjectStore.getState().setProject(imported)
        toast(`已导入「${imported.title}」`)
        router.push(`/project/${newId}/${imported.currentPhase ?? 'world'}`)
      } catch {
        toast('导入失败：无法解析 JSON 文件')
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const refresh = useCallback(() => {
    setProjects(listProjects().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  }, [])

  useEffect(() => {
    refresh()
    if (searchParams.get('new') === '1') setShowNew(true)
  }, [refresh, searchParams])

  function handleCreate() {
    if (!newTitle.trim()) return
    const p = createEmptyProject(newTitle.trim())
    if (selectedTemplate) { p.worldAnchor = selectedTemplate.world; p.phaseProgress.world = 'in_progress' }
    saveProject(p)
    useProjectStore.getState().setProject(p)
    router.push(`/project/${p.id}/world`)
  }

  async function confirmArchive() {
    if (!deletingId) return
    const title = projects.find(p => p.id === deletingId)?.title ?? '项目'
    archiveProject(deletingId)
    await fetch(`/api/projects/${deletingId}/archive`, { method: 'POST' }).catch(() => {})
    refresh()
    setDeletingId(null)
    toast(`「${title}」已归档，可在归档室找回`)
  }

  async function confirmDelete() {
    if (!deletingId) return
    const title = projects.find(p => p.id === deletingId)?.title ?? '项目'
    deleteProject(deletingId)
    await fetch(`/api/projects/${deletingId}`, { method: 'DELETE' }).catch(() => {})
    refresh()
    setDeletingId(null)
    toast(`「${title}」已删除`)
  }

  function openArchive() {
    setArchivedProjects(listArchivedProjects())
    setShowArchive(true)
  }

  function handleRestore(id: string) {
    restoreProject(id)
    fetch(`/api/projects/${id}/archive`, { method: 'DELETE' }).catch(() => {})
    setArchivedProjects(listArchivedProjects())
    refresh()
    toast('项目已恢复')
  }

  async function handlePermDelete(id: string) {
    permanentDeleteProject(id)
    await fetch(`/api/projects/${id}/archive`, { method: 'DELETE' }).catch(() => {})
    setArchivedProjects(listArchivedProjects())
    setPermDeleteId(null)
  }

  const phaseIndex = (phase: string) => PHASE_STEPS.indexOf(phase)

  return (
    <div className="min-h-screen filmgame-shell flex flex-col">

      {/* ── Top nav ── */}
      <div className="max-w-6xl mx-auto w-full px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <button
            onClick={() => router.push('/')}
            className="text-xs font-medium tracking-wide transition-colors shrink-0"
            style={{ color: 'var(--shell-fg-3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--shell-fg-3)' }}
          >
            ← 首页
          </button>
          <span style={{ color: 'var(--shell-border)' }} className="text-xs select-none">|</span>
          <ShellWordmark size="sm" />
        </div>
        <div className="flex gap-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportJson}
          />
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2.5 text-sm font-medium tracking-wider transition-all"
            style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-3)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--shell-fg)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--shell-border)'; e.currentTarget.style.color = 'var(--shell-fg-3)' }}
          >
            ⚙
          </button>
          <button
            onClick={openArchive}
            className="px-5 py-2.5 text-sm font-medium tracking-wider transition-all"
            style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-3)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--shell-fg)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--shell-border)'; e.currentTarget.style.color = 'var(--shell-fg-3)' }}
          >
            归档室
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-5 py-2.5 text-sm font-medium tracking-wider transition-all"
            style={{ border: '1px solid var(--gold-dim)', color: 'var(--gold-mid)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-bright)'; e.currentTarget.style.color = 'var(--gold-bright)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--gold-mid)' }}
          >
            导入 JSON
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="px-5 py-2.5 text-sm font-medium tracking-wider transition-all"
            style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold-bright)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--gold-mid)' }}
          >
            + 新建项目
          </button>
        </div>
      </div>

      <GoldBar />

      {/* ── Page header ── */}
      <div className="relative overflow-hidden">
        <ArtDecoStepCorner corner="tl" size={180} steps={8} opacity={0.4} className="top-0 left-0" />
        <ArtDecoStepCorner corner="tr" size={180} steps={8} opacity={0.4} className="top-0 right-0" />

        <div className="max-w-6xl mx-auto w-full px-8 py-14 relative z-10">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-[0.35em] mb-4" style={{ color: 'var(--gold-dim)' }}>
              创作档案
            </p>
            <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--shell-fg)' }}>
              我的项目
            </h1>
            <p className="text-lg mt-3" style={{ color: 'var(--shell-fg-2)' }}>
              {projects.length === 0 ? '还没有项目，现在开始创作' : `共 ${projects.length} 个项目`}
            </p>
          </div>
        </div>
      </div>

      <GoldBar />

      {/* ── Project grid / empty state ── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-12">

        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ArtDecoStepCorner corner="tl" size={80} opacity={0.2} className="top-8 left-8" />
            <ArtDecoStepCorner corner="br" size={80} opacity={0.2} className="bottom-8 right-8" />

            <div className="mb-8">
              <ArtDecoRule className="w-48 mx-auto" />
            </div>
            <p className="text-2xl font-light tracking-wider mb-3" style={{ color: 'var(--shell-fg-2)' }}>
              档案室空空如也
            </p>
            <p className="text-base mb-12" style={{ color: 'var(--shell-fg-3)' }}>
              每一个伟大的故事，都从第一个节点开始
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="px-12 py-4 text-base font-medium tracking-widest transition-all"
              style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold-bright)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--gold-mid)' }}
            >
              创建第一个项目
            </button>
            <div className="mt-8">
              <ArtDecoRule className="w-48 mx-auto" />
            </div>
          </div>
        ) : (
          /* Project cards */
          <div className="grid grid-cols-3 gap-5">
            {projects.map(p => {
              const step = phaseIndex(p.currentPhase)
              return (
                <div
                  key={p.id}
                  onClick={() => deletingId !== p.id && router.push(`/project/${p.id}/${p.currentPhase}`)}
                  className="group relative flex flex-col cursor-pointer transition-all duration-200 hover:-translate-y-1"
                  style={{ background: 'var(--shell-mid)', border: '1px solid var(--gold-dim)' }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--gold-bright)'
                    el.style.background = 'var(--shell-raised)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--gold-dim)'
                    el.style.background = 'var(--shell-mid)'
                  }}
                >
                  {/* Corner brackets */}
                  {([
                    ['top-0 left-0',    'M 0 14 L 0 0 L 14 0'],
                    ['top-0 right-0',   'M 2 0 L 16 0 L 16 14'],
                    ['bottom-0 left-0', 'M 0 2 L 0 16 L 14 16'],
                    ['bottom-0 right-0','M 16 2 L 16 16 L 2 16'],
                  ] as const).map(([pos, path]) => (
                    <span key={pos} className={`absolute ${pos} opacity-40 group-hover:opacity-90 transition-opacity pointer-events-none`}>
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d={path} fill="none" stroke="var(--gold-bright)" strokeWidth="2"/>
                      </svg>
                    </span>
                  ))}

                  {/* Card body */}
                  <div className="p-6 flex-1">
                    <h2 className="text-xl font-bold leading-snug mb-2" style={{ color: 'var(--shell-fg)' }}>
                      {p.title}
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--shell-fg-3)' }}>
                      {p.nodeCount} 个节点 · {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>

                  {/* Progress bar — 5 phase steps */}
                  <div style={{ borderTop: '1px solid var(--shell-border)' }}>
                    <div className="px-6 py-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        {PHASE_STEPS.map((ph, i) => (
                          <div key={ph} className="flex-1 flex flex-col gap-1">
                            <div
                              className="h-1.5 transition-all"
                              style={{
                                background: i < step ? 'var(--gold-mid)' : i === step ? 'var(--gold-bright)' : 'var(--shell-border)',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium tracking-wider" style={{ color: 'var(--gold-mid)' }}>
                          {PHASE_LABELS[p.currentPhase] ?? p.currentPhase}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--shell-fg-3)' }}>
                          {step + 1} / {PHASE_STEPS.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Archive control */}
                  {deletingId === p.id ? (
                    <div
                      className="px-6 py-3 flex flex-col gap-2"
                      style={{ background: 'rgba(180,150,30,0.08)', borderTop: '1px solid var(--gold-dim)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm shrink-0" style={{ color: 'var(--shell-fg-2)' }}>移除此项目？</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs px-3 py-1.5 transition-all"
                            style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-2)' }}
                          >
                            取消
                          </button>
                          <button
                            onClick={confirmArchive}
                            className="text-xs px-3 py-1.5 transition-all"
                            style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}
                          >
                            归档
                          </button>
                          <button
                            onClick={confirmDelete}
                            className="text-xs px-3 py-1.5 bg-red-700 text-white"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--shell-fg-3)' }}>归档可在归档室找回，删除不可恢复</span>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingId(p.id) }}
                      className="absolute top-4 right-4 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      style={{ color: 'var(--shell-fg-3)' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AISettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* ── Archive Modal ── */}
      {showArchive && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(26,31,62,0.92)' }} onClick={() => { setShowArchive(false); setPermDeleteId(null) }}>
          <div
            className="relative w-full max-w-xl p-8 shadow-2xl max-h-[80vh] flex flex-col"
            style={{ background: 'var(--shell-mid)', border: '2px solid var(--gold-dim)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--shell-fg)' }}>
              归档室
            </h2>
            <div className="deco-rule mb-6" />
            <div className="flex-1 overflow-y-auto">
              {archivedProjects.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--shell-fg-3)' }}>归档室空无一物</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {archivedProjects.map(p => (
                    <div key={p.id} className="px-4 py-3" style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium mb-1" style={{ color: 'var(--shell-fg)' }}>{p.title}</p>
                          <p className="text-xs" style={{ color: 'var(--shell-fg-3)' }}>
                            归档于 {p.archivedAt ? new Date(p.archivedAt).toLocaleString('zh-CN') : '未知'}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => { handleRestore(p.id) }}
                            className="text-xs px-3 py-1.5 transition-all"
                            style={{ border: '1px solid var(--gold-dim)', color: 'var(--gold-mid)', background: 'transparent' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-bright)'; e.currentTarget.style.color = 'var(--gold-bright)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--gold-mid)' }}
                          >
                            恢复
                          </button>
                          {permDeleteId === p.id ? (
                            <div className="flex gap-1.5 items-center">
                              <span className="text-xs" style={{ color: 'var(--shell-fg-3)' }}>确认永久删除？</span>
                              <button
                                onClick={() => setPermDeleteId(null)}
                                className="text-xs px-2 py-1"
                                style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-3)' }}
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handlePermDelete(p.id)}
                                className="text-xs px-2 py-1 bg-red-600 text-white"
                              >
                                永久删除
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPermDeleteId(p.id)}
                              className="text-xs px-3 py-1.5 transition-all"
                              style={{ border: '1px solid rgba(220,38,38,0.4)', color: 'rgba(220,38,38,0.8)', background: 'transparent' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.8)'; e.currentTarget.style.color = 'rgb(220,38,38)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)'; e.currentTarget.style.color = 'rgba(220,38,38,0.8)' }}
                            >
                              永久删除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6">
              <button
                onClick={() => { setShowArchive(false); setPermDeleteId(null) }}
                className="w-full py-3 text-sm font-medium tracking-wider transition-all"
                style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-2)', background: 'transparent' }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Project Modal ── */}
      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(26,31,62,0.88)' }}>
          <div className="relative w-full max-w-md p-8 shadow-2xl" style={{ background: 'var(--shell-mid)', border: '2px solid var(--gold-dim)' }}>

            {([
              ['top-0 left-0',    'M 0 18 L 0 0 L 18 0'],
              ['top-0 right-0',   'M 2 0 L 20 0 L 20 18'],
              ['bottom-0 left-0', 'M 0 2 L 0 20 L 18 20'],
              ['bottom-0 right-0','M 20 2 L 20 20 L 2 20'],
            ] as const).map(([pos, path]) => (
              <span key={pos} className={`absolute ${pos} pointer-events-none`}>
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <path d={path} fill="none" stroke="var(--gold-bright)" strokeWidth="2"/>
                </svg>
              </span>
            ))}

            <h2 className="text-xl font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--shell-fg)' }}>
              新建项目
            </h2>
            <div className="deco-rule mb-6" />

            <input
              autoFocus
              type="text"
              placeholder="项目标题（如：禁忌小镇）"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full px-4 py-3 text-sm focus:outline-none mb-5"
              style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)', color: 'var(--shell-fg)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--shell-border)' }}
            />

            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--shell-fg-3)' }}>从模板开始</p>
              <div className="grid grid-cols-3 gap-2.5">
                {PROJECT_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setNewTitle(t.title); setSelectedTemplate(t) }}
                    className="text-left p-3 text-sm transition-all"
                    style={{
                      background: selectedTemplate?.id === t.id ? 'var(--gold-trace)' : 'var(--shell-raised)',
                      border: `1px solid ${selectedTemplate?.id === t.id ? 'var(--gold-mid)' : 'var(--shell-border)'}`,
                      color: selectedTemplate?.id === t.id ? 'var(--gold-bright)' : 'var(--shell-fg-2)',
                    }}
                  >
                    <div className="text-xl mb-1.5">{t.emoji}</div>
                    <div className="font-medium">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowNew(false); setNewTitle(''); setSelectedTemplate(null) }}
                className="flex-1 py-3 text-sm font-medium tracking-wider transition-all"
                style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-2)', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--shell-fg)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--shell-border)'; e.currentTarget.style.color = 'var(--shell-fg-2)' }}
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="flex-1 py-3 text-sm font-medium tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}
                onMouseEnter={e => { if (newTitle.trim()) e.currentTarget.style.background = 'var(--gold-bright)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--gold-mid)' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">加载中...</div>}>
      <ProjectsPageInner />
    </Suspense>
  )
}
