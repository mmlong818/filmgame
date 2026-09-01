import type { PromptContext } from './shared'

export const structurePrompts: Record<string, (c: PromptContext) => string> = {

    'structure:spine': (c) => {
      const plan = (c.scalePlan ?? {}) as Record<string, unknown>
      const chapterCount = Number(plan.chapterCount ?? 3)
      const world = (c.worldAnchor ?? {}) as Record<string, unknown>
      const chapters = (plan.chapters as Array<{title:string,brief:string}> | undefined) ?? []
      const chars = ((c.characters ?? []) as Array<{name:string,role?:string}>)
        .map(ch => `${ch.name}${ch.role ? `(${ch.role})` : ''}`).join('、') || '待定'

      const handoffTemplate = Array.from({ length: chapterCount - 1 }, (_, i) =>
        `{ "from": ${i+1}, "to": ${i+2}, "carry_over": "进入第${i+2}章时主角的关键处境（≤30字）" }`
      ).join(',\n    ')

      const arcTemplate = `"角色名": [${Array.from({ length: chapterCount }, (_, i) => `"第${i+1}章状态（≤12字）"`).join(', ')}]`

      const endingsDesign = (world.endingsDesign as Array<{title:string,type:string,triggerCondition:string}> | undefined) ?? []
      const endingsSummary = endingsDesign.length > 0
        ? `\n【预设结局线（${endingsDesign.length}个）】\n${endingsDesign.map((e, i) => `结局${i+1}「${e.title}」(${e.type})：${e.triggerCondition}`).join('\n')}\n骨干设计必须为每条结局线预留一条可达路径。`
        : ''

      return `互动影游叙事骨干设计。输出纯JSON，禁止任何额外内容。

【故事核心】${world.storyCore ?? ''}
【主题】${world.theme ?? ''}
【类型】${world.genre ?? ''}
【角色】${chars}
${endingsSummary}
【章节大纲（共${chapterCount}章）】
${chapters.map((ch, i) => `第${i+1}章：${ch.title} — ${ch.brief}`).join('\n')}

设计要求：
- throughlines：2-3条贯穿全剧的叙事线（角色关系弧、悬念线、主题线）
- chapter_handoffs：每次章节交接时，主角携带的关键情感/信息/处境变化
- character_arcs：每个主要角色在各章的核心状态（情感/立场/处境）

输出格式（严格按此结构）：
{
  "throughlines": ["叙事线1（≤20字）", "叙事线2（≤20字）"],
  "chapter_handoffs": [
    ${handoffTemplate}
  ],
  "character_arcs": {
    ${arcTemplate}
  }
}`
    },

    'structure:chapter': (c) => {
      const plan = (c.scalePlan ?? {}) as Record<string, unknown>
      const chapterCount = Number(plan.chapterCount ?? 3)
      const actCount = Number(plan.actCountPerChapter ?? 3)
      const totalNodes = Number(plan.totalNodes ?? 25)
      const chapterIndex = Number(c.chapterIndex ?? 0)
      const spine = (c.spine ?? {}) as Record<string, unknown>
      const world = (c.worldAnchor ?? {}) as Record<string, unknown>
      const endingCount = Number(world.endingCount ?? 2)
      const chapterOutline = (plan.chapters as Array<{title:string,brief:string}> | undefined) ?? []

      const isFirst = chapterIndex === 0
      const isLast = chapterIndex === chapterCount - 1
      const endingsDesign = (world.endingsDesign as Array<{title:string,type:string,triggerCondition:string}> | undefined) ?? []

      // 按规模方案（totalNodes/chapterCount/actCountPerChapter）推导本章、本幕的节点数硬约束，
      // 而不是像旧版本那样算出 nodesPerAct 却弃之不用——骨架的实际节点数必须贴合选中的规模方案。
      const chapterTargetNodes = Math.max(actCount * 2, Math.round(totalNodes / chapterCount))
      const baseNodesPerAct = Math.floor(chapterTargetNodes / actCount)
      const actRemainder = chapterTargetNodes - baseNodesPerAct * actCount
      const perActTarget = Array.from({ length: actCount }, (_, ai) => baseNodesPerAct + (ai < actRemainder ? 1 : 0))

      type SkelNode = { title: string; type: string; notes: string }

      // 跨幕合并：把本章内连续出现的"预算(perActTarget)<4"的非终章幕分组，由组内最后一幕（host）
      // 合并组内全部预算搭建完整菱形分支，组内其余幕（donor）退化为1个纯推进节点；落单的小预算幕
      // 并入相邻幕（只增加对方容量，不改变对方结构判定）。目的：杜绝"每幕预算不足→整章无分支→
      // 全片单线"（v0.6精简版单线问题的根源）。终章末幕不参与合并，始终维持门控扇出模板。
      const isTerminalActIdx = (ai: number) => isLast && ai === actCount - 1
      const donorOf: Array<number | null> = new Array(actCount).fill(null)
      const hostExtraBudget: number[] = new Array(actCount).fill(0)
      {
        let i = 0
        while (i < actCount) {
          if (isTerminalActIdx(i) || perActTarget[i] >= 4) { i++; continue }
          let j = i
          while (j < actCount && !isTerminalActIdx(j) && perActTarget[j] < 4) j++
          if (j - i >= 2) {
            // 连续小预算幕区间 [i, j)：最后一幕当host，其余当donor（各保留1个推进节点，其余预算转出）
            const host = j - 1
            for (let k = i; k < host; k++) {
              donorOf[k] = host
              hostExtraBudget[host] += perActTarget[k] - 1
            }
          } else {
            // 落单小预算幕：优先并入下一幕，找不到（如紧邻终章）则并入上一幕
            const host = j < actCount && !isTerminalActIdx(j)
              ? j
              : (i - 1 >= 0 && !isTerminalActIdx(i - 1) && donorOf[i - 1] === null ? i - 1 : -1)
            if (host >= 0) {
              donorOf[i] = host
              hostExtraBudget[host] += perActTarget[i] - 1
            }
          }
          i = j
        }
      }

      let chapterExploreUsed = false // 每章至多插入1个explore节点（本章总预算≥10时才允许）
      // C1-1（FR-18 v2）：每章植入即死BE岔口，数量随章预算浮动——出处 docs/genre-baseline.md 守则3。
      // 终章非末幕也给 1 个：后半段是后果爆发区，门控前"一步选错即死"是 Gauntlet 的标准张力
      //（此前终章配额 0 + 均匀铺分支，用户实测观感"后半段基本没有分支"）。
      const chapterBETarget = isLast ? 1 : (chapterTargetNodes >= 12 ? 2 : 1)
      let chapterBEUsed = 0
      // 分支密度向后递增：越接近结局，选择的后果越重、分歧越明显（隐形守护者后期裂成多条主线）。
      // 后半段章降低「章内平行路线」的预算门槛，让分岔在图上明显拉开而非一步汇合。
      const isLateChapter = chapterIndex >= Math.floor(chapterCount / 2)
      const parallelThreshold = isLateChapter ? 6 : 8

      const buildActNodes = (ai: number): SkelNode[] => {
        const isFirstAct = isFirst && ai === 0
        const isLastActOfAll = isLast && ai === actCount - 1
        const isDonorAct = donorOf[ai] !== null
        const nodes: SkelNode[] = []

        if (isFirstAct) {
          nodes.push({ title: '开场', type: 'start', notes: '主角登场，世界现状建立，触发事件' })
        } else if (isDonorAct) {
          nodes.push({ title: '节点名', type: 'normal', notes: `跨幕合并：本幕预算已并入第${(donorOf[ai] as number) + 1}幕用于搭建完整菱形分支，此处只承担剧情推进` })
        } else {
          nodes.push({ title: '节点名', type: 'normal', notes: '核心冲突推进' })
        }

        if (isLastActOfAll) {
          // 终章末幕：高潮 → 路线门控 → 各路线专属场景 + 结局（交替排列：[路线A内容, 结局A, 路线B内容, 结局B, ...]）
          nodes.push({ title: '最终时刻', type: 'normal', notes: '最黑暗时刻：所有矛盾在此爆发，此前积累的变量决定哪条路线对玩家开放' })
          nodes.push({ title: '路线门控', type: 'branch', notes: '根据全程积累的变量开放对应路线，每个选项的conditions字段必须填写具体变量条件（如affection_A>=3）' })
          const actualEndingCount = Math.max(2, endingCount)
          for (let e = 0; e < actualEndingCount; e++) {
            const design = (endingsDesign as Array<{title:string,type:string,triggerCondition:string}>)[e]
            // 每条路线：先有专属内容节点，再是结局节点（拓扑：路线入口 → 专属内容 → 结局）
            nodes.push({
              title: `${design?.title ?? `路线${e + 1}`}·专属场景`,
              type: 'normal',
              notes: design
                ? `【路线${e + 1}专属内容】条件：${design.triggerCondition}；写此路线玩家才能看到的场景、对话和情感时刻`
                : `【路线${e + 1}专属内容】只有满足此路线条件的玩家才能看到的场景`,
            })
            nodes.push({
              title: design?.title ?? `结局${e + 1}`,
              type: 'ending',
              notes: design ? `${design.type}结局：${design.triggerCondition}` : `结局${e + 1}`,
            })
          }
        } else if (isDonorAct) {
          // donor幕：预算已转给host幕，仅保留上方的entry节点本身，不再补足到自身原预算
        } else {
          // host/独立幕：actSize=本幕自身预算+跨幕合并转入的预算，决定用哪种结构模式——
          // 预算<4（合并后仍不足）退化为纯推进；4-7为标准菱形分支-汇合；≥8升级为章内平行路线。
          const actSize = perActTarget[ai] + hostExtraBudget[ai]
          const budget = actSize - nodes.length // 开场节点已占1个位置，这是留给本幕其余内容的预算
          if (budget < 3) {
            // 合并后仍不足以支撑"branch+至少2条路径"（极端小体量方案），退化为纯推进节点占位
            const fillCount = Math.max(1, budget)
            for (let f = 0; f < fillCount; f++) {
              nodes.push({ title: '节点名', type: 'normal', notes: '剧情推进：聚焦人物关系或线索揭示，为后续张力做铺垫（本幕预算较小，暂不设关键分支）' })
            }
          } else if (actSize >= parallelThreshold) {
            // 章内平行路线：预算充裕时，branch后每条路径各自独立推进2个以上节点，再汇回主线；
            // 若本章即死BE配额未用完，其中一条路径改为1节点BE ending（C1-1），其余路径维持≥2节点（C1-2）。
            // BE节点notes同样打[路径X]标签——branches:generate靠这个标签而非type序列还原路径归属。
            const pathCount = Math.min(3, Math.max(2, endingsDesign.length || endingCount))
            const perPathNodes = Math.max(2, Math.floor((budget - 2) / pathCount)) // -2：留给branch自身与末尾merge
            const includeBE = chapterBEUsed < chapterBETarget
            nodes.push({ title: '节点名', type: 'branch', notes: `关键选择（章内平行路线）：${pathCount}条路径各自独立推进${perPathNodes}个节点后再汇回主线；每个选项必须填写variableEffects记录对变量的影响，且至少保留一个无条件保底选项${includeBE ? '；其中一条路径改为即死结局（BE），需给出一个有吸引力/危险诱惑的选项让玩家可能选中它' : ''}` })
            for (let p = 0; p < pathCount; p++) {
              const label = ['A', 'B', 'C'][p]
              if (includeBE && p === pathCount - 1) {
                nodes.push({ title: `路径${label}·即死结局`, type: 'ending', notes: `[路径${label}] 即死结局（BAD END）：死法必须呼应主角弱点或世界规则，是一次性格测验而非随机惩罚；短而有戏，有专属画面感` })
                continue
              }
              for (let s = 0; s < perPathNodes; s++) {
                const hint = endingsDesign[p]
                  ? `与「${endingsDesign[p].title}」结局相关的路线，第${s + 1}段：情节与其他路径明显不同`
                  : `路径${label}第${s + 1}段：与此路线角色的专属场景，情节与其他路径明显不同`
                nodes.push({ title: '节点名', type: 'normal', notes: `[路径${label}] ${hint}` })
              }
            }
            if (includeBE) chapterBEUsed++
            const remainAfterPaths = actSize - nodes.length
            if (remainAfterPaths >= 1) {
              nodes.push({ title: '续接', type: 'merge', notes: '各路径汇回主线，故事继续向前推进' })
            }
            if (!isLast && !chapterExploreUsed && chapterTargetNodes >= 10 && remainAfterPaths >= 2) {
              nodes.push({ title: '探索：槽位名', type: 'explore', notes: '可选隐藏内容：角色秘密、线索物品或世界背景' })
              chapterExploreUsed = true
            }
          } else {
            // 标准菱形分支-汇合（预算4-7）：branch → 2-3条路径 → merge；非BE路径拉长为≥2节点
            // （路径入口+路径深化，C1-2），预算不足时优先保路径长度与BE岔口（C1-1），要裁剪就裁剪
            // 下方"补足到本幕目标节点数"环节的填充节点，不压缩这里的结构节点；若因此实际节点数
            // 超出规划预算，交由既有跨幕合并机制在预算阶段吸收，此处不为凑数而牺牲路径。
            const maxPaths = Math.min(3, budget - 1) // 给branch本身留1个节点位，其余留给各路径
            const pathCount = Math.min(Math.max(2, endingsDesign.length || endingCount), maxPaths)
            const includeBE = chapterBEUsed < chapterBETarget
            nodes.push({ title: '节点名', type: 'branch', notes: `关键选择：${pathCount}条路径各有专属场景，结束后汇回；每个选项必须填写variableEffects记录对变量的影响，且至少保留一个无条件保底选项${includeBE ? '；其中一条路径改为即死结局（BE），需给出一个有吸引力/危险诱惑的选项让玩家可能选中它' : ''}` })
            for (let p = 0; p < pathCount; p++) {
              const label = ['A', 'B', 'C'][p]
              if (includeBE && p === pathCount - 1) {
                nodes.push({ title: `路径${label}·即死结局`, type: 'ending', notes: `[路径${label}] 即死结局（BAD END）：死法必须呼应主角弱点或世界规则，是一次性格测验而非随机惩罚；短而有戏，有专属画面感` })
                continue
              }
              const hint = endingsDesign[p]
                ? `与「${endingsDesign[p].title}」结局相关的选择，affection或变量+1`
                : `路径${label}：与此路线角色的专属场景，情节与其他路径明显不同`
              nodes.push({ title: '节点名', type: 'normal', notes: `[路径${label}] 路径入口：${hint}` })
              nodes.push({ title: '节点名', type: 'normal', notes: `[路径${label}] 路径深化：延续路径${label}的情节走向，与其他路径的差异要具体可感` })
            }
            if (includeBE) chapterBEUsed++
            const remainAfterPaths = actSize - nodes.length
            if (remainAfterPaths >= 1) {
              nodes.push({ title: '续接', type: 'merge', notes: '各路径汇回主线，故事继续向前推进' })
            }
            if (!isLast && !chapterExploreUsed && chapterTargetNodes >= 10 && remainAfterPaths >= 2) {
              nodes.push({ title: '探索：槽位名', type: 'explore', notes: '可选隐藏内容：角色秘密、线索物品或世界背景' })
              chapterExploreUsed = true
            }
          }
        }

        // 补足到本幕目标节点数：donor幕补到1（即只保留entry，预算已转出）；host/独立幕补到
        // actSize。结构性骨架（开场/分支/结局等）不足时插入内容推进节点；若结局数量等结构性下限
        // 已超过目标（如小规模方案+多结局），保留结构完整性，不强行裁剪。
        const target = isDonorAct ? 1 : perActTarget[ai] + hostExtraBudget[ai]
        let guard = 0
        while (nodes.length < target && guard < 30) {
          nodes.splice(1, 0, { title: '节点名', type: 'normal', notes: '剧情推进节点：补充本幕内容密度，承接前文并为后续做铺垫，可展开人物互动或信息揭示' })
          guard++
        }

        return nodes
      }

      const acts = Array.from({ length: actCount }, (_, ai) => ({
        title: `第${ai + 1}幕：幕名`,
        nodes: buildActNodes(ai),
      }))

      // C1-3/C1-4（FR-18 v2）：骨架产出后统一做跨幕后处理——merge回响与章末钩子都要看"整章拼接后
      // 的顺序"而非单幕内部，所以放在所有幕都生成完之后统一扫描，而不是塞进buildActNodes内部。
      {
        const flat: Array<{ ai: number; ni: number }> = []
        acts.forEach((act, ai) => act.nodes.forEach((_, ni) => flat.push({ ai, ni })))
        const nodeAt = (ref: { ai: number; ni: number }) => acts[ref.ai].nodes[ref.ni]
        const appendNote = (node: SkelNode, extra: string) => {
          node.notes = node.notes ? `${node.notes}；${extra}` : extra
        }
        // merge节点之后的第一个节点（或merge本身若无后继）：按路线变量写差异化开场台词
        flat.forEach((ref, idx) => {
          const node = nodeAt(ref)
          if (node.type !== 'merge') return
          const nextRef = flat[idx + 1]
          appendNote(nextRef ? nodeAt(nextRef) : node, '开场台词必须按玩家来路（本幕路线变量）写出差异化版本')
        })
        // 本章最后一个非ending节点：强制章末钩子（终章没有"下一章"，不加）
        if (!isLast) {
          for (let idx = flat.length - 1; idx >= 0; idx--) {
            const node = nodeAt(flat[idx])
            if (node.type !== 'ending') {
              appendNote(node, '本章末钩子：以悬念/反转/倒计时收束，给观众继续看下一章的理由')
              break
            }
          }
        }
      }

      const chapterSkeleton = {
        title: chapterOutline[chapterIndex]?.title ?? `第${chapterIndex + 1}章`,
        acts,
      }
      const actualNodeCounts = acts.map(a => a.nodes.length)
      const actualChapterTotal = actualNodeCounts.reduce((s, n) => s + n, 0)

      const handoffs = (spine.chapter_handoffs as Array<{from:number,to:number,carry_over:string}> | undefined) ?? []
      const incomingHandoff = handoffs.find(h => h.to === chapterIndex + 1)
      const outgoingHandoff = handoffs.find(h => h.from === chapterIndex + 1)
      const charArcs = (spine.character_arcs ?? {}) as Record<string, string[]>
      const chapterArcs = Object.entries(charArcs)
        .map(([name, arc]) => `${name}：${arc[chapterIndex] ?? ''}`)
        .filter(s => s.includes('：') && s.split('：')[1])
        .join('  |  ')

      const endingsSummary = isLast && endingsDesign.length > 0
        ? `\n【终章结局目标】\n${endingsDesign.map((e, i) => `结局${i+1}「${e.title}」(${e.type})：${e.triggerCondition}`).join('\n')}\n终章节点设计必须能将玩家的关键选择引向以上结局。\n`
        : ''

      return `互动影游节点设计。填充第${chapterIndex + 1}章骨架并输出JSON。
禁止输出JSON以外的任何内容，保持 title/acts/nodes/type/notes 字段名不变。

【故事世界设定】${world.storyCore ?? ''}
【主题】${world.theme ?? ''}

【本章节点数量硬性约束——依据你选择的规模方案精确计算，不可增减】
规模方案：全剧共${totalNodes}个节点 / ${chapterCount}章 / 每章${actCount}幕。本章目标节点数=${chapterTargetNodes}，下方骨架已据此精确搭建，实际共${actualChapterTotal}个节点：
${actualNodeCounts.map((n, ai) => `第${ai + 1}幕恰好${n}个节点`).join('，')}。
输出时每一幕的 nodes 数组长度必须与骨架逐幕完全一致，禁止增加或删除任何节点（结局等结构性节点已包含在上述数字中）。

【跨章叙事线】${((spine.throughlines as string[]) ?? []).join(' / ')}
【本章角色状态】${chapterArcs || '见世界设定'}
${incomingHandoff ? `【承接上章】${incomingHandoff.carry_over}` : '【本章定位】故事开篇，建立世界与主角'}
${outgoingHandoff ? `【本章结束时】需为下章铺垫：${outgoingHandoff.carry_over}` : `【本章定位】终章，走向多结局`}
${endingsSummary}
【本章在全剧中的位置】第${chapterIndex + 1}章 / 共${chapterCount}章${isFirst ? '（开篇：建立世界、触发事件、第一个道德选择）' : ''}${isLast ? '（终章：最黑暗时刻 → 内心蜕变 → 最终抉择 → 多结局）' : ''}

【节点type规则】start=开场(唯一) | ending=结局（含非终章中途的即死BE小结局，骨架已按需插入，属正常结构，禁止把它改成其他type或删除） | branch=关键选择点 | normal=主线推进 | merge=多路径汇回主线（骨架已按需插入，必须保留原位置与类型） | explore=可选旁支
【分支规则】非终章·菱形分支-汇合（默认）：branch → 2-3条路径 → merge；路径中若有一条是1节点的ending（即死BE），其余路径各≥2节点（路径入口+路径深化）后再汇回merge；非终章·章内平行路线（预算充裕的幕）：branch → 每条路径各自独立推进2个以上节点（同样可能有一条是1节点即死BE） → merge；终章：branch(路线门控) → 各路线专属场景 → 多个ending节点（每个结局对应一条路径，永不汇合）
【变量规则】中段branch节点的每个选项必须在variableEffects字段写出修改了哪个变量（例：trust+1，0-10整数量表，不用百分比），且至少保留一个无条件选项作为保底出口，避免玩家被条件卡死；终章门控节点的选项用conditions读取这些变量决定开放哪条路线；通向中途即死BE的选项不写variableEffects（选中即死，无需变量记录）

【骨架（填充后输出，节点数量已按规模方案精确计算，见上方硬性约束）】
${JSON.stringify(chapterSkeleton, null, 2)}

输出（结构必须与骨架完全一致：节点数量（本章共${actualChapterTotal}个，逐幕数量见上）、顺序、type均不可更改；仅替换title/notes值；merge节点必须保留，不得删除或改type；严禁将branch降为normal；中途ending（即死BE）节点必须保留，不得改type、删除或误当作笔误"修正"回normal）：`
    },

    // structure:targeted_fix（FR-19）：只产出"节点级补丁"，不做整体重生成——
    // 输出schema与lib/ai/targetedFixTypes.ts的TargetedFixResult一一对应，两边不得各自扩展。
    'structure:targeted_fix': (c) => {
      const structureSummary = (c.structureSummary as string | undefined) ?? ''
      const issues = (c.issues as Array<{level?: string; code?: string; message?: string}> | undefined) ?? []
      const mustFix = (c.mustFix as string[] | undefined) ?? []
      const variables = (c.variables as Array<{name:string; description?: string}> | undefined) ?? []
      const endingsDesign = (c.endingsDesign as Array<{title:string; type?:string; triggerCondition?:string; keyVariable?:string}> | undefined) ?? []

      // issues按error>warning>info排序展示，配合下方"修复优先级"约束，引导AI先修硬伤
      const levelRank: Record<string, number> = { error: 0, warning: 1, info: 2 }
      const sortedIssues = [...issues].sort((a, b) => (levelRank[a.level ?? 'info'] ?? 3) - (levelRank[b.level ?? 'info'] ?? 3))
      const issuesText = sortedIssues.map((it, i) => `${i + 1}. [${it.level ?? '?'}/${it.code ?? '?'}] ${it.message ?? ''}`).join('\n') || '（本地校验无问题）'
      const mustFixText = mustFix.map((m, i) => `${i + 1}. ${m}`).join('\n') || '（导演终审无必改项）'
      const varText = variables.map(v => `${v.name}${v.description ? `（${v.description}）` : ''}`).join('、') || '（未定义变量）'
      const endingsText = endingsDesign.map((e, i) => `结局${i + 1}「${e.title}」(${e.type ?? ''})：触发条件=${e.triggerCondition ?? ''}${e.keyVariable ? `，关键变量=${e.keyVariable}` : ''}`).join('\n') || '（未设计结局）'

      return `你是互动影游结构医生，只做"节点级补丁"，不做整体重写，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【当前结构摘要】
${structureSummary}

【本地校验问题（已按error>warning>info排序）】
${issuesText}

【导演终审必改项】
${mustFixText}

【叙事变量】${varText}
【结局设计】
${endingsText}

【修复优先级——严格按此顺序分配ops】
1. 先解决error级问题（如UNSATISFIABLE_CONDITION：条件永不可满足；断链/死路）
2. 再解决导演终审mustFix
3. 最后解决warning级问题（如ALL_CHOICES_GATED：节点缺无条件保底出口）

【硬性约束】
- 禁止删除或改写已有对白/场景内容：update_node只能补note或改title/type，不得用来清空或覆盖已有内容
- 新增节点（add_node）的notes必须写明剧情意图——为什么加这个节点、承接什么、通向什么
- 每个op的reason字段必须指明对应哪一条issue或mustFix（引用其编号或原文关键词），不得空泛
- 修复ALL_CHOICES_GATED：用add_choice为该节点补一个无条件（conditions留空）的保底选项
- 修复UNSATISFIABLE_CONDITION：用update_choice把条件阈值降到该变量理论可达上界以内，或改用更早已生效的变量
- 新增/修改选项若带conditions，该节点必须仍保留至少一个无条件选项，不得让节点整体被条件锁死
- ops总数不超过25条；优先修复影响面大、级别高的问题，其余留给下一轮

【节点引用规则】target/after优先用nodeId；引用本次补丁中新增的节点时用其title（nodeTitle）

【六种op的字段形状】
- add_node：{"op":"add_node","after":{节点引用},"node":{"title":"","type":"normal|branch|merge|ending|start|explore","notes":"剧情意图"},"reason":""}
- update_node：{"op":"update_node","target":{节点引用},"patch":{"title":"","type":"","notes":""},"reason":""}（patch字段只填需要改的）
- add_choice：{"op":"add_choice","target":{节点引用},"choice":{"text":"","target":{节点引用},"conditions":"","variableEffects":"","consequence":""},"reason":""}
- update_choice：{"op":"update_choice","target":{节点引用},"choiceText":"原选项文字（只写选项本身的文字，不要带「→ 目标」「效果:xx」等摘要标注）","patch":{"text":"","conditions":"","variableEffects":"","consequence":"","targetRef":{节点引用}},"reason":""}
- set_explore_return：{"op":"set_explore_return","target":{节点引用},"returnTo":{节点引用},"reason":""}
- bind_ending：{"op":"bind_ending","target":{节点引用},"ending":{"title":"","type":"good|bad|neutral|secret","description":"","conditions":""},"reason":""}
节点引用格式统一为 {"nodeId":"..."} 或 {"nodeTitle":"..."}

【输出模板】
{"summary":"本轮修复思路，1-2句","ops":[{"op":"add_choice","target":{"nodeId":"节点id"},"choice":{"text":"选项文字","target":{"nodeId":"目标节点id"},"conditions":"","variableEffects":"","consequence":"后果描述"},"reason":"修复第1条issue：ALL_CHOICES_GATED"}]}

输出：`
    },
}
