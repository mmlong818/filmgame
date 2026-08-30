'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSelectedLayoutSegment, useParams } from 'next/navigation'
import Link from 'next/link'
import { useProjectStore } from '@/lib/store/projectStore'
import { hasPendingWrites, flushPendingWrites } from '@/lib/persistence'
import { useToast } from '@/app/components/toast'
import { PHASES } from '@/lib/types/phase'
import type { Phase } from '@/lib/types/phase'
import { SaveStatusIndicator } from '@/app/components/save-status-indicator'
import { Button } from '@/app/components/ui/button'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const segment = useSelectedLayoutSegment()
  const params = useParams()
  const id = params.id as string
  const { project, hydrateProject, renameProject, setAiMode, saveConflict, stale, clearConflict, clearStale, hydrated, offline } = useProjectStore()
  const { toast } = useToast()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // DB 为准的异步水合：先本地快照乐观 paint（hydrateProject 内部处理），再 GET 对账，DB 胜出。
  // 用 hydrated（而非仅 project.id===id）判断是否需要重新对账：即使 project 已经是这个
  // id（例如 /project/[id] 跳转页先用 loadProject 做了本地快照 paint），只要尚未真正
  // GET 对账过，仍必须调用 hydrateProject，否则 persistence 层的 hydration 门禁会永久
  // 阻断该项目的保存请求。
  useEffect(() => {
    // offline（对账失败、以本地快照离线工作）也视为"本轮对账已结束"，否则每次编辑
    // 换新 project 引用都会重新触发 hydrateProject，形成失败请求的无限重试循环。
    if (project && project.id === id && (hydrated || offline)) return
    setNotFound(false)
    setLoadError(false)
    let cancelled = false
    ;(async () => {
      const result = await hydrateProject(id)
      if (cancelled) return
      if (result === 'not-found') setNotFound(true)
      else if (result === 'error') setLoadError(true)
    })()
    return () => { cancelled = true }
  }, [id, project, hydrated, offline, hydrateProject])

  // 离线兜底后网络恢复：自动重新对账。hydrateProject 会以首次乐观 paint 的基线做
  // 字段级合并，把离线期间的编辑带回服务端（乐观锁生效）。
  useEffect(() => {
    function handleOnline() {
      const st = useProjectStore.getState()
      if (st.project?.id === id && !st.hydrated) void hydrateProject(id)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [id, hydrateProject])

  useEffect(() => {
    function handleStorageError(e: Event) {
      const detail = (e as CustomEvent).detail
      toast(detail?.message ?? '本地存储空间不足，请清理旧项目', 'error')
    }
    window.addEventListener('filmgame:storage-error', handleStorageError)
    return () => window.removeEventListener('filmgame:storage-error', handleStorageError)
  }, [toast])

  // 关闭/刷新前兜底：防抖窗口内还有未落库的写入时，立即冲刷（首次尝试 keepalive，
  // 关页后仍可送达）并弹浏览器确认框，双保险防止最后 ~1 秒的输入丢失。
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      // 离线/未对账期间的编辑不在任何保存计时器或队列里（网络保存被门禁挡下），
      // 只能靠 paintBase 与当前 project 的引用差异识别，单独判定
      const st = useProjectStore.getState()
      const unsyncedOffline = !st.hydrated && st.project?.id === id && !!st.paintBase && st.project !== st.paintBase
      if (!hasPendingWrites(id) && !unsyncedOffline) return
      flushPendingWrites(id)
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [id])

  function handleReloadLatest() {
    clearConflict()
    clearStale()
    void hydrateProject(id)
  }

  function toggleAiMode() {
    if (!project) return
    const current = project.aiMode ?? 'thinking'
    const next = current === 'fast' ? 'thinking' : 'fast'
    setAiMode(next)
    toast(`后续 AI 生成将使用${next === 'fast' ? '快速' : '思考'}模式`)
  }

  function openCommandPalette() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  if (notFound) {
    return (
      <div className="min-h-screen corkboard flex items-center justify-center px-4">
        <div className="paper-sheet px-10 py-9 text-center max-w-sm">
          <div className="text-5xl mb-5 opacity-40">🎬</div>
          <h2 className="text-lg font-semibold text-ink mb-2">项目不存在</h2>
          <p className="text-sm text-pencil mb-6">该项目可能已被删除，或链接已失效</p>
          <Link href="/projects">
            <Button variant="primary">返回项目列表</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (loadError && !project) {
    return (
      <div className="min-h-screen corkboard flex items-center justify-center px-4">
        <div className="paper-sheet px-10 py-9 text-center max-w-sm">
          <div className="text-5xl mb-5 opacity-40">🛰️</div>
          <h2 className="text-lg font-semibold text-ink mb-2">网络异常，无法加载项目</h2>
          <p className="text-sm text-pencil mb-6">请检查网络连接后重试</p>
          <div className="flex items-center gap-3 justify-center">
            <Button variant="primary" onClick={() => { setLoadError(false); void hydrateProject(id) }}>重试</Button>
            <Link href="/projects">
              <Button variant="secondary">返回项目列表</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen corkboard flex items-center justify-center">
        <div className="text-sm text-pencil">加载中...</div>
      </div>
    )
  }

  const currentSegment = (segment ?? '') as Phase

  return (
    <div className="min-h-screen corkboard flex flex-col">
      <header className="relative shrink-0 flex items-center gap-3 px-4 h-14 bg-paper-dim border-b border-line">
        {/* Back */}
        <Link
          href="/projects"
          className="text-xs font-medium text-pencil hover:text-ink transition-colors shrink-0 cursor-pointer"
        >
          ← 返回
        </Link>

        <span className="text-line-soft select-none text-xs">|</span>

        {/* Title — 纸胶带标签 */}
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
            className="tape-label text-sm font-medium outline-none bg-transparent max-w-48 text-ink border-b border-vermilion"
          />
        ) : (
          <h1
            className="tape-label text-sm font-medium cursor-pointer transition-colors truncate max-w-48 text-ink hover:text-vermilion"
            onClick={() => { setTitleDraft(project.title); setEditingTitle(true) }}
            title="点击重命名"
          >
            {project.title}
          </h1>
        )}

        {/* AI 双模式徽标：点击切换，后续 AI 动作按新模式执行 */}
        <button
          onClick={toggleAiMode}
          title="点击切换 AI 生成模式"
          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors shrink-0 cursor-pointer border ${
            (project.aiMode ?? 'thinking') === 'fast'
              ? 'bg-amberink/15 text-amberink border-amberink/40 hover:bg-amberink/25'
              : 'bg-inkblue/10 text-inkblue border-inkblue/35 hover:bg-inkblue/20'
          }`}
        >
          {(project.aiMode ?? 'thinking') === 'fast' ? '⚡ 快速' : '🧠 思考'}
        </button>

        {/* Phase tabs — 标签贴纸 */}
        <nav className="flex items-center ml-4 gap-1">
          {PHASES.map((phase, i) => {
            const status = project.phaseProgress[phase.key]
            const isActive = currentSegment === phase.key

            if (status === 'locked') {
              return (
                <span
                  key={phase.key}
                  className="text-xs font-medium px-3 py-1.5 rounded-t-sm text-pencil/40 cursor-not-allowed"
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
                className={`relative text-xs font-medium px-3 py-1.5 rounded-t-sm border border-b-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-paper text-ink font-semibold border-line shadow-[var(--shadow-card)] before:content-[\'\'] before:absolute before:-top-1 before:left-1/2 before:-translate-x-1/2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-vermilion before:shadow-sm'
                    : 'bg-paper/60 text-pencil border-line-soft hover:bg-paper hover:text-ink'
                }`}
              >
                {status === 'done' && <span className="text-leaf mr-1">✓</span>}
                {i + 1}. {phase.label}
                {phaseBadge}
                {phase.key === 'validate' && project.downstreamStale && (
                  <span className="absolute top-1 right-0.5 w-1.5 h-1.5 bg-vermilion rounded-full" title="有改动，建议重新校验" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Save status + conflict/stale/offline banner */}
        <div className="ml-auto flex items-center gap-3">
          {(saveConflict || stale || offline) && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-1.5 bg-paper border-l-[3px] text-ink ${
                saveConflict || stale ? 'border-vermilion' : 'border-inkblue'
              }`}
            >
              <span>{saveConflict ? '保存冲突：已在别处修改' : stale ? '其他标签页有更新' : '离线模式：改动暂存本地，恢复连接后自动同步'}</span>
              <button
                onClick={handleReloadLatest}
                className={`underline font-medium shrink-0 cursor-pointer ${
                  saveConflict || stale ? 'text-vermilion hover:text-vermilion-deep' : 'text-inkblue hover:opacity-70'
                }`}
              >
                {saveConflict || stale ? '点击加载最新' : '点击重连'}
              </button>
            </div>
          )}
          <SaveStatusIndicator projectId={project.id} />
        </div>

        {/* ⌘K 命令面板入口 */}
        <button
          type="button"
          title="打开命令面板"
          onClick={openCommandPalette}
          className="font-mono text-xs text-pencil border border-line px-2 py-1 bg-paper hover:border-inkblue hover:text-inkblue transition-colors cursor-pointer"
        >
          ⌘K
        </button>

        <Link
          href={`/project/${project.id}/preview`}
          className={`text-xs px-3 py-1.5 font-medium transition-colors border cursor-pointer ${
            segment === 'preview'
              ? 'bg-vermilion text-paper border-vermilion'
              : 'border-line text-ink-soft hover:bg-paper hover:text-ink'
          }`}
        >
          ▶ 预览
        </Link>
      </header>

      <main className="flex-1 overflow-auto bg-paper">
        {children}
      </main>
    </div>
  )
}
