import type { Project, ValidationIssue, ValidationReport } from '@/lib/types/project'
import { nanoid } from 'nanoid'
import { parseEffectPart } from '@/lib/conditions'

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
      // explore 节点 choices 恒为空，靠 exploreReturnNodeId 自动返回主线，这条边也要算作出边
      if (node.type === 'explore' && node.exploreReturnNodeId && !reachable.has(node.exploreReturnNodeId)) {
        queue.push(node.exploreReturnNodeId)
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
      // explore 节点 choices 恒为空，靠 exploreReturnNodeId 自动返回主线，这条边也要算作出边
      if (node.type === 'explore' && node.exploreReturnNodeId && !visited.has(node.exploreReturnNodeId)) {
        queue.push(node.exploreReturnNodeId)
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

  // 陷阱分支检测：NO_PATH_TO_ENDING 只验证「从开场出发是否存在至少一条路径到达结局」，
  // 只要玩家有别的选择能到结局，该检测就会通过——但某个具体分支选项一旦被选中，
  // 可能把玩家带入一个再也无法到达任何结局的子图（例如某条门控路线走到底却没接上任何结局），
  // 玩家会在里面无限打转直到重置。这类"陷阱分支"必须从每个分支节点的每个选项单独验证可达性，
  // 而不能只看整体图是否连通。canReachEnding 结果只取决于目标节点本身，与 startId 无关，
  // 用 memo 缓存跨节点复用，避免 O(节点数²) 的重复 BFS。
  const reachMemo = new Map<string, boolean>()
  function canReachEndingMemo(id: string): boolean {
    const cached = reachMemo.get(id)
    if (cached !== undefined) return cached
    const result = canReachEnding(id, nodeMap)
    reachMemo.set(id, result)
    return result
  }
  const decisionNodes = safeNodes.filter(n => {
    const distinctTargets = new Set(n.choices.map(c => c.targetNodeId).filter(Boolean))
    return n.type !== 'ending' && distinctTargets.size >= 2
  })
  for (const node of decisionNodes) {
    for (const choice of node.choices) {
      if (!choice.targetNodeId) continue
      if (!canReachEndingMemo(choice.targetNodeId)) {
        issues.push({
          id: nanoid(4),
          level: 'error',
          code: 'TRAP_BRANCH',
          message: `节点「${node.title}」的选项「${choice.text}」通向的分支是一条死路：走下去之后，再也无法到达任何结局`,
          relatedIds: [node.id],
        })
      }
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

  // 变量断链检测：条件/效果引用了不存在的变量（改名或删除变量后静默失效，视为0）
  const knownVarNames = new Set((project.variables ?? []).map(v => v.name))

  function extractConditionVars(expr: string | undefined): string[] {
    if (!expr || !expr.trim()) return []
    const parts = expr.includes('&&') ? expr.split('&&') : expr.includes('||') ? expr.split('||') : [expr]
    const names: string[] = []
    for (const part of parts) {
      const m = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/)
      if (m) names.push(m[1])
    }
    return names
  }

  // 曾经只会剥离前缀 "+name"/"-name" 或按 "=" 切分，对 AI 生成的绝大多数选项使用的
  // 后缀写法 "name+1"（见 lib/ai/prompts.ts 'branches:generate'）完全不识别——会把整个
  // "name+1" 当成变量名去查未知变量表，导致几乎每个 AI 生成的选项都被误报"引用了不存在的变量"。
  // 复用 lib/conditions.ts 的 parseEffectPart（与 preview/ink 导出共用同一套解析规则）。
  function extractEffectVars(expr: string | undefined): string[] {
    if (!expr || !expr.trim()) return []
    return expr.split(',').map(p => parseEffectPart(p)?.name).filter((n): n is string => !!n)
  }

  for (const node of safeNodes) {
    for (const choice of node.choices) {
      const refs = [...extractConditionVars(choice.conditions), ...extractEffectVars(choice.variableEffects)]
      const unknown = [...new Set(refs.filter(name => !knownVarNames.has(name)))]
      if (unknown.length > 0) {
        issues.push({
          id: nanoid(4),
          level: 'warning',
          code: 'UNKNOWN_VARIABLE_REF',
          message: `节点「${node.title}」的选项「${choice.text}」引用了不存在的变量：${unknown.join('、')}，变量若已改名或删除，此处会静默失效（视为0）`,
          relatedIds: [node.id],
        })
      }

      // parseEffectPart 解析失败时 extractEffectVars 直接 filter 掉，等同于"没有这个效果"，
      // 不会落进上面的 unknown 变量检查——但预览（applyVariableEffect）和 ink 导出（applyInkEffects）
      // 同样解析失败会跳过该片段，于是作者拿到绿色报告，效果却在运行时静默不执行。这里单独收集
      // 非空但解析失败的片段并报 warning（与 unknown 变量检查互斥，一个片段只会落进其中一个）。
      const unparseable = (choice.variableEffects ?? '')
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
        .filter(p => parseEffectPart(p) === null)
      if (unparseable.length > 0) {
        issues.push({
          id: nanoid(4),
          level: 'warning',
          code: 'UNPARSEABLE_EFFECT',
          message: `节点「${node.title}」的选项「${choice.text}」含无法解析的变量效果：${unparseable.join('、')}，该效果在预览和导出中不会执行。支持的写法：+名称 / -名称 / 名称+1 / 名称=值（变量名仅限英文字母、数字、下划线）`,
          relatedIds: [node.id],
        })
      }
    }
  }

  for (const e of endingDefs) {
    const unknown = [...new Set(extractConditionVars(e.conditions).filter(name => !knownVarNames.has(name)))]
    if (unknown.length > 0) {
      issues.push({
        id: nanoid(4),
        level: 'warning',
        code: 'UNKNOWN_VARIABLE_REF',
        message: `结局「${e.title}」的触发条件引用了不存在的变量：${unknown.join('、')}，该结局可能无法按预期触发`,
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
