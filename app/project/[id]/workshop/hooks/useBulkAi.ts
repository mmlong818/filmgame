import { useCallback, useEffect, useRef, useState } from 'react'
import { setRunningGeneration } from '@/lib/ui/pendingDraftGuard'
import { nanoid } from 'nanoid'
import { aiFetch } from '@/lib/ai/client'
import type { Project, StoryNode, DialogueLine } from '@/lib/types/project'
import type { BulkScope } from '../components/BulkAiControls'

interface Params {
  project: Project | null
  selectedId: string | null
  updateNode: (id: string, patch: Partial<StoryNode>) => void
  toast: (message: string, type?: 'success' | 'error' | 'info') => void
}

// 批量 AI 设计的状态机：范围选择（全部/当前章/当前幕）、生成+精修两轮、
// 取消、失败节点追踪与仅重试失败项。抽成独立 hook 避免 workshop 主页面继续膨胀
// （该页面在本次改动前已超过 800 行规范）。
export function useBulkAi({ project, selectedId, updateNode, toast }: Params) {
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; phase: 'generate' | 'refine' } | null>(null)
  const [bulkScope, setBulkScope] = useState<BulkScope>('act')
  // 失败清单持久化：此前只在组件 state 里，刷新后「12 个节点生成失败」与「仅重试失败项」
  // 一起消失（真实检查 6.8 实测）。按项目存 localStorage，加载时剔除已不存在的节点。
  const failedKey = project ? `filmgame:bulk-failed:${project.id}` : null
  const [bulkFailedIds, setBulkFailedIdsState] = useState<string[]>([])
  const loadedFailedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!failedKey || !project || loadedFailedFor.current === failedKey) return
    loadedFailedFor.current = failedKey
    try {
      const raw = localStorage.getItem(failedKey)
      if (!raw) return
      const alive = new Set(project.nodes.map(n => n.id))
      const ids = (JSON.parse(raw) as string[]).filter(id => alive.has(id))
      if (ids.length) setBulkFailedIdsState(ids)
    } catch { /* ignore */ }
  }, [failedKey, project])
  const setBulkFailedIds = useCallback((ids: string[]) => {
    setBulkFailedIdsState(ids)
    if (!failedKey) return
    try { ids.length ? localStorage.setItem(failedKey, JSON.stringify(ids)) : localStorage.removeItem(failedKey) } catch { /* ignore */ }
  }, [failedKey])
  // 进行中登记：离开页面前由 layout 的导航守卫询问，关页由 beforeunload 兜底
  useEffect(() => {
    setRunningGeneration(bulkLoading ? '批量 AI 设计' : null)
    return () => setRunningGeneration(null)
  }, [bulkLoading])
  const bulkCancelRef = useRef(false)
  // 与协作式取消标志配套：中止当前批量运行里所有在飞请求，而不只是让循环停止发起下一轮。
  const bulkCtlRef = useRef<AbortController | null>(null)

  // 组件卸载即中止：遮罩没覆盖顶栏，用户可在批量运行期间点「返回」或切阶段离开本页，
  // 此前循环不绑生命周期，会在用户看不到也无法取消的情况下继续跑完并静默 updateNode
  // （不经 pushUndo，撤销不了），还可能与用户之后的手动编辑撞车。
  useEffect(() => () => {
    bulkCancelRef.current = true
    bulkCtlRef.current?.abort()
  }, [])

  // 批量范围解析：全部 / 当前幕（selectedId 所在 act）/ 当前章（该 act 所属 chapter 下所有 act）。
  // 没有选中节点时退化为全部节点，调用方 UI 会提示这一回退。
  function getScopedNodes(scope: BulkScope): StoryNode[] {
    if (!project) return []
    if (scope === 'all' || !selectedId) return project.nodes
    const act = project.acts.find(a => a.nodeIds.includes(selectedId))
    if (!act) return project.nodes
    if (scope === 'act') {
      const idSet = new Set(act.nodeIds)
      return project.nodes.filter(n => idSet.has(n.id))
    }
    const chapterActs = project.acts.filter(a => a.chapterId === act.chapterId)
    const idSet = new Set(chapterActs.flatMap(a => a.nodeIds))
    return project.nodes.filter(n => idSet.has(n.id))
  }

  // 批量第一轮（生成）的可复用执行体：初次批量运行、失败重试都走这里。
  // patches 由调用方持有并原地写入——用于第二轮精修判断"哪些节点仍偏薄"，
  // 不能依赖 project.nodes（批量耗时可能数分钟，之后 project 引用会随外部重渲染变化）。
  async function runGeneratePass(nodesToProcess: StoryNode[], patches: Record<string, Partial<StoryNode>>, signal: AbortSignal): Promise<string[]> {
    if (!project) return []
    const ctx = { worldAnchor: project.worldAnchor, characters: project.characters, variables: project.variables }
    const failed: string[] = []
    for (const node of nodesToProcess) {
      if (bulkCancelRef.current) break
      let succeeded = false
      try {
        const [eRes, dRes] = await Promise.all([
          aiFetch('workshop', 'fill_emotion', { node, ...ctx }, { signal }),
          aiFetch('workshop', 'write_dialogue', { node, ...ctx }, { signal }),
        ])
        const [eData, dData] = await Promise.all([eRes.json(), dRes.json()])
        const patch: Partial<StoryNode> = {}
        if (eData.ok && eData.result) patch.emotionFunction = eData.result
        if (dData.ok && dData.result?.dialogue) {
          patch.dialogue = dData.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) }))
          if (dData.result.sceneDesc) patch.sceneDesc = dData.result.sceneDesc as string
        }
        if (Object.keys(patch).length > 0) {
          patches[node.id] = patch
          updateNode(node.id, patch)
        }
        succeeded = !!dData.ok
      } catch { /* succeeded 保持 false，计入失败清单（含用户主动中止的在飞请求） */ }
      if (!succeeded) failed.push(node.id)
      setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null)
    }
    return failed
  }

  async function retryFailedNodes() {
    if (!project || bulkFailedIds.length === 0) return
    const nodesToRetry = project.nodes.filter(n => bulkFailedIds.includes(n.id))
    bulkCancelRef.current = false
    const ctl = new AbortController()
    bulkCtlRef.current = ctl
    setBulkLoading(true)
    setBulkProgress({ done: 0, total: nodesToRetry.length, phase: 'generate' })
    const patches: Record<string, Partial<StoryNode>> = {}
    const failed = await runGeneratePass(nodesToRetry, patches, ctl.signal)
    setBulkFailedIds(failed)
    setBulkLoading(false)
    setBulkProgress(null)
    bulkCtlRef.current = null
    if (bulkCancelRef.current) {
      toast('重试已取消', 'error')
    } else if (failed.length > 0) {
      toast(`重试完成，仍有 ${failed.length} 个节点失败`, 'error')
    } else {
      toast('失败节点已全部重新生成', 'success')
    }
  }

  async function runBulkAi() {
    if (!project) return
    bulkCancelRef.current = false
    const ctl = new AbortController()
    bulkCtlRef.current = ctl
    setBulkLoading(true)
    setBulkFailedIds([])
    const nodes = getScopedNodes(bulkScope)
    const ctx = { worldAnchor: project.worldAnchor, characters: project.characters, variables: project.variables }

    // Pass 1: Generate — fill_emotion + write_dialogue for all nodes in scope
    setBulkProgress({ done: 0, total: nodes.length, phase: 'generate' })
    const patches: Record<string, Partial<StoryNode>> = {}
    const failed = await runGeneratePass(nodes, patches, ctl.signal)
    const failedSet = new Set(failed)

    // Pass 2: Refine — critique thin nodes (<6 lines) and auto-revise, skip nodes that failed generation
    const thinNodes = nodes.filter(n => {
      if (failedSet.has(n.id)) return false
      const dl = (patches[n.id]?.dialogue ?? n.dialogue ?? []).length
      return n.type !== 'ending' && dl < 6
    })
    if (!bulkCancelRef.current && thinNodes.length > 0) {
      setBulkProgress({ done: 0, total: thinNodes.length, phase: 'refine' })
      for (const node of thinNodes) {
        if (bulkCancelRef.current) break
        try {
          const updatedNode = { ...node, ...(patches[node.id] ?? {}) }
          const critiqueRes = await aiFetch('workshop', 'scene_analysis', { node: updatedNode, ...ctx }, { signal: ctl.signal })
          const critiqueData = await critiqueRes.json()
          if (!critiqueData.ok) { setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null); continue }
          const reviseRes = await aiFetch('workshop', 'revise_dialogue', { node: updatedNode, critique: critiqueData.result, ...ctx }, { signal: ctl.signal })
          const reviseData = await reviseRes.json()
          if (reviseData.ok && reviseData.result?.dialogue) {
            const revised: Partial<StoryNode> = { dialogue: reviseData.result.dialogue.map((d: DialogueLine) => ({ ...d, id: nanoid(6) })) }
            if (reviseData.result.sceneDesc) revised.sceneDesc = reviseData.result.sceneDesc as string
            updateNode(node.id, revised)
          }
        } catch { /* continue */ }
        setBulkProgress(p => p ? { ...p, done: p.done + 1 } : null)
      }
    }

    setBulkFailedIds(failed)
    setBulkLoading(false)
    setBulkProgress(null)
    bulkCtlRef.current = null
    if (bulkCancelRef.current) {
      toast('批量生成已取消', 'error')
    } else {
      const refined = thinNodes.length > 0 ? `，其中 ${thinNodes.length} 个节点经过精修` : ''
      const failNote = failed.length > 0 ? `，${failed.length} 个节点失败（可重试）` : ''
      toast(`批量 AI 设计完成，${nodes.length} 个节点已处理${refined}${failNote}`, failed.length > 0 ? 'error' : 'success')
    }
  }

  function cancelBulk() {
    bulkCancelRef.current = true
    bulkCtlRef.current?.abort()
  }

  return {
    bulkLoading,
    bulkProgress,
    bulkScope,
    setBulkScope,
    bulkFailedIds,
    setBulkFailedIds,
    getScopedNodes,
    runBulkAi,
    retryFailedNodes,
    cancelBulk,
  }
}
