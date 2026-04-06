import type { Project, ValidationIssue, ValidationReport } from '@/lib/types/project'
import { nanoid } from 'nanoid'

export function runValidation(project: Project): ValidationReport {
  const issues: ValidationIssue[] = []

  // 防御性处理：外部导入的项目可能缺少字段
  const safeNodes = (project.nodes ?? []).map(n => ({
    ...n,
    choices: n.choices ?? [],
    emotionFunction: n.emotionFunction ?? { emotionIn: '', emotionOut: '', playerEmotion: '', tension: 0 },
  }))

  // 死路检测（explore节点免检：有exploreReturnNodeId则自动返回）
  for (const node of safeNodes) {
    const isAutoReturn = node.type === 'explore' && !!node.exploreReturnNodeId
    if (node.type === 'ending' || isAutoReturn) continue
    const hasNoChoices = node.choices.length === 0
    const allChoicesEmpty = node.choices.length > 0 && node.choices.every(c => !c.targetNodeId)
    if (hasNoChoices || allChoicesEmpty) {
      issues.push({
        id: nanoid(4),
        level: 'error',
        code: 'DEAD_END',
        message: `节点「${node.title}」是死路：没有任何有效出口`,
        relatedIds: [node.id],
      })
    }
  }

  // 断链检测
  const nodeIds = new Set(safeNodes.map(n => n.id))
  for (const node of safeNodes) {
    for (const choice of node.choices) {
      if (choice.targetNodeId && !nodeIds.has(choice.targetNodeId)) {
        issues.push({
          id: nanoid(4),
          level: 'error',
          code: 'BROKEN_LINK',
          message: `节点「${node.title}」的选项「${choice.text}」指向不存在的节点`,
          relatedIds: [node.id],
        })
      }
    }
  }

  // 可达性检测（BFS 从 start 节点出发，真正遍历可达节点）
  const bfsNodeMap = new Map(safeNodes.map(n => [n.id, n]))
  const startNodeId = safeNodes.find(n => n.type === 'start')?.id ?? (safeNodes[0]?.id)
  const reachable = new Set<string>()
  if (startNodeId) {
    const queue = [startNodeId]
    while (queue.length > 0) {
      const curr = queue.shift()!
      if (reachable.has(curr)) continue
      reachable.add(curr)
      const node = bfsNodeMap.get(curr)
      if (!node) continue
      for (const choice of (node.choices ?? [])) {
        if (choice.targetNodeId && !reachable.has(choice.targetNodeId)) {
          queue.push(choice.targetNodeId)
        }
      }
    }
  }

  for (const node of safeNodes) {
    if (!reachable.has(node.id) && safeNodes.length > 1) {
      issues.push({
        id: nanoid(4),
        level: 'warning',
        code: 'UNREACHABLE',
        message: `节点「${node.title}」无法到达（从开场节点出发没有任何路径到达它）`,
        relatedIds: [node.id],
      })
    }
  }

  // 结局节点检测
  const endingNodes = safeNodes.filter(n => n.type === 'ending')
  if (endingNodes.length === 0 && safeNodes.length > 0) {
    issues.push({
      id: nanoid(4),
      level: 'warning',
      code: 'NO_ENDING',
      message: '项目中没有设置任何结局节点',
      relatedIds: [],
    })
  }

  // 叙事维度：情感节奏单调
  const filledNodes = safeNodes.filter(n => n.emotionFunction.tension > 0)
  if (filledNodes.length >= 5) {
    const highTension = filledNodes.filter(n => n.emotionFunction.tension >= 7).length
    if (highTension / filledNodes.length > 0.7) {
      issues.push({
        id: nanoid(4),
        level: 'info',
        code: 'EMOTION_MONOTONE',
        message: `${highTension}/${filledNodes.length} 个节点紧张度≥7，情感节奏缺少低谷。建议加入1-2个"呼吸节点"（tension≤3）以形成对比`,
        relatedIds: [],
      })
    }
  }

  // 叙事维度：选项文本重复
  const allChoiceTexts = safeNodes.flatMap(n => n.choices.map(c => c.text.trim())).filter(Boolean)
  const textCount = new Map<string, number>()
  for (const t of allChoiceTexts) textCount.set(t, (textCount.get(t) ?? 0) + 1)
  const dupes = [...textCount.entries()].filter(([, c]) => c > 1)
  if (dupes.length > 0) {
    issues.push({
      id: nanoid(4),
      level: 'warning',
      code: 'DUPLICATE_CHOICE',
      message: `发现 ${dupes.length} 个重复选项文本：${dupes.map(([t]) => `「${t}」`).join('、')}，玩家将无法区分`,
      relatedIds: [],
    })
  }

  // 叙事维度：结局数量不足
  if (endingNodes.length === 1 && safeNodes.length >= 10) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'SINGLE_ENDING',
      message: '只有1个结局节点，互动叙事建议至少2个差异化结局以体现玩家选择的意义',
      relatedIds: endingNodes.map(n => n.id),
    })
  }

  // 路径完整性检测：从 start 出发，是否所有路径都能到达 ending
  function canReachEnding(startId: string, nodeMap: Map<string, typeof safeNodes[0]>): boolean {
    const queue = [startId]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      const node = nodeMap.get(nodeId)
      if (!node) continue
      if (node.type === 'ending') return true
      for (const choice of (node.choices ?? [])) {
        if (choice.targetNodeId && !visited.has(choice.targetNodeId)) {
          queue.push(choice.targetNodeId)
        }
      }
    }
    return false
  }

  const nodeMap = new Map(safeNodes.map(n => [n.id, n]))
  const startNodes = safeNodes.filter(n => n.type === 'start')
  for (const start of startNodes) {
    if (!canReachEnding(start.id, nodeMap)) {
      issues.push({
        id: nanoid(4),
        level: 'error',
        code: 'NO_PATH_TO_ENDING',
        message: `从开场节点「${start.title}」出发，存在无法到达任何结局的路径`,
        relatedIds: [start.id],
      })
    }
  }

  // 结局节点↔endings 记录双向验证
  const endingDefs = project.endings ?? []
  const endingNodeIds = new Set(endingNodes.map(n => n.id))
  const endingDefNodeIds = new Set(endingDefs.map(e => e.nodeId))

  // 结局节点没有对应 endings 记录
  for (const node of endingNodes) {
    if (!endingDefNodeIds.has(node.id)) {
      issues.push({
        id: nanoid(4),
        level: 'warning',
        code: 'ENDING_NO_DEF',
        message: `结局节点「${node.title}」没有对应的结局定义（缺少标题/类型/描述），玩家看到的结局画面将不完整`,
        relatedIds: [node.id],
      })
    }
  }

  // endings 记录指向不存在或非结局节点
  for (const e of endingDefs) {
    if (!endingNodeIds.has(e.nodeId)) {
      issues.push({
        id: nanoid(4),
        level: 'error',
        code: 'ENDING_ORPHAN',
        message: `结局定义「${e.title}」指向的节点不存在或不是结局节点，结局将无法触发`,
        relatedIds: [],
      })
    }
  }

  // 结局差异度检测
  if (endingDefs.length >= 2) {
    const types = new Set(endingDefs.map(e => e.type))
    if (types.size === 1) {
      issues.push({
        id: nanoid(4),
        level: 'info',
        code: 'ENDING_VARIETY',
        message: `所有结局类型相同（${[...types][0]}），建议设计情感基调不同的结局以增加可重玩价值`,
        relatedIds: endingDefs.map(e => e.id),
      })
    }
  }

  // 分支密度检测（阈值提升至25%）
  const branchNodes = safeNodes.filter(n => n.type === 'branch')
  const branchRatio = safeNodes.length > 0 ? branchNodes.length / safeNodes.length : 0
  if (safeNodes.length >= 10 && branchRatio < 0.25) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'LOW_BRANCH_DENSITY',
      message: `分支密度偏低（${branchNodes.length}/${safeNodes.length} = ${Math.round(branchRatio * 100)}%），互动影游建议分支节点占比≥25%，否则玩家会感到缺乏选择感`,
      relatedIds: [],
    })
  }

  // 选择力度检测：branch节点若只有2个选项则标记
  const weakBranchNodes = branchNodes.filter(n => n.choices.length <= 2)
  if (branchNodes.length >= 3 && weakBranchNodes.length / branchNodes.length > 0.6) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'WEAK_CHOICES',
      message: `${weakBranchNodes.length}/${branchNodes.length} 个分支节点只有1-2个选项，建议关键分支节点提供3-4个有道德重量的选择，增加难以抉择感`,
      relatedIds: weakBranchNodes.map(n => n.id),
    })
  }

  // 探索内容检测：鼓励加入可选内容
  const exploreNodes = safeNodes.filter(n => n.type === 'explore')
  if (safeNodes.length >= 15 && exploreNodes.length === 0) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'NO_EXPLORE_CONTENT',
      message: '项目中没有探索节点（可选支线内容）。探索节点让好奇的玩家发现隐藏信息，不影响主线但大幅提升沉浸感',
      relatedIds: [],
    })
  }

  // 对白深度检测（McKee标准：每节点至少6行对白）
  const contentNodes = safeNodes.filter(n => n.type !== 'ending')
  const thinNodes = contentNodes.filter(n => !n.dialogue || n.dialogue.length < 6)
  if (contentNodes.length >= 5 && thinNodes.length / contentNodes.length > 0.5) {
    issues.push({
      id: nanoid(4),
      level: 'warning',
      code: 'THIN_DIALOGUE',
      message: `${thinNodes.length}/${contentNodes.length} 个节点对白少于6行（McKee最低标准），内容深度严重不足。建议在Workshop运行批量精修`,
      relatedIds: thinNodes.slice(0, 5).map(n => n.id),
    })
  }

  // 情感深度检测：缺失内心谎言
  const shallowNodes = safeNodes.filter(n => n.type !== 'ending' && !n.emotionFunction?.internal_lie)
  if (safeNodes.length >= 5 && shallowNodes.length / safeNodes.length > 0.4) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'SHALLOW_EMOTION',
      message: `${shallowNodes.length} 个节点缺少角色内心谎言（internal_lie），McKee四维心理模型不完整，角色行为缺乏深层动机驱动`,
      relatedIds: [],
    })
  }

  // 场景描述深度检测
  const bareSceneNodes = safeNodes.filter(n => !n.sceneDesc || n.sceneDesc.length < 60)
  if (contentNodes.length >= 5 && bareSceneNodes.length / contentNodes.length > 0.5) {
    issues.push({
      id: nanoid(4),
      level: 'info',
      code: 'THIN_SCENE_DESC',
      message: `${bareSceneNodes.length} 个节点场景描述过短（<60字符），缺乏镜头语言和空间细节，玩家无法形成视觉画面`,
      relatedIds: [],
    })
  }

  // 时长不足检测
  const estimatedMinutes = Math.round(
    safeNodes.reduce((s, n) => s + (n.dialogue?.length ?? 0) * 18, 0) / 60
  )
  const targetMinutes = (project.worldAnchor?.durationMinutes ?? 0)
  if (targetMinutes > 0 && estimatedMinutes < targetMinutes * 0.5 && safeNodes.filter(n => n.dialogue?.length > 0).length >= 5) {
    issues.push({
      id: nanoid(4),
      level: 'warning',
      code: 'SHORT_DURATION',
      message: `预计时长约 ${estimatedMinutes} 分钟，目标时长 ${targetMinutes} 分钟，内容量不足50%。建议扩写对白，或增加探索节点补充内容量`,
      relatedIds: [],
    })
  }

  const errorPenalty = issues.filter(i => i.level === 'error').length * 20
  const warningPenalty = issues.filter(i => i.level === 'warning').length * 8
  const infoPenalty = issues.filter(i => i.level === 'info').length * 2
  const passRate = Math.max(0, 100 - errorPenalty - warningPenalty - infoPenalty)

  return {
    generatedAt: new Date().toISOString(),
    totalNodes: safeNodes.length,
    totalBranches: safeNodes.reduce((acc, n) => acc + n.choices.length, 0),
    issues,
    passRate,
  }
}
