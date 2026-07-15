import type { StoryNode } from '@/lib/types/project'

/**
 * 从 startId 出发，沿节点的 choices 做 DFS，枚举所有能到达 `ending` 类型节点的路径。
 *
 * - 环防护：per-path 用 Set 记录已访问节点；每次下探前 `new Set(visited)` 拷贝后再传递，
 *   保证同一节点的不同分支互不污染彼此的 visited 集合（与原两处实现一致）。
 * - `maxPaths` 是防止路径组合爆炸的启发式早停阈值：一旦已收集的路径数达到 maxPaths，
 *   立即停止继续枚举——超出的部分不代表故事没有更多路径，只是不再穷举。
 *   调用方按各自场景传入不同的值（如 branches 页 50、validate 页 30）。
 */
export function enumeratePaths(
  startId: string,
  nodeMap: Map<string, StoryNode>,
  maxPaths = 50,
): string[][] {
  const paths: string[][] = []

  function dfs(nodeId: string, path: string[], visited: Set<string>) {
    if (visited.has(nodeId) || paths.length >= maxPaths) return
    const node = nodeMap.get(nodeId)
    if (!node) return
    const newPath = [...path, nodeId]
    if (node.type === 'ending') { paths.push(newPath); return }
    const newVisited = new Set(visited)
    newVisited.add(nodeId)
    for (const choice of (node.choices ?? [])) {
      if (choice.targetNodeId) dfs(choice.targetNodeId, newPath, newVisited)
    }
  }

  dfs(startId, [], new Set())
  return paths
}
