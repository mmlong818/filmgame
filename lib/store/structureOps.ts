// 结构树（章 / 幕 / 节点）增删排序的纯函数，供 projectStore 的 action 调用。
import type { Project } from '@/lib/types/project'

/** 删除一批节点并清理牵连：其他节点指向它们的 choices、acts.nodeIds、绑定在其上的 endings */
export function removeNodes(p: Project, ids: Set<string>): Pick<Project, 'nodes' | 'acts' | 'endings'> {
  return {
    nodes: p.nodes.filter(n => !ids.has(n.id)).map(n => ({ ...n, choices: n.choices.filter(c => !ids.has(c.targetNodeId)) })),
    acts: p.acts.map(a => ({ ...a, nodeIds: a.nodeIds.filter(id => !ids.has(id)) })),
    endings: p.endings.filter(e => !ids.has(e.nodeId)),
  }
}

/** 同级列表按 order 排好后把 id 与相邻项换位，返回全体新 order（按下标重编，顺带修掉重复 order）；越界返回 null */
export function swapOrder(siblings: { id: string; order: number }[], id: string, dir: -1 | 1): Map<string, number> | null {
  const sorted = [...siblings].sort((a, b) => a.order - b.order)
  const i = sorted.findIndex(x => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return null
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  return new Map(sorted.map((x, idx) => [x.id, idx]))
}
