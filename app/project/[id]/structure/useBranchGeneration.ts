'use client'
// 分支生成流：按章分块调用 + 目标解析（章约束）+ 自动补连 + 跨章缝合落库。
// 从 structure/page.tsx 抽出（该文件曾达 939 行，超过 800 行上限）。
import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '@/lib/store/projectStore'
import { aiJson } from '@/lib/ai/client'
import { AiActionError, isAbortError } from '@/lib/ai/errors'
import { useAiAction } from '@/lib/hooks/useAiAction'
import type { Project, StoryNode } from '@/lib/types/project'
import type { AiChoice, AiNodeChoices, Stage } from './draftTypes'

interface Params {
  project: Project | null
  setStage: (s: Stage) => void
}

export function useBranchGeneration({ project, setStage }: Params) {
  const [branchDraft, setBranchDraft] = useState<AiNodeChoices[] | null>(null)
  const [branchProgress, setBranchProgress] = useState<{ done: number; total: number } | null>(null)
  const branchAi = useAiAction()

  // 按章分块生成：分支拓扑是章内自洽的（跨章连接由「继续」自动补全承担）。
  // v2 每个推进节点产 2-3 选项后，整体单次生成在 26 节点时已需约 17 分钟，
  // 40+ 节点（标准版）必然超时——逐章调用并展示进度，规模只受章数线性影响。
  async function generateBranches(nodes?: StoryNode[]) {
    setStage('branch_loading')
    const fresh = useProjectStore.getState().project!
    const nodeList = nodes ?? fresh.nodes
    const byId = new Map(nodeList.map(n => [n.id, n]))
    const chapterChunks = [...fresh.chapters]
      .sort((a, b) => a.order - b.order)
      .map(ch => fresh.acts
        .filter(a => a.chapterId === ch.id)
        .sort((a, b) => a.order - b.order)
        .flatMap(a => a.nodeIds)
        .map(id => byId.get(id))
        .filter((n): n is StoryNode => Boolean(n)))
      .filter(chunk => chunk.length > 0)
    const chunks = chapterChunks.length > 0 ? chapterChunks : [nodeList]
    setBranchProgress({ done: 0, total: chunks.length })

    const result = await branchAi.run('生成分支', async (signal) => {
      const all: AiNodeChoices[] = []
      for (let i = 0; i < chunks.length; i++) {
        const context = {
          worldAnchor: fresh.worldAnchor,
          characters: fresh.characters,
          variables: fresh.variables,
          nodes: chunks[i].map(n => ({ id: n.id, title: n.title, type: n.type, notes: n.notes })),
        }
        // 单章生成动辄数分钟，瞬时网络断连（Connection error）不该让已完成的章全部作废——
        // 每章自动重试一次；用户主动中止（AbortError）不重试。
        let nodeChoices: AiNodeChoices[] | undefined
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const data = await aiJson<{ result?: { nodeChoices?: AiNodeChoices[] } }>('branches', 'generate', context, signal)
            nodeChoices = data.result?.nodeChoices
            break
          } catch (err) {
            if (isAbortError(err) || attempt === 1) throw err
          }
        }
        if (!Array.isArray(nodeChoices)) throw new AiActionError(`AI 分支返回格式错误（第 ${i + 1}/${chunks.length} 章）`)
        all.push(...nodeChoices)
        setBranchProgress({ done: i + 1, total: chunks.length })
      }
      setBranchDraft(all)
      setStage('branch_preview')
      return true
    })

    setBranchProgress(null)
    if (result === null) setStage('edit')
  }

  // 解析 AI 返回的分支选择为 patch（key = nodeId），不含自动补连
  function resolveChoicePatches(draft: AiNodeChoices[]): Map<string, Partial<StoryNode>> {
    const fresh = useProjectStore.getState().project!
    const nodes = fresh.nodes
    const nodeByTitle = new Map(nodes.map(n => [n.title, n.id]))
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    // 节点 → 所属章：模糊匹配必须限定在源节点同章（+ 下一章首节点）内。
    // 曾因全局模糊匹配把 start 的选项撞到第三章的相似标题上，前段 40 节点整体不可达。
    const chapterOfNode = new Map<string, number>()
    const chapterFirstNode = new Map<number, string>()
    const sortedCh = [...fresh.chapters].sort((a, b) => a.order - b.order)
    sortedCh.forEach((ch, ci) => {
      const ids = fresh.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).flatMap(a => a.nodeIds)
      ids.forEach(id => chapterOfNode.set(id, ci))
      if (ids.length > 0) chapterFirstNode.set(ci, ids[0])
    })

    function resolveTargetId(c: AiChoice, sourceNodeId: string): string {
      const srcCh = chapterOfNode.get(sourceNodeId)
      // 章约束：目标必须在源节点同章，或恰为下一章首节点（跨章连接唯一合法形态）。
      // id 引用同样过此约束——AI 复制错位的有效 id 一样会把主干跳断。
      const inScope = (id: string) => {
        const ci = chapterOfNode.get(id)
        return ci === srcCh || (srcCh !== undefined && id === chapterFirstNode.get(srcCh + 1))
      }
      if (c.targetNodeId && nodeById.has(c.targetNodeId) && inScope(c.targetNodeId)) return c.targetNodeId
      const exact = nodeByTitle.get(c.targetNodeTitle)
      if (exact && inScope(exact)) return exact
      if (!c.targetNodeTitle || c.targetNodeTitle.length < 2) return ''
      const fuzzy = nodes.filter(n => inScope(n.id)).find(n =>
        n.title.includes(c.targetNodeTitle) || c.targetNodeTitle.includes(n.title)
      )
      // 无合法候选就留空——交给「继续」自动补连兜底，绝不跨章乱接
      return fuzzy?.id ?? ''
    }

    // 收集所有节点的 patch，key = nodeId
    const patchMap = new Map<string, Partial<StoryNode>>()

    // 按 nodeId 优先（AI 新 prompt 返回 nodeId），fallback 到 title
    draft.forEach(nc => {
      const nodeId = (nc.nodeId && nodeById.has(nc.nodeId)) ? nc.nodeId : nodeByTitle.get(nc.nodeTitle)
      if (!nodeId) return
      // explore节点：设置 exploreReturnNodeId，不设choices
      if (nc.exploreReturnNodeId && nodeById.has(nc.exploreReturnNodeId)) {
        patchMap.set(nodeId, { exploreReturnNodeId: nc.exploreReturnNodeId, choices: [] })
        return
      }
      const choices = (nc.choices ?? []).map((c, i) => ({
        id: nanoid(8), nodeId,
        text: c.text, order: i,
        targetNodeId: resolveTargetId(c, nodeId),
        // AI 在 branches:generate 提示词中被要求为门控节点（如"路线门控"）填写具体变量条件，
        // 后端 ChoiceDraftSchema 也支持该字段——此前这里硬编码空字符串，等于把 AI 返回的
        // conditions 值原样丢弃，导致门控条件在所有分支上都形同虚设。
        conditions: c.conditions ?? '',
        variableEffects: c.variableEffects ?? '',
        choiceWeight: c.choiceWeight,
        consequence: c.consequence,
      })).filter(ch => ch.targetNodeId)
      if (choices.length > 0) patchMap.set(nodeId, { choices })
    })

    return patchMap
  }

  // 为所有无出口的非结局/非探索节点补顺序连接（跨幕跨章），返回补连边列表 + 合并后的 patchMap
  function computeAutoConnectEdges(patchMap: Map<string, Partial<StoryNode>>): {
    edges: { fromId: string; fromTitle: string; toId: string; toTitle: string }[]
    patchMap: Map<string, Partial<StoryNode>>
  } {
    const nodes = project!.nodes
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const mergedPatchMap = new Map(patchMap)

    const orderedNodes: StoryNode[] = []
    // 必须先复制再排序：直接 .sort() 会原地改写 store 拥有的数组，污染撤销快照里的同一引用
    ;[...project!.chapters].sort((a, b) => a.order - b.order).forEach(ch => {
      [...project!.acts].filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).forEach(act => {
        act.nodeIds.forEach(nid => { const n = nodeById.get(nid); if (n) orderedNodes.push(n) })
      })
    })

    const edges: { fromId: string; fromTitle: string; toId: string; toTitle: string }[] = []
    nodes.forEach(node => {
      const pending = mergedPatchMap.get(node.id)
      const pendingChoices = pending?.choices
      const alreadyHasChoices = pendingChoices ? pendingChoices.length > 0 : node.choices.length > 0
      if (node.type === 'ending' || node.type === 'explore' || alreadyHasChoices) return
      const idx = orderedNodes.findIndex(n => n.id === node.id)
      const nextNode = orderedNodes[idx + 1]
      if (nextNode) {
        edges.push({ fromId: node.id, fromTitle: node.title, toId: nextNode.id, toTitle: nextNode.title })
        mergedPatchMap.set(node.id, {
          ...pending,
          choices: [{ id: nanoid(8), nodeId: node.id, text: '继续', order: 0, targetNodeId: nextNode.id, conditions: '', variableEffects: '' }]
        })
      }
    })

    return { edges, patchMap: mergedPatchMap }
  }

  function commitBranches(draft: AiNodeChoices[]) {
    const fresh = useProjectStore.getState().project!
    const nodes = fresh.nodes
    const choicePatchMap = resolveChoicePatches(draft)
    const { patchMap } = computeAutoConnectEdges(choicePatchMap)

    const updatedNodes = nodes.map(n => {
      const patch = patchMap.get(n.id)
      return patch ? { ...n, ...patch } : n
    })

    // 跨章缝合：分块生成的每章块看不见下一章，AI 永远不产跨章边；而 v2 之后
    // 每个节点都有 AI 选项，「继续」自动补连（只服务零选项节点）也不再触发——
    // 跨章连接成了无人负责的真空（曾两次造成整个后续章不可达）。
    // 规则：下一章首节点入度为 0 时，从本章顺序末位的非 ending 节点补一条无条件「继续」。
    const byId = new Map(updatedNodes.map(n => [n.id, n]))
    const indegree = new Map<string, number>()
    for (const n of updatedNodes) for (const c of n.choices) {
      if (c.targetNodeId) indegree.set(c.targetNodeId, (indegree.get(c.targetNodeId) ?? 0) + 1)
    }
    const chSeq = [...fresh.chapters].sort((a, b) => a.order - b.order).map(ch =>
      fresh.acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order).flatMap(a => a.nodeIds),
    )
    const sutures = new Map<string, string>() // 章尾节点 id → 下一章首节点 id
    for (let ci = 0; ci < chSeq.length - 1; ci++) {
      const nextFirst = chSeq[ci + 1][0]
      if (!nextFirst || (indegree.get(nextFirst) ?? 0) > 0) continue
      const tailId = [...chSeq[ci]].reverse().find(id => byId.get(id)?.type !== 'ending')
      if (tailId) sutures.set(tailId, nextFirst)
    }
    const suturedNodes = sutures.size === 0 ? updatedNodes : updatedNodes.map(n => {
      const nextFirst = sutures.get(n.id)
      if (!nextFirst) return n
      return {
        ...n,
        choices: [...n.choices, {
          id: nanoid(8), nodeId: n.id, text: '继续', order: n.choices.length,
          targetNodeId: nextFirst, conditions: '', variableEffects: '',
        }],
      }
    })

    // 一次性批量写入
    const store = useProjectStore.getState()
    store.bulkSetStructure(fresh.chapters, fresh.acts, suturedNodes)
  }

  return {
    branchAi, branchDraft, setBranchDraft, branchProgress,
    generateBranches, resolveChoicePatches, computeAutoConnectEdges, commitBranches,
  }
}
