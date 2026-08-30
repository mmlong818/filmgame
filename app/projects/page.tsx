'use client'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { nanoid } from 'nanoid'
import { createProject, hasUnimportedLegacyData, importLegacyLocalData, removeLocalSnapshot } from '@/lib/persistence'
import { createEmptyProject, useProjectStore } from '@/lib/store/projectStore'
import type { ProjectSummary, AiMode } from '@/lib/types/project'
import { useToast } from '@/app/components/toast'
import { AISettingsModal } from '@/app/components/ai-settings-modal'
import { Button } from '@/app/components/ui/button'
import { IndexCard } from '@/app/components/ui/index-card'
import { ConfirmButton } from '@/app/components/ui/confirm'
import { Modal } from '@/app/components/ui/modal'
import { Skeleton } from '@/app/components/ui/skeleton'
import { Input } from '@/app/components/ui/input'

const PROJECT_TEMPLATES = [
  { id: 'thriller', label: '悬疑惊悚', emoji: '🕵️', title: '未命名悬疑项目', world: { storyCore: '主角发现一个秘密，揭露它将毁掉一切，但不揭露将让错误延续。', theme: '真相的代价——知道真相是否让我们更自由，还是更痛苦？', genre: '悬疑惊悚', worldRules: '1. 每个人都有一个不想被发现的秘密\n2. 真相只会在最意想不到的时刻浮现\n3. 信任一旦破裂无法完全修复', durationMinutes: 90, endingCount: 3 } },
  { id: 'romance',  label: '浪漫爱情', emoji: '💫', title: '未命名爱情项目', world: { storyCore: '两个人在错误的时间相遇，爱上了彼此，但他们各自都有无法共存的过去。', theme: '爱的本质——是占有还是放手？', genre: '浪漫剧情', worldRules: '1. 每个人都在寻找被真正理解的感觉\n2. 过去的伤害会以意想不到的方式重现\n3. 选择意味着放弃另一种可能', durationMinutes: 75, endingCount: 4 } },
  { id: 'scifi',    label: '科幻冒险', emoji: '🚀', title: '未命名科幻项目', world: { storyCore: '人类发现了改变文明的技术，主角必须决定是让它公开还是永远封存。', theme: '进步的悖论——我们有能力做的事，是否都应该去做？', genre: '科幻惊悚', worldRules: '1. 技术可以解决旧问题但必然创造新问题\n2. 没有人能预见自己发明的全部后果\n3. 权力从不会自动消失，只会转移', durationMinutes: 120, endingCount: 4 } },
  { id: 'family',   label: '家庭情感', emoji: '🏠', title: '未命名家庭项目', world: { storyCore: '一个家庭在危机面前，每个成员的选择揭露了他们真正的恐惧和欲望。', theme: '家庭的本质——是血缘的束缚还是选择的归属？', genre: '情感剧', worldRules: '1. 家庭里的沉默比争吵更能积累伤害\n2. 每个成员对同一件事都有完全不同的记忆\n3. 真正的原谅需要首先理解', durationMinutes: 60, endingCount: 3 } },
  { id: 'horror',   label: '恐怖心理', emoji: '👁️', title: '未命名恐怖项目', world: { storyCore: '主角开始怀疑自己的现实——他经历的恐怖，是外在的威胁还是内心崩溃的表现？', theme: '现实的脆弱性——我们所相信的现实，究竟有多少是我们自己构建的？', genre: '心理恐怖', worldRules: '1. 感知无法完全信任，但行动依然有后果\n2. 最大的恐惧来自不确定性而非明确的威胁\n3. 每个人的理智都有一个临界点', durationMinutes: 80, endingCount: 3 } },
]

type ProjectTemplate = typeof PROJECT_TEMPLATES[number]

const AI_MODE_OPTIONS: { id: AiMode; emoji: string; label: string; desc: string }[] = [
  { id: 'fast', emoji: '⚡', label: '快速模式', desc: '快速生成基础剧本结构，适合先搭骨架' },
  { id: 'thinking', emoji: '🧠', label: '思考模式', desc: '深度推理，质量优先，单次生成 1-10 分钟' },
]

const PHASE_LABELS: Record<string, string> = { world: '世界锚点', scale: '规模规划', structure: '故事结构', workshop: '剧本工坊', validate: '全局校验' }
const PHASE_STEPS = ['world', 'scale', 'structure', 'workshop', 'validate']

