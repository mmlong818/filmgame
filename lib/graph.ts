import type { StoryNode } from '@/lib/types/project'

/**
 * 从 startId 出发，沿节点的 choices 枚举最多 maxPaths 条能到达 `ending` 类型节点的路径。
 *
 * 实现要点（此前是递归 DFS + 每分支 `new Set(visited)` 拷贝，与 FlowView 那次线上卡死
 * 同一形状：maxPaths 早停只在「已收集到完整路径」后才生效，图中若存在到不了结局的
 * 菱形汇合区（生成中间态很常见），会在拿到第一条路径前就指数级展开并冻死主线程）：
 *
 * 1. 先反向 BFS 求出「能到达结局」的节点集，把到不了结局的枝杈整片剪掉——早停失效的
 *    前提随之消失；
 * 2. 再用显式队列做逐条路径的广度扩展，队列长度和产出路径数都受 maxPaths 约束，
 *    任何输入下都是有界工作量，且无递归爆栈风险。
 *
 * 环防护：per-path 的 visited 仍随路径携带（同一节点在不同路径上互不影响）。
 * 广度优先意味着返回的是较短的若干条路径，对两个调用方（分支概览、时长估算）语义等价。
 */
export function enumeratePaths(
  startId: string,
  nodeMap: Map<string, StoryNode>,
  maxPaths = 50,
): string[][] {
  if (!nodeMap.has(startId) || maxPaths <= 0) return []

  // ① 反向可达：能走到 ending 的节点
  const parents = new Map<string, string[]>()
  const endings: string[] = []
  for (const node of nodeMap.values()) {
    if (node.type === 'ending') { endings.push(node.id); continue }
    for (const choice of (node.choices ?? [])) {
      const t = choice.targetNodeId
      if (!t || !nodeMap.has(t)) continue
      const list = parents.get(t)
      if (list) list.push(node.id)
      else parents.set(t, [node.id])
    }
  }
  const canReachEnding = new Set<string>()
  const back = [...endings]
  while (back.length > 0) {
    const id = back.pop()!
    if (canReachEnding.has(id)) continue
    canReachEnding.add(id)
    for (const p of parents.get(id) ?? []) back.push(p)
  }
  if (!canReachEnding.has(startId)) return []

  // ② 有界广度扩展，但按结局分配配额。
  // 广度优先天然按路径长度出结果，若不限配额，前 maxPaths 条会全是最短路径、
  // 且大多汇向同一个最近的结局——校验页「路径时长分布」曾因此显示 30 行一模一样的
  // 「路径C·即死结局 14分·7节点」，等于没有信息。每个结局最多取 perEnding 条，
  // 保证结果覆盖到不同终局（这也是调用方真正想看的：各结局分别多长）。
  const reachableEndings = endings.filter(id => canReachEnding.has(id))
  const perEnding = Math.max(1, Math.ceil(maxPaths / Math.max(1, reachableEndings.length)))
  const countByEnding = new Map<string, number>()

  const paths: string[][] = []
  let frontier: { path: string[]; visited: Set<string> }[] = [{ path: [startId], visited: new Set([startId]) }]
  while (frontier.length > 0 && paths.length < maxPaths) {
    const next: typeof frontier = []
    for (const item of frontier) {
      if (paths.length >= maxPaths) break
      const lastId = item.path[item.path.length - 1]
      const node = nodeMap.get(lastId)!
      if (node.type === 'ending') {
        const used = countByEnding.get(lastId) ?? 0
        if (used < perEnding) {
          countByEnding.set(lastId, used + 1)
          paths.push(item.path)
        }
        continue
      }
      // 同一节点的多个选项常指向同一后继（v2 起「2-3 个选项对应同一推进」是刻意设计，
      // 让对话有真选择而结构不炸）。路径只记节点序列，若逐 choice 扩展，同一条节点序列
      // 会被复制 2-3 份——分支分析页因此出现「1~5 条路径完全相同」，路径总数虚高。
      // 按目标节点去重后，每条路径在结果里只出现一次。
      const seenTargets = new Set<string>()
      for (const choice of (node.choices ?? [])) {
        const t = choice.targetNodeId
        if (!t || seenTargets.has(t) || item.visited.has(t) || !canReachEnding.has(t)) continue
        seenTargets.add(t)
        if (next.length >= maxPaths * 4) break // 前沿宽度设界，避免宽图撑爆内存
        next.push({ path: [...item.path, t], visited: new Set(item.visited).add(t) })
      }
    }
    frontier = next
  }
  return paths
}
