import type { PromptContext } from './shared'

export const branchesPrompts: Record<string, (c: PromptContext) => string> = {

    'branches:generate': (c) => {
      type N = { id: string; title: string; type: string; notes?: string }
      const nodes = (c.nodes ?? []) as N[]
      const variables = (c.variables as Array<{name:string,label?:string}> | undefined) ?? []
      const varNames = variables.map(v => v.name).join('、')

      // ── 第一步：预计算每个 branch 的类型和路线块 ────────────────────────
      // C2-3（FR-18 v2）兼容性修复：旧算法纯按type序列切块（遇ending就切一刀），有两个问题——
      // ①C1新规则要求菱形非BE路径拉长到≥2节点后，多条路径的normal会被连续排列、中间没有ending
      //   分隔，旧算法会把它们误判成同一个块里的"一串路径"，逐节点拆成路径而不是按路径分组；
      // ②章中即死BE（单节点ending）夹在其他路径中间时，旧算法会把BE前面的路径normal和BE的ending
      //   强行拼成"一个块"，导致blocks.length算错，菱形分支被误判为终章路线门控（route/terminal）。
      // 修复：buildActNodes产出的菱形/平行路线节点，notes统一带[路径X]标签（含BE节点）——
      // 优先按标签分组还原真实路径归属，标签缺失时（终章路线门控等旧结构）才退回旧的按ending切块。
      // 另外用"扫描到的下一个merge节点"区分"汇回主线"（菱形/平行路线）与"永不汇合"（终章路线门控）。
      type RouteBlock = { normals: N[]; ending: N | null }
      type BranchScan = { blocks: RouteBlock[]; mergeNode: N | null; tagged: boolean }
      const PATH_TAG_RE = /^\[路径([A-Za-z0-9]+)\]/
      const pathTagOf = (node: N): string | null => PATH_TAG_RE.exec(node.notes ?? '')?.[1] ?? null

      const branchScans = new Map<string, BranchScan>()
      const routeNodeNext = new Map<string, N>()   // 路线内节点→其在路线内的下一节点（含结局/merge）

      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type !== 'branch') continue

        // 扫描branch之后的连续区段，直到遇到merge（路径收束，记下来）或下一个branch/start（区段
        // 到此为止，说明各路径各自不汇合——典型如终章路线门控）
        const region: N[] = []
        let mergeNode: N | null = null
        for (let j = i + 1; j < nodes.length; j++) {
          const x = nodes[j]
          if (x.type === 'explore') continue
          if (x.type === 'merge') { mergeNode = x; break }
          if (x.type === 'branch' || x.type === 'start') break
          if (x.type === 'normal' || x.type === 'ending') { region.push(x); continue }
          break
        }
        if (region.length === 0 && !mergeNode) continue

        const tags = region.map(pathTagOf)
        const tagged = region.length > 0 && tags.every(t => t !== null)

        let blocks: RouteBlock[]
        if (tagged) {
          // 按[路径X]标签分组还原路径，保持首次出现顺序；组内唯一节点若是ending即为BE路径
          const order: string[] = []
          const groups = new Map<string, N[]>()
          region.forEach((x, idx) => {
            const t = tags[idx] as string
            if (!groups.has(t)) { groups.set(t, []); order.push(t) }
            groups.get(t)!.push(x)
          })
          blocks = order.map(t => {
            const groupNodes = groups.get(t)!
            if (groupNodes.length === 1 && groupNodes[0].type === 'ending') {
              return { normals: [], ending: groupNodes[0] }
            }
            return { normals: groupNodes.filter(x => x.type === 'normal'), ending: null }
          })
        } else {
          // 无标签：沿用旧版按ending切块（终章路线门控等旧结构），仅在region范围内扫描
          blocks = []
          let curNormals: N[] = []
          for (const x of region) {
            if (x.type === 'ending') {
              blocks.push({ normals: curNormals, ending: x })
              curNormals = []
            } else {
              curNormals.push(x)
            }
          }
          if (curNormals.length > 0) blocks.push({ normals: curNormals, ending: null })
        }

        if (blocks.length === 0) continue
        branchScans.set(nodes[i].id, { blocks, mergeNode, tagged })

        // 路径内部连接：每条路径的节点按序连接；路径末尾——有ending则连到ending（死路/结局路径），
        // 否则若本branch有mergeNode则汇回merge，都没有则不设下一跳（交由下方通用fallback兜底）
        for (const block of blocks) {
          for (let k = 0; k < block.normals.length; k++) {
            const isLastInBlock = k === block.normals.length - 1
            const target = !isLastInBlock ? block.normals[k + 1] : (block.ending ?? mergeNode ?? null)
            if (target) routeNodeNext.set(block.normals[k].id, target)
          }
        }
      }

      // ── 结局设计中的关键变量（用于路线门控/终章直通的conditions对齐）────────
      type EndingDesignLite = { title: string; type?: string; keyVariable?: string; triggerCondition?: string }
      const world0 = (c.worldAnchor as Record<string, unknown>) ?? {}
      const endingsDesign = ((world0.endingsDesign ?? []) as EndingDesignLite[])
      const endingInfoByTitle = new Map(endingsDesign.map(e => [e.title, e]))
      const endingHint = (endingTitle: string): string => {
        const info = endingInfoByTitle.get(endingTitle)
        if (!info) return ' （需在conditions写对应变量条件，0-10整数量表，阈值3-6）'
        return info.keyVariable
          ? ` （对应结局「${info.title}」，conditions必须使用其关键变量：${info.keyVariable}，禁止另选变量或改用百分比）`
          : ` （对应结局「${info.title}」，triggerCondition=${info.triggerCondition ?? ''}；conditions填0-10整数量表下的变量阈值，阈值3-6）`
      }

      // ── 第二步：构建连接拓扑 ─────────────────────────────────────────────
      type Conn = { from: N; targets: N[]; role: 'advance' | 'branch'; branchKind?: 'route' | 'variable' | 'terminal' | 'diamond'; endings?: (N | null)[] }
      const conns: Conn[] = []

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        if (n.type === 'ending') continue

        if (n.type === 'explore') {
          const ret = nodes.slice(i + 1).find(x => x.type !== 'explore' && x.type !== 'ending')
          if (ret) conns.push({ from: n, targets: [ret], role: 'advance' })
          continue
        }

        if (n.type === 'branch') {
          const scan = branchScans.get(n.id)
          if (!scan || scan.blocks.length === 0) {
            // 无路线块也无紧跟 normal：variable 型，所有选项→下一节点
            const next = nodes.slice(i + 1).find(x => x.type !== 'explore' && x.type !== 'ending')
            if (next) conns.push({ from: n, targets: [next], role: 'branch', branchKind: 'variable' })
          } else if (scan.mergeNode) {
            // 有merge收束 → 菱形分支/章内平行路线（可能含1条即死BE路径）。标签分组时blocks数量
            // 就是真实路径数；未打标签的兜底扫描退回旧逻辑（1个块内多个normal=多条单节点路径）。
            const targets = (scan.tagged
              ? scan.blocks.map(b => b.normals[0] ?? b.ending)
              : (scan.blocks.length === 1 ? scan.blocks[0].normals : scan.blocks.map(b => b.normals[0] ?? b.ending))
            ).filter(Boolean) as N[]
            if (targets.length > 0) conns.push({ from: n, targets, role: 'branch', branchKind: 'diamond' })
          } else if (scan.blocks.length >= 2) {
            // 无merge + 多路线块：终章路线门控（各选项进入不同路线，永不汇合）
            const routeEntries = scan.blocks.map(b => b.normals[0] ?? b.ending).filter(Boolean) as N[]
            const routeEndings = scan.blocks.map(b => b.ending)
            conns.push({ from: n, targets: routeEntries, role: 'branch', branchKind: 'route', endings: routeEndings })
          } else if (scan.blocks.length === 1 && scan.blocks[0].ending && scan.blocks[0].normals.length === 0) {
            // 无merge + 单个无内容块：终章直通结局（不常见）
            const endings = scan.blocks.map(b => b.ending).filter(Boolean) as N[]
            conns.push({ from: n, targets: endings, role: 'branch', branchKind: 'terminal', endings })
          } else {
            // 无merge、单条normal：变量积累型
            const next = scan.blocks[0].normals[0] ?? scan.blocks[0].ending
            if (next) conns.push({ from: n, targets: [next], role: 'branch', branchKind: 'variable' })
          }
          continue
        }

        // 路线内节点：按预计算的路线内连接前进
        if (routeNodeNext.has(n.id)) {
          conns.push({ from: n, targets: [routeNodeNext.get(n.id)!], role: 'advance' })
          continue
        }

        // start / normal / merge（旧结构兼容）→ 下一个非 explore、非 ending 节点
        const next = nodes.slice(i + 1).find(x => x.type !== 'explore' && x.type !== 'ending')
        if (next) conns.push({ from: n, targets: [next], role: 'advance' })
        const nearExplore = nodes[i + 1]?.type === 'explore' ? nodes[i + 1] : null
        if (nearExplore) conns.push({ from: n, targets: [nearExplore], role: 'explore_trigger' as 'advance' })
      }

      const routeNodeIds = new Set(routeNodeNext.keys())
      const topoLines = conns.map(conn => {
        const fromStr = `"${conn.from.title}"[id:${conn.from.id}]`
        if (conn.role === 'branch') {
          const kind = conn.branchKind ?? 'variable'
          const kindLabel = kind === 'route' ? '路线门控（每个选项进入专属路线，永不汇合）'
            : kind === 'terminal' ? '终章直通结局（永久分叉）'
            : kind === 'diamond' ? '菱形分支（每个选项有独立专属场景，之后汇回续接节点；若某选项目标标了[结局/即死BE]，选中即立刻触发该BE）'
            : '变量积累（所有选项指向同一节点，仅variableEffects不同）'
          const targetsStr = conn.targets.map((t, idx) => {
            if (kind === 'diamond' && t.type === 'ending') {
              return `    选项${idx + 1}: "${t.title}"[id:${t.id}] [结局/即死BE]（文案必须有吸引力或危险诱惑、不能一眼看出是死路；选中后立刻触发该结局，不写variableEffects/conditions）`
            }
            const relatedEnding = kind === 'route' ? (conn.endings?.[idx] ?? null) : (kind === 'terminal' ? t : null)
            const hint = (kind === 'route' || kind === 'terminal') && relatedEnding ? endingHint(relatedEnding.title) : ''
            return `    选项${idx + 1}: "${t.title}"[id:${t.id}]${t.type === 'ending' ? ' [结局]' : ''}${hint}`
          }).join('\n')
          return `${fromStr}[branch/${kind}] → ${kindLabel}:\n${targetsStr}`
        }
        if (conn.from.type === 'explore') {
          return `${fromStr}[explore] → exploreReturnNodeId必须设为: "${conn.targets[0].title}"[id:${conn.targets[0].id}]，choices=[]`
        }
        if ((conn.role as string) === 'explore_trigger') {
          return `${fromStr} → 【可选】可加一个轻量选项指向explore: "${conn.targets[0].title}"[id:${conn.targets[0].id}]`
        }
        const tag = routeNodeIds.has(conn.from.id) ? '[路线节点]' : ''
        if (conn.from.type === 'normal') {
          // C2-1（FR-18 v2）：normal推进节点也要2-3个真选择——同一目标，不同variableEffects/语气
          return `${fromStr}${tag} → 【必须，2-3个选项】所有选项均指向同一节点: "${conn.targets[0].title}"[id:${conn.targets[0].id}]（选项间variableEffects/语气不同，至少一个选项带具体variableEffects）`
        }
        return `${fromStr}${tag} → 【必须】推进选项指向: "${conn.targets[0].title}"[id:${conn.targets[0].id}]`
      }).join('\n')

      const needChoices = nodes.filter(n => n.type !== 'ending')
      const world = world0

      const endingsSummary = endingsDesign.length > 0
        ? `\n【结局关键变量对照表——路线门控/终章直通的conditions必须与此对齐】\n${endingsDesign.map((e, i) => `结局${i + 1}「${e.title}」(${e.type ?? ''})：${e.keyVariable ? `关键变量=${e.keyVariable}` : '无预设关键变量，可从叙事变量中选一个语义匹配的'}；触发条件=${e.triggerCondition ?? ''}`).join('\n')}`
        : ''

      return `你是互动影游编剧，为每个节点设计玩家选项并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核心】${world.storyCore ?? ''}
【主题】${world.theme ?? ''}
【角色】${((c.characters ?? []) as Array<{name:string,role:string}>).map(ch => `${ch.name}(${ch.role})`).join('、') || '见故事设定'}
${varNames ? `【叙事变量】${varNames}` : ''}
${endingsSummary}

【变量机制约定】所有变量为0-10的小整数量表，通过variableEffects以+1（少数+2）累积，禁止使用百分比。conditions中的阈值必须是3-6之间的小整数，且路线门控/终章直通的每个选项必须使用其对应结局的keyVariable（见上表），不得自行发明新变量名或改用其他变量。

【校验规则对齐——生成时必须遵守，否则本地校验会直接标红】
- 保底出口（对应校验 ALL_CHOICES_GATED）：任何节点如果有选项带conditions，该节点必须至少保留一个conditions为空的无条件选项，不能让所有选项都设条件——否则玩家到达时可能被卡死
- 阈值可达性（对应校验 UNSATISFIABLE_CONDITION）：某选项conditions里用到的变量阈值，不能超过"从开局到这个节点为止、该变量所有variableEffects理论最大累计值"；比如某变量此前最多只被+1过两次，后面节点就不能要求它>=5
- 结局的触发条件同样只能用玩家实际能积累到的变量区间，不能设一个全图任何路径都凑不出来的阈值

【菱形分支路径差异化】同一个branch/diamond节点下的各条路径，选项的variableEffects应各自使用不同的变量（如路径A用courage+1，路径B用trust+1），不要让多条路径都只改同一个变量——这样终章门控才能通过变量组合真正区分玩家走的是哪条路线

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【连接拓扑——targetNodeId必须完全按此填写，禁止更改】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${topoLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【你的任务：为以下节点设计选项文字（共${needChoices.length}个）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${needChoices.map((n, i) => `${i+1}. [${n.type}] id="${n.id}" "${n.title}"`).join('\n')}

【选项设计规则（严格按branch类型区分）】
- branch/diamond（菱形分支）：每个选项指向不同的专属路径节点（内容各不相同），variableEffects必须写出此选择对变量的影响（如"affection_A+1"），且不同路径尽量使用不同变量以便后续区分路线，choiceWeight="heavy"；若某个选项目标节点标了[结局/即死BE]，该选项文案必须有吸引力/危险诱惑、不能一眼看出是错误选项，且不写variableEffects（选中即死）
- branch/variable（变量积累型）：2-3个选项，所有选项targetNodeId相同，但variableEffects各不同，choiceWeight="heavy"
- branch/route（路线门控）：每个选项指向不同路线入口，conditions必须使用对应结局的keyVariable（见结局关键变量对照表），阈值为0-10量表下的3-6整数（如"courage>=4"），禁止百分比或自造变量，choiceWeight="critical"
- branch/terminal（终章直通）：每个选项指向结局节点，conditions同样必须使用该结局的keyVariable和3-6整数阈值，choiceWeight="critical"
- normal节点（含菱形/平行路径内的[路线节点]）：生成2-3个选项，targetNodeId全部相同（拓扑图标注的同一后继节点）；选项之间用不同态度/策略（强硬/圆滑/回避等）呈现语气差异，且至少一个选项写具体variableEffects——这是"主线不变，但选择是真的"，不是重复文案的伪选项，choiceWeight="light"
- start节点：1个推进选项(choiceWeight="light") + 可选探索触发
- merge节点：1个推进选项(choiceWeight="light")，承接多路径汇回后继续主线
- explore节点：choices=[]，只填exploreReturnNodeId（按拓扑）
- 所有targetNodeId必须从拓扑图中直接复制，禁止捏造或修改
- 前端在AI未生成任何选项时会自动补一个"继续"式单选项兜底（structure页逻辑，不在本次生成范围内）——那只是兜底，本环节应尽量按上述规则把选项设计到位，不要依赖它

【输出格式】
{
  "nodeChoices": [
    {
      "nodeTitle": "节点标题",
      "nodeId": "节点id（原样复制）",
      "exploreReturnNodeId": "",
      "choices": [
        { "text": "选项文字（≤10字）", "targetNodeId": "从拓扑复制", "variableEffects": "", "choiceWeight": "light" }
      ]
    }
  ]
}

输出：`
    },
}