type SortKey = 'updated' | 'title'

function ProjectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('updated')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [newAiMode, setNewAiMode] = useState<AiMode>('thinking')
  const [showArchive, setShowArchive] = useState(false)
  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showLegacyPrompt, setShowLegacyPrompt] = useState(false)
  const [legacyImporting, setLegacyImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string
        const data = JSON.parse(raw)
        if (!data.id || !data.title || !Array.isArray(data.nodes)) {
          toast('JSON 格式错误：缺少必要字段（id / title / nodes）')
          return
        }
        const newId: string = nanoid(8)
        const base = createEmptyProject(data.title)
        const imported = {
          ...base,
          ...data,
          id: newId,
          updatedAt: new Date().toISOString(),
          phaseProgress: { ...base.phaseProgress, ...(data.phaseProgress ?? {}) },
        }
        const result = await createProject(imported)
        if (!result.ok) {
          toast(`导入失败：${result.error}`, 'error')
          return
        }
        useProjectStore.getState().setProject(result.project, 1)
        toast(`已导入「${result.project.title}」`)
        router.push(`/project/${newId}/${result.project.currentPhase ?? 'world'}`)
      } catch {
        toast('导入失败：无法解析 JSON 文件')
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const refresh = useCallback(() => {
    fetch('/api/projects').then(res => res.json()).then(data => {
      if (!data.ok || !Array.isArray(data.projects)) return
      setProjects((data.projects as ProjectSummary[]).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
    }).catch(() => toast('无法加载项目列表，请检查网络', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    refresh()
    if (searchParams.get('new') === '1') setShowNew(true)
    if (hasUnimportedLegacyData()) setShowLegacyPrompt(true)
  }, [refresh, searchParams])

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? projects.filter(p => p.title.toLowerCase().includes(q)) : projects
    return [...list].sort((a, b) => sortBy === 'title'
      ? a.title.localeCompare(b.title, 'zh-CN')
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [projects, search, sortBy])

  async function handleLegacyImport() {
    setLegacyImporting(true)
    try {
      const report = await importLegacyLocalData()
      if (report.failed === 0) {
        toast(`本地数据导入完成：新增 ${report.imported} 个，跳过 ${report.skipped} 个（服务端已是最新）`)
        setShowLegacyPrompt(false)
      } else {
        toast(`导入部分完成：成功 ${report.imported}，跳过 ${report.skipped}，失败 ${report.failed}（本地数据已保留，可重试）`, 'error')
      }
      refresh()
    } finally {
      setLegacyImporting(false)
    }
  }

  function openNewModal() { setShowNew(true) }
  function closeNewModal() {
    setShowNew(false)
    setNewTitle('')
    setSelectedTemplate(null)
    setNewAiMode('thinking')
  }

  function pickTemplate(t: ProjectTemplate) {
    setSelectedTemplate(t)
    // 只在标题为空时代填模板标题，避免覆盖用户已输入的内容
    setNewTitle(prev => (prev.trim() ? prev : t.title))
  }

  async function handleCreate() {
    if (!newTitle.trim()) return
    const p = createEmptyProject(newTitle.trim(), newAiMode)
    if (selectedTemplate) { p.worldAnchor = selectedTemplate.world; p.phaseProgress.world = 'in_progress' }
    const result = await createProject(p)
    if (!result.ok) {
      toast(`创建失败：${result.error}`, 'error')
      return
    }
    useProjectStore.getState().setProject(result.project, 1)
    router.push(`/project/${result.project.id}/world`)
  }

  async function handleArchive(id: string) {
    const title = projects.find(p => p.id === id)?.title ?? '项目'
    try {
      const res = await fetch(`/api/projects/${id}/archive`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '归档失败')
      removeLocalSnapshot(id)
      refresh()
      toast(`「${title}」已归档，可在归档室找回`)
    } catch (err) {
      toast(`归档失败：${String(err)}`, 'error')
    }
  }

  async function handleDelete(id: string) {
    const title = projects.find(p => p.id === id)?.title ?? '项目'
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '删除失败')
      removeLocalSnapshot(id)
      refresh()
      toast(`「${title}」已删除`)
    } catch (err) {
      toast(`删除失败：${String(err)}`, 'error')
    }
  }

  async function openArchive() {
    setShowArchive(true)
    try {
      const res = await fetch('/api/projects?archived=true')
      const data = await res.json()
      if (data.ok && Array.isArray(data.projects)) {
        setArchivedProjects((data.projects as ProjectSummary[]).filter(p => p.archived))
      }
    } catch {
      toast('无法加载归档室列表', 'error')
    }
  }

  // 注意：恢复语义走 PUT（取消归档），不可用 DELETE —— DB 模型下 DELETE 是硬删除（见
  // app/api/projects/[id]/archive/route.ts 顶部注释），误用会连同节点一起删掉用户项目。
  async function handleRestore(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}/archive`, { method: 'PUT' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '恢复失败')
      setArchivedProjects(prev => prev.filter(p => p.id !== id))
      refresh()
      toast('项目已恢复')
    } catch (err) {
      toast(`恢复失败：${String(err)}`, 'error')
    }
  }

  async function handlePermDelete(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}/archive`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '删除失败')
      removeLocalSnapshot(id)
      setArchivedProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      toast(`永久删除失败：${String(err)}`, 'error')
    }
  }

  const phaseIndex = (phase: string) => PHASE_STEPS.indexOf(phase)

  return (
    <div className="corkboard min-h-screen flex flex-col">

      {/* ── Top nav ── */}
      <div className="max-w-6xl mx-auto w-full px-8 py-5 flex items-center justify-between border-b border-line-soft">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-xs font-medium tracking-wide text-pencil hover:text-ink cursor-pointer transition-colors shrink-0"
          >
            ← 首页
          </button>
          <span className="text-line select-none">|</span>
          <span className="tape-label hand text-lg text-ink">编剧房间</span>
        </div>
        <div className="flex gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportJson}
          />
          <Button variant="ghost" size="sm" aria-label="AI 设置" onClick={() => setShowSettings(true)}>⚙</Button>
          <Button variant="secondary" size="sm" onClick={openArchive}>归档室</Button>
          <Button variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>导入 JSON</Button>
          <Button variant="primary" size="sm" onClick={openNewModal}>+ 新建项目</Button>
        </div>
      </div>

      {/* ── Legacy localStorage import prompt ── */}
      {showLegacyPrompt && (
        <div className="max-w-6xl mx-auto w-full px-8 pt-5">
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-paper border border-line">
            <p className="text-sm text-ink-soft">
              检测到浏览器本地存有未同步到服务端的旧数据，是否现在导入？（不会删除本地数据）
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowLegacyPrompt(false)}>稍后</Button>
              <Button variant="primary" size="sm" disabled={legacyImporting} onClick={handleLegacyImport}>
                {legacyImporting ? '导入中…' : '立即导入'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="max-w-6xl mx-auto w-full px-8 py-10">
        <span className="tape-label text-xs uppercase tracking-[0.3em] text-ink-soft inline-block mb-4">
          创作档案
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          我的项目
        </h1>
        <p className="text-sm mt-2 text-pencil">
          {projects.length === 0 ? '还没有项目，现在开始创作' : `共 ${projects.length} 个项目`}
        </p>
      </div>

      {/* ── Search / sort / grid ── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-8 pb-14">

        {!loading && projects.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap mb-6">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索项目标题…"
              className="max-w-xs"
            />
            <div className="flex items-center gap-1.5 ml-auto text-xs text-pencil">
              <span>排序</span>
              <Button size="sm" variant={sortBy === 'updated' ? 'primary' : 'ghost'} onClick={() => setSortBy('updated')}>更新时间</Button>
              <Button size="sm" variant={sortBy === 'title' ? 'primary' : 'ghost'} onClick={() => setSortBy('title')}>标题</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="bg-paper border border-line/70 px-4 py-4 flex flex-col gap-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-1.5 w-full mt-2" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          /* 真正的空态：从未创建过项目 */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="hand text-2xl text-ink-soft mb-3">
              档案室空空如也
            </p>
            <p className="text-sm mb-10 text-pencil">
              每一个伟大的故事，都从第一个节点开始
            </p>
            <Button variant="primary" onClick={openNewModal}>创建第一个项目</Button>
          </div>
        ) : visibleProjects.length === 0 ? (
          /* 搜索无结果 */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-base text-pencil">没有标题匹配「{search}」的项目</p>
          </div>
        ) : (
          /* Project cards */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleProjects.map(p => {
              const step = phaseIndex(p.currentPhase)
              return (
                <IndexCard
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}/${p.currentPhase}`)}
                  className="flex flex-col"
                >
                  <div className="flex flex-col gap-3">
                    <h2 className="text-base font-semibold leading-snug text-ink line-clamp-2">
                      {p.title}
                    </h2>
                    <p className="courier text-[11px] text-pencil">
                      {p.nodeCount} 个节点 · {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                    </p>

                    {/* Progress bar — 5 phase steps */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        {PHASE_STEPS.map((ph, i) => (
                          <div
                            key={ph}
                            className={`h-1.5 flex-1 transition-all ${i < step ? 'bg-inkblue/60' : i === step ? 'bg-vermilion' : 'bg-line'}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="tape-label text-[10px] tracking-wider text-ink-soft">
                          {PHASE_LABELS[p.currentPhase] ?? p.currentPhase}
                        </span>
                        <span className="text-[11px] text-pencil">
                          {step + 1} / {PHASE_STEPS.length}
                        </span>
                      </div>
                    </div>

                    {/* Card actions */}
                    <div
                      className="flex justify-end gap-2 pt-1 border-t border-line-soft mt-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <ConfirmButton
                        size="sm"
                        variant="secondary"
                        confirmLabel="确认归档"
                        onConfirm={() => handleArchive(p.id)}
                      >
                        归档
                      </ConfirmButton>
                      <ConfirmButton
                        size="sm"
                        variant="danger"
                        confirmLabel="永久删除，再点一次确认"
                        onConfirm={() => handleDelete(p.id)}
                      >
                        删除
                      </ConfirmButton>
                    </div>
                  </div>
                </IndexCard>
              )
            })}
          </div>
        )}
      </div>

      <AISettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* ── Archive Modal ── */}
      <Modal open={showArchive} onClose={() => setShowArchive(false)} title="归档室" width="md">
        {archivedProjects.length === 0 ? (
          <p className="text-sm py-8 text-center text-pencil">归档室空无一物</p>
        ) : (
          <div className="flex flex-col gap-3">
            {archivedProjects.map(p => (
              <div key={p.id} className="px-4 py-3 bg-paper-dim border border-line-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium mb-1 text-ink">{p.title}</p>
                    <p className="text-xs text-pencil">
                      归档于 {p.archivedAt ? new Date(p.archivedAt).toLocaleString('zh-CN') : '未知'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => handleRestore(p.id)}>恢复</Button>
                    <ConfirmButton
                      size="sm"
                      variant="danger"
                      confirmLabel="永久删除，再点一次确认"
                      onConfirm={() => handlePermDelete(p.id)}
                    >
                      永久删除
                    </ConfirmButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── New Project Modal ── */}
      <Modal
        open={showNew}
        onClose={closeNewModal}
        title="新建项目"
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeNewModal}>取消</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!newTitle.trim()}>创建</Button>
          </>
        }
      >
        <Input
          autoFocus
          placeholder="项目标题（如：禁忌小镇）"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="mb-5"
        />

        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] mb-3 text-pencil">AI 生成模式</p>
          <div className="grid grid-cols-2 gap-2.5">
            {AI_MODE_OPTIONS.map(m => (
              <button
                key={m.id}
                onClick={() => setNewAiMode(m.id)}
                className={`text-left p-3 text-sm cursor-pointer transition-all border ${
                  newAiMode === m.id ? 'bg-paper-dim border-inkblue text-inkblue' : 'bg-paper border-line text-ink-soft hover:bg-paper-dim'
                }`}
              >
                <div className="font-medium mb-1">{m.emoji} {m.label}</div>
                <div className="text-xs opacity-80 leading-snug text-pencil">{m.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-xs mt-2 text-pencil">项目内可随时切换，典型流程：快速搭骨架 → 切思考模式重构精修</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] mb-3 text-pencil">从模板开始</p>
          <div className="grid grid-cols-3 gap-2.5">
            {PROJECT_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => pickTemplate(t)}
                className={`text-left p-3 text-sm cursor-pointer transition-all border ${
                  selectedTemplate?.id === t.id ? 'bg-paper-dim border-inkblue text-inkblue' : 'bg-paper border-line text-ink-soft hover:bg-paper-dim'
                }`}
              >
                <div className="text-xl mb-1.5">{t.emoji}</div>
                <div className="font-medium">{t.label}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="corkboard min-h-screen flex items-center justify-center"><p className="text-sm text-pencil">加载中…</p></div>}>
      <ProjectsPageInner />
    </Suspense>
  )
}
