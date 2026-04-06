import type { Phase } from '@/lib/types/phase'

type PromptContext = Record<string, unknown>

export function buildPrompt(phase: Phase | string, action: string, context: PromptContext): string {
  const key = `${phase}:${action}`
  const ctx = context as PromptContext

  const templates: Record<string, (c: PromptContext) => string> = {

    'world:fix_issues': (c) => {
      const wa = (c.worldAnchor ?? {}) as Record<string, unknown>
      const issues = (c.issues ?? []) as Array<{field: string; issue: string; suggestion: string}>
      const issueText = issues.map(i => `字段「${i.field}」：${i.issue}\n修改建议：${i.suggestion}`).join('\n\n')
      return `你是互动影游世界设定修改专家。根据审查意见修正世界设定字段，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【当前世界设定】
故事核：${wa.storyCore ?? ''}
核心主题：${wa.theme ?? ''}
类型/风格：${wa.genre ?? ''}
世界规则：${wa.worldRules ?? ''}

【需要修正的问题】
${issueText}

【要求】
- 只输出需要修改的字段，未修改的字段不输出
- 修改要有实质性改善，不是微调措辞
- 保持其他字段的风格和设定一致
- 可修改的字段：storyCore、theme、genre、worldRules

【输出模板（只输出需修改的字段）】
{"storyCore":"修正后的故事核（如该字段有问题）","theme":"修正后的主题（如该字段有问题）"}

输出：`
    },

    'world:suggest_characters': (c) => {
      const wa = (c.worldAnchor ?? c) as Record<string, unknown>
      const endings = (wa.endingsDesign as Array<{title:string,triggerCondition:string}> | undefined) ?? []
      const endingHints = endings.length > 0
        ? `\n【结局线参考】\n${endings.map(e => `${e.title}：${e.triggerCondition}`).join('\n')}\n角色设计要能支撑以上结局路线的差异。`
        : ''
      return `你是互动影游角色设计师。根据世界设定生成2-4个主要角色，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${wa.storyCore ?? ''}
【主题】${wa.theme ?? ''}
【类型】${wa.genre ?? ''}
【世界规则】${wa.worldRules ?? ''}
${endingHints}
【要求】
- 必须有1个主角(protagonist)，其余为对立角色(antagonist)/支线角色(support)
- 每个角色的wound/lie/want/need要与故事核产生张力
- 角色之间的关系要能自然制造冲突

【输出模板】
{"characters":[{"name":"角色名","role":"protagonist","motivation":"核心动机","relationship":"与主线的关系","wound":"心理伤痛（过去的创伤）","lie":"内心谎言（用来保护自己的错误信念）","want":"外部欲望（想得到什么）","need":"内在需求（真正需要什么）"},{"name":"角色名","role":"antagonist","motivation":"...","relationship":"...","wound":"...","lie":"...","want":"...","need":"..."}]}

输出：`
    },

    'world:review': (c) => `你收到一份互动影游世界设定，需要从一致性和叙事结构两个维度审查并输出JSON报告。
禁止输出JSON以外的任何内容，禁止Markdown代码块（不要写\`\`\`json），字段名必须与模板完全一致。

【世界设定输入】
${JSON.stringify(c, null, 2)}

【审查维度】
1. 一致性：世界规则是否自洽，角色设定是否与故事核匹配，时长与规模是否合理
2. 叙事张力结构：故事核是否包含"主角想要什么 + 什么在阻碍"的核心张力？如果只有设定没有欲望和阻碍，则结构不成立
3. 冲突支撑力：世界规则是否能自然产生冲突？还是只是一堆设定装饰？规则应该是"逼迫角色做出艰难选择"的引擎
4. 角色内在冲突空间：角色动机之间是否存在矛盾？一个只有外部敌人没有内心撕裂的角色是扁平的
5. 互动主题表达：主题能否通过玩家的选择来体现？如果主题只能线性展示而无法通过分支选择让玩家"亲身经历"，则互动性不足

【输出模板】字段名固定，值替换为真实审查结论：
{"consistency":"通过","structure_analysis":"对故事核张力结构的分析，指出欲望和阻碍是否明确","interactive_potential":"高/中/低，主题能否通过互动选择体现","issues":[],"duration_match":"匹配","overall":"综合评价，1-2句"}

字段说明（值只能按此规则填写）：
- consistency：只能是 "通过" 或 "有风险"
- structure_analysis：1-2句，分析故事核是否符合"人物欲望+外部/内部阻碍"的张力结构
- interactive_potential：只能是 "高"、"中" 或 "低"，评估主题是否能通过玩家选择体现
- issues：空数组或[{"field":"字段名","issue":"具体问题","suggestion":"修改建议"}]
- duration_match：只能是 "匹配"、"偏多" 或 "偏少"
- overall：1-2句中文评价

输出：`,

    'world:suggest_variables': (c) => {
      const wa = (c.worldAnchor ?? c) as Record<string, unknown>
      const endings = (wa.endingsDesign as Array<{title:string,type:string,triggerCondition:string,avoidCondition:string}> | undefined) ?? []
      const chars = (c.characters ?? []) as Array<{name:string,role:string}>
      const endingsSummary = endings.map((e, i) => `结局${i+1}「${e.title}」(${e.type})：达成条件=${e.triggerCondition}`).join('\n')
      const charSummary = chars.map(ch => `${ch.name}(${ch.role})`).join('、')
      return `你是互动影游系统设计师。根据故事设定和结局条件，提取出游戏需要追踪的叙事变量，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事类型】${wa.genre ?? ''}
【故事核】${wa.storyCore ?? ''}
【世界规则】${wa.worldRules ?? ''}
【角色】${charSummary || '暂无（请根据故事类型推断需要哪些关系变量）'}

【结局设计】
${endingsSummary || '暂无——请根据故事类型自行设计3-5个有意义的追踪变量（如关系好感度、道德倾向、关键标记等）'}

【变量类型说明】
- counter：整数累加（如好感度0~5，道德值0~10）
- flag：0或1的开关（如是否完成了某件事、是否发现了秘密）
- relationship：关系值（-5到+5，负为敌对，正为亲密）
- item：是否持有某物品/信息

【要求】从结局条件提取变量名（如"affection_A>=3"→变量affection_A）；每个变量名用英文下划线命名；给出type/defaultValue/description；共3-6个变量

【输出模板】
{"variables":[{"name":"affection_A","type":"counter","defaultValue":"0","description":"主角与角色A的好感度"},{"name":"trust","type":"counter","defaultValue":"0","description":"信任度，影响关键时刻选项"}]}

输出：`
    },

    'world:endings_design': (c) => {
      const wa = (c.worldAnchor ?? c) as Record<string, unknown>
      const count = Number(wa.endingCount ?? 3)
      const chars = (c.characters ?? []) as Array<{name:string,role:string,motivation?:string}>
      const charSummary = chars.map(ch => `${ch.name}（${ch.role}）：${ch.motivation ?? ''}`).join('\n')
      return `你是互动影游结局设计师。根据世界设定设计${count}个差异鲜明的结局。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【世界设定】
故事核：${wa.storyCore ?? ''}
主题：${wa.theme ?? ''}
类型：${wa.genre ?? ''}
世界规则：${wa.worldRules ?? ''}

【主要角色】
${charSummary || '暂无'}

【设计要求】
- 每个结局必须代表主题的不同维度（救赎/毁灭/妥协/真相…）
- 结局之间的达成路径要互斥——选择不同的关键节点才能到达
- triggerCondition：玩家需要做什么关键选择才能走向此结局（具体行为，非抽象描述）
- avoidCondition：哪类选择会导致偏离此结局走向其他结局
- keyVariable：如果有变量追踪（如信任度、勇气值），写出关键变量名和阈值，否则留空

【输出模板（共${count}个结局）】
{"endings":[{"id":"e1","title":"结局标题","type":"good","description":"此结局中玩家经历的最终命运，1-2句","triggerCondition":"达成此结局需要做的关键选择（具体）","avoidCondition":"哪些选择会让玩家偏离此结局","keyVariable":"变量名>=值 或 留空"},{"id":"e2","title":"结局标题","type":"bad","description":"...","triggerCondition":"...","avoidCondition":"...","keyVariable":""},{"id":"e3","title":"结局标题","type":"neutral","description":"...","triggerCondition":"...","avoidCondition":"...","keyVariable":""}]}

type只能是：good、bad、neutral、secret之一。secret结局需要特别隐蔽的条件。

输出：`
    },

    'scale:generate': (c) => `你收到一份互动影游世界设定，需要生成三套规模方案并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【世界设定输入】
${JSON.stringify(c, null, 2)}

【输出模板】字段名固定，值替换为根据世界设定推算的真实数字和内容：
{"plans":[{"id":"plan_a","label":"精简版","chapterCount":2,"actCountPerChapter":2,"totalNodes":12,"totalBranches":6,"estimatedHours":50,"aiRationale":"适合首次尝试，低成本快速验证","chapters":[{"title":"第一章：开端","brief":"主角登场，核心矛盾浮现"},{"title":"第二章：终局","brief":"矛盾爆发，走向结局"}]},{"id":"plan_b","label":"标准版","chapterCount":3,"actCountPerChapter":3,"totalNodes":24,"totalBranches":12,"estimatedHours":100,"aiRationale":"推荐方案，结构完整，复杂度适中","chapters":[{"title":"第一章：引入","brief":"世界建立，角色登场"},{"title":"第二章：对抗","brief":"矛盾激化，选择分叉"},{"title":"第三章：结局","brief":"多线收束，命运揭晓"}]},{"id":"plan_c","label":"史诗版","chapterCount":5,"actCountPerChapter":4,"totalNodes":45,"totalBranches":28,"estimatedHours":220,"aiRationale":"高复杂度，适合有经验的团队","chapters":[{"title":"第一章：序章","brief":"铺垫伏笔"},{"title":"第二章：上升","brief":"矛盾扩大"},{"title":"第三章：转折","brief":"核心反转"},{"title":"第四章：高潮","brief":"全面对决"},{"title":"第五章：尾声","brief":"多结局展开"}]}]}

注意：三套方案的章数（chapterCount）、幕数（actCountPerChapter）、节点数（totalNodes）必须随规模递增；chapters数组长度必须等于chapterCount；章节标题和brief要贴合输入的故事设定。

输出：`,

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
      const nodesPerAct = Math.max(2, Math.round(totalNodes / (chapterCount * actCount)))
      const endingsDesign = (world.endingsDesign as Array<{title:string,type:string,triggerCondition:string}> | undefined) ?? []

      type SkelNode = { title: string; type: string; notes: string }

      const buildActNodes = (ai: number): SkelNode[] => {
        const isFirstAct = isFirst && ai === 0
        const isLastActOfAll = isLast && ai === actCount - 1
        const nodes: SkelNode[] = []

        if (isFirstAct) {
          nodes.push({ title: '开场', type: 'start', notes: '主角登场，世界现状建立，触发事件' })
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
        } else {
          // 非终章：菱形分支——每条路有专属场景（内容真实不同），之后汇回主线；variableEffects记录选择差异
          const pathCount = Math.min(Math.max(2, endingsDesign.length || endingCount), 3)
          nodes.push({ title: '节点名', type: 'branch', notes: `关键选择：${pathCount}条路径各有专属场景，结束后汇回；variableEffects必须记录此选择对变量的影响` })
          for (let p = 0; p < pathCount; p++) {
            const label = ['A', 'B', 'C'][p]
            const hint = endingsDesign[p]
              ? `与「${endingsDesign[p].title}」结局相关的选择，affection或变量+1`
              : `路径${label}：与此路线角色的专属场景，情节与其他路径明显不同`
            nodes.push({ title: '节点名', type: 'normal', notes: `[路径${label}] ${hint}` })
          }
          nodes.push({ title: '续接', type: 'merge', notes: '各路径汇回主线，故事继续向前推进' })
          if (!isLast) {
            nodes.push({ title: '探索：槽位名', type: 'explore', notes: '可选隐藏内容：角色秘密、线索物品或世界背景' })
          }
        }

        return nodes
      }

      const chapterSkeleton = {
        title: chapterOutline[chapterIndex]?.title ?? `第${chapterIndex + 1}章`,
        acts: Array.from({ length: actCount }, (_, ai) => ({
          title: `第${ai + 1}幕：幕名`,
          nodes: buildActNodes(ai),
        })),
      }

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

【跨章叙事线】${((spine.throughlines as string[]) ?? []).join(' / ')}
【本章角色状态】${chapterArcs || '见世界设定'}
${incomingHandoff ? `【承接上章】${incomingHandoff.carry_over}` : '【本章定位】故事开篇，建立世界与主角'}
${outgoingHandoff ? `【本章结束时】需为下章铺垫：${outgoingHandoff.carry_over}` : `【本章定位】终章，走向多结局`}
${endingsSummary}
【本章在全剧中的位置】第${chapterIndex + 1}章 / 共${chapterCount}章${isFirst ? '（开篇：建立世界、触发事件、第一个道德选择）' : ''}${isLast ? '（终章：最黑暗时刻 → 内心蜕变 → 最终抉择 → 多结局）' : ''}

【节点type规则】start=开场(唯一) | ending=结局 | branch=关键选择点 | normal=主线推进 | explore=可选旁支（不再使用merge节点）
【分支规则】非终章：branch → [A路径 normal] + [B路径 normal] → 两条路径各自独立推进到本幕末尾，不设汇聚节点；终章：branch → 多个ending节点（每个结局对应一条路径）
【变量规则】branch节点的每个选项必须在variableEffects字段写出修改了哪个变量（例：trust+1 / betrayed=true），后续节点可根据变量值限制选项

【骨架（填充后输出）】
${JSON.stringify(chapterSkeleton, null, 2)}

输出（结构必须与骨架完全一致：节点数量、顺序、type均不可更改；仅替换title/notes值；严禁出现merge类型节点；严禁将branch降为normal）：`
    },

    'branches:generate': (c) => {
      type N = { id: string; title: string; type: string; notes?: string }
      const nodes = (c.nodes ?? []) as N[]
      const variables = (c.variables as Array<{name:string,label?:string}> | undefined) ?? []
      const varNames = variables.map(v => v.name).join('、')

      // ── 第一步：预计算每个 branch 的类型和路线块 ────────────────────────
      // 路线块：branch 之后 [normal, ending] 交替出现的分组
      //   - 多个路线块 (>=2) → 路线门控（每块有专属内容 + 结局）
      //   - 一个路线块且有结局 → 终章直接到结局
      //   - 无结局 → 变量积累型（所有选项→同一下一节点）
      type RouteBlock = { normals: N[]; ending: N | null }
      const branchRouteBlocks = new Map<string, RouteBlock[]>()
      const routeNodeNext = new Map<string, N>()   // 路线内节点→其在路线内的下一节点（含结局）

      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type !== 'branch') continue
        const blocks: RouteBlock[] = []
        let curNormals: N[] = []

        for (let j = i + 1; j < nodes.length; j++) {
          const x = nodes[j]
          if (x.type === 'explore') continue
          if (x.type === 'ending') {
            blocks.push({ normals: curNormals, ending: x })
            curNormals = []
          } else if (x.type === 'normal') {
            curNormals.push(x)
          } else {
            break
          }
        }
        if (curNormals.length > 0) blocks.push({ normals: curNormals, ending: null })

        if (blocks.length > 0) {
          branchRouteBlocks.set(nodes[i].id, blocks)
          // 预计算路线内节点的下一目标
          for (const block of blocks) {
            for (let k = 0; k < block.normals.length; k++) {
              const target = k < block.normals.length - 1
                ? block.normals[k + 1]
                : (block.ending ?? null)
              if (target) routeNodeNext.set(block.normals[k].id, target)
            }
          }
        }
      }

      // ── 第二步：构建连接拓扑 ─────────────────────────────────────────────
      type Conn = { from: N; targets: N[]; role: 'advance' | 'branch'; branchKind?: 'route' | 'variable' | 'terminal' | 'diamond' }
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
          const blocks = branchRouteBlocks.get(n.id)
          if (!blocks || blocks.length === 0) {
            // 无路线块也无紧跟 normal：variable 型，所有选项→下一节点
            const next = nodes.slice(i + 1).find(x => x.type !== 'explore' && x.type !== 'ending')
            if (next) conns.push({ from: n, targets: [next], role: 'branch', branchKind: 'variable' })
          } else if (blocks.length >= 2) {
            // 多路线门控（多个 [normal+ending] 块）：终章路线门控
            const routeEntries = blocks.map(b => b.normals[0] ?? b.ending).filter(Boolean) as N[]
            conns.push({ from: n, targets: routeEntries, role: 'branch', branchKind: 'route' })
          } else if (blocks.length === 1 && blocks[0].ending && blocks[0].normals.length === 0) {
            // 单个无内容块：终章直通结局（不常见）
            const endings = blocks.map(b => b.ending).filter(Boolean) as N[]
            conns.push({ from: n, targets: endings, role: 'branch', branchKind: 'terminal' })
          } else if (blocks.length === 1 && blocks[0].normals.length >= 2) {
            // 菱形分支：同一块内多个 normal = 多条路径，之后接 merge
            const paths = blocks[0].normals
            conns.push({ from: n, targets: paths, role: 'branch', branchKind: 'diamond' })
            // 找 merge（或路径组结束后第一个非 explore 节点）
            const afterIdx = i + 1 + paths.length
            const merge = nodes.slice(afterIdx).find(x => x.type === 'merge' || (x.type !== 'explore' && x.type !== 'ending' && !paths.includes(x)))
            if (merge) {
              for (const pn of paths) {
                routeNodeNext.set(pn.id, merge)
              }
            }
          } else {
            // 单条 normal（变量积累型）
            const next = blocks[0].normals[0] ?? blocks[0].ending
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
            : kind === 'diamond' ? '菱形分支（每个选项有独立专属场景，之后汇回续接节点）'
            : '变量积累（所有选项指向同一节点，仅variableEffects不同）'
          const targetsStr = conn.targets.map((t, idx) =>
            `    选项${idx + 1}: "${t.title}"[id:${t.id}]${t.type === 'ending' ? ' [结局]' : ''}${kind === 'route' ? ' （需在conditions写对应变量条件）' : ''}`
          ).join('\n')
          return `${fromStr}[branch/${kind}] → ${kindLabel}:\n${targetsStr}`
        }
        if (conn.from.type === 'explore') {
          return `${fromStr}[explore] → exploreReturnNodeId必须设为: "${conn.targets[0].title}"[id:${conn.targets[0].id}]，choices=[]`
        }
        if ((conn.role as string) === 'explore_trigger') {
          return `${fromStr} → 【可选】可加一个轻量选项指向explore: "${conn.targets[0].title}"[id:${conn.targets[0].id}]`
        }
        const tag = routeNodeIds.has(conn.from.id) ? '[路线节点]' : ''
        return `${fromStr}${tag} → 【必须】推进选项指向: "${conn.targets[0].title}"[id:${conn.targets[0].id}]`
      }).join('\n')

      const needChoices = nodes.filter(n => n.type !== 'ending')
      const world = (c.worldAnchor as Record<string,unknown>) ?? {}

      return `你是互动影游编剧，为每个节点设计玩家选项并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核心】${world.storyCore ?? ''}
【主题】${world.theme ?? ''}
【角色】${((c.characters ?? []) as Array<{name:string,role:string}>).map(ch => `${ch.name}(${ch.role})`).join('、') || '见故事设定'}
${varNames ? `【叙事变量】${varNames}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【连接拓扑——targetNodeId必须完全按此填写，禁止更改】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${topoLines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【你的任务：为以下节点设计选项文字（共${needChoices.length}个）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${needChoices.map((n, i) => `${i+1}. [${n.type}] id="${n.id}" "${n.title}"`).join('\n')}

【选项设计规则（严格按branch类型区分）】
- branch/diamond（菱形分支）：每个选项指向不同的专属路径节点（内容各不相同），variableEffects必须写出此选择对变量的影响（如"affection_A+1"），choiceWeight="heavy"
- branch/variable（变量积累型）：2-3个选项，所有选项targetNodeId相同，但variableEffects各不同，choiceWeight="heavy"
- branch/route（路线门控）：每个选项指向不同路线入口，conditions填变量阈值（如"affection_A>=3"），choiceWeight="critical"
- branch/terminal（终章直通）：每个选项指向结局节点，conditions填变量条件，choiceWeight="critical"
- 菱形路径节点[路线节点]：1个推进选项指向续接节点（汇回主线），choiceWeight="light"
- normal/start节点：1个推进选项(choiceWeight="light") + 可选探索触发
- explore节点：choices=[]，只填exploreReturnNodeId（按拓扑）
- 所有targetNodeId必须从拓扑图中直接复制，禁止捏造或修改

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

    'workshop:fill_emotion': (c) => `你是一位精通角色心理学的资深编剧，需要为互动影游节点设计深层情感状态并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【节点数据】
${JSON.stringify(c, null, 2)}

【情感设计原则】
- 角色的外部行为与内心状态必须存在张力：一个"平静"的人内心可能是"恐惧"，一个"愤怒"的人内心可能是"绝望"
- internal_lie：此刻角色正在对自己撒的谎，用来保护自己不面对真相（例："只要我不说出来就不算真的发生"）
- fear：此刻角色最想回避的事——不是具体危险，而是心理层面的恐惧（例：害怕被看穿自己一无所有）
- emotionIn/emotionOut 描述可见的外在情绪状态（进入和离开节点时）
- playerEmotion 描述希望玩家作为旁观者/参与者产生的情感共鸣

【输出模板】字段名固定，值替换为真实内容：
{"emotionIn":"表面平静，实则如履薄冰","emotionOut":"震惊与麻木同时涌上","playerEmotion":"强烈代入感，替角色捏一把汗","tension":7,"internal_lie":"他告诉自己这只是误会，很快会过去","fear":"被最信任的人看穿真实面目"}

字段说明：
- emotionIn：进入节点时角色的外在情绪表现（1-2个词或短句）
- emotionOut：离开节点时情绪（必须与emotionIn有明显变化或深化）
- playerEmotion：希望玩家产生的情感体验（从观看者角度）
- tension：紧张度0-10整数（结合戏剧节拍和情节位置判断）
- internal_lie：角色此刻说服自己相信的谎言，是其行为的深层驱动力
- fear：角色最想回避的心理真相或情境（具体到这个场景）

输出：`,

    'workshop:write_dialogue': (c) => {
      const node = c.node as Record<string, unknown> | undefined
      const effectiveNode = node ?? c
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      type CharData = {name:string;role:string;motivation:string;relationship:string;wound?:string;lie?:string;want?:string;need?:string;voiceProfile?:{speaking_rhythm?:string;vocabulary?:string;defense_mechanism?:string;sample_lines?:string[]}}
      const allCharacters = (c.characters ?? []) as CharData[]
      // 只取当前节点对白里出现的角色，减少无关上下文
      const existingLines = (effectiveNode.dialogue as Array<{speaker:string}> | undefined) ?? []
      const speakersInNode = new Set(existingLines.map(l => l.speaker))
      const characters = speakersInNode.size > 0
        ? allCharacters.filter(ch => speakersInNode.has(ch.name))
        : allCharacters.slice(0, 3)  // 无已有对白时取前3个主要角色

      const dramaticFunction = ((effectiveNode.dramaticFunction ?? (c.dramaticFunction as string)) ?? '') as string
      const nodeChoices = (effectiveNode.choices as Array<{text:string}> | undefined) ?? []
      const variables = (c.variables as Array<{name:string;label:string;description:string}> | undefined) ?? []
      const emotionFn = (effectiveNode.emotionFunction as Record<string,unknown> | undefined) ?? {}

      const charProfiles = characters.map(ch => {
        const lines = [`${ch.name}（${ch.role}）`]
        lines.push(`  · 动机："${ch.motivation ?? '未设定'}"`)
        lines.push(`  · 伤痛（WOUND）："${ch.wound ?? '从角色动机和关系推断'}"——塑造了他/她的一切防御`)
        lines.push(`  · 谎言（LIE）："${ch.lie ?? '从动机推断他对自己或世界的错误信念'}"`)
        lines.push(`  · 想要（WANT）："${ch.want ?? ch.motivation ?? '外部目标'}"——此场景中明确追求的东西`)
        lines.push(`  · 需要（NEED）："${ch.need ?? '内心真正需要但正在抗拒的成长'}"——他不愿承认但真正缺少的`)
        if (ch.voiceProfile) {
          const vp = ch.voiceProfile
          if (vp.speaking_rhythm) lines.push(`  · 说话节奏："${vp.speaking_rhythm}"`)
          if (vp.vocabulary) lines.push(`  · 用词风格："${vp.vocabulary}"`)
          if (vp.defense_mechanism) lines.push(`  · 压力下："${vp.defense_mechanism}"`)
          if (vp.sample_lines?.length) lines.push(`  · 示例台词："${vp.sample_lines[0]}"`)
        }
        return lines.join('\n')
      }).join('\n\n')

      const varContext = variables.length > 0
        ? `\n【叙事变量系统（这些状态正被追踪，对白可以微妙地影响它们）】\n${variables.map(v => `- ${v.label}（${v.name}）：${v.description}`).join('\n')}`
        : ''

      const choiceContext = nodeChoices.length > 0
        ? `\n【此节点后玩家将面临的选择——对白必须为这些选择积蓄张力，让每个选项都显得合理且代价高昂】\n${nodeChoices.map((ch, i) => `${i + 1}. "${ch.text}"`).join('\n')}\n张力构建要求：对白结束时，玩家必须感受到选择每个选项都意味着失去某些东西。`
        : ''

      return `你是Robert McKee级别的编剧，正在为互动影游创作一个关键场景。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【类型/风格】${worldAnchor.genre ?? ''}
【核心主题】${worldAnchor.theme ?? ''}——所有对白都必须在某个层面回应这个主题
【世界规则】${worldAnchor.worldRules ?? ''}${varContext}

【角色心理档案（四维模型）——对白必须从这里生长出来】
${charProfiles}

四维驱动规则：
- 角色的每一句台词都由其WOUND（伤痛）决定防御姿态，由LIE（谎言）决定盲点，由WANT（想要）决定当下行动，由NEED（需要）决定他不愿承认的真相
- 禁止让角色说出超越其LIE认知范围的话——他还没有成长到那一步
- WOUND决定角色如何用语言保护自己：有些人攻击，有些人逃避，有些人讨好

【当前节点】
标题：${effectiveNode.title ?? ''}
类型：${effectiveNode.type ?? ''}（start=开场/normal=推进/branch=选择点/ending=结局/merge=汇聚）
戏剧功能：${dramaticFunction || '未设定'}（setup=建置/conflict=冲突/turn=转折/resolution=解决）
进入情绪：${emotionFn.emotionIn ?? '未设定'}
离开情绪：${emotionFn.emotionOut ?? '未设定'}
内心谎言：${emotionFn.internal_lie ?? '从角色档案推断'}
当前恐惧：${emotionFn.fear ?? '从节点情境推断'}
紧张度目标：${emotionFn.tension ?? 5}/10
创作备注：${effectiveNode.notes ?? ''}${choiceContext}

【McKee对白核心法则——每一条都是铁律】

1. 对白即行动，不是信息传递
   - 每句话都是一个战术行为：角色在用语言做某件事（攻击、转移、诱惑、控制、逃避）
   - 禁止任何角色说出他们真正想说的话——人物永远通过迂回达到目的
   - 每行对白后必须追问："他说这句话是为了对另一个人做什么？"

2. 权力动态（Power Dynamics）——场景的骨架
   - 场景开始时明确谁有权力：掌握信息的人？掌握情感制高点的人？掌握威胁的人？
   - 权力必须在场景中至少转移一次，且转移必须通过具体的一句台词实现
   - 最后一行：权力归属必须与场景开始时不同，或悬而未决

3. 矛盾原则（Contradiction Principle）
   - 每个场景中，至少有一个角色必须说出与自己真实想法相反的话
   - 这种矛盾必须对另一个角色（和玩家）显而易见，制造张力
   - 反转体现在台词本身的表达方式和情绪标注中

4. 声音指纹——两个角色绝不能有相同的说话节奏
   - 权威/控制型：短句，祈使语气，用停顿施压，不给对方反应时间
   - 内疚/压抑型：从句堆叠，主动解释不必要的细节，用"其实"、"只是"软化立场
   - 戒备/聪明型：反问，答非所问，把问题抛回给对方
   - 破碎/受伤型：句子中途停顿，否定自己刚说的，用"没什么"结束情绪爆发
   - 严禁：两个角色的说话方式让读者无法区分谁在说话

5. 冰山定律——表面对话是90%藏在水下的战争
   - 禁止角色直接陈述情绪（"我很害怕"→错误）
   - 情绪通过行为细节体现（"他把合同翻到最后一页，又翻回第一页"→正确）
   - 台词本身必须携带反差信息，说出口的话与真实意图相反或深层矛盾

6. 节奏法则——长短句交替，情绪才有呼吸
   - 禁止连续3句以上相近句长的台词
   - 情绪积累阶段用长句（从句+修饰+停顿词）；情绪爆发或权力转移时用短句（5字以内）
   - 关键情绪转折后必须接一个短句或沉默动作（在sceneDesc中体现为角色的停顿行为）
   - 节奏示例：["这件事我一直想跟你说，但每次开口又觉得时机不对，你知道那种感觉吗。", "知道。", "那你为什么还是——", "够了。"]

7. 场景节奏——压缩·扩展·悬停
   - 开场：压缩时间，快速建立人物位置和场景目的（1-2行）
   - 中段：在情绪高点扩展时间，让每一句都有重量（3-6行）
   - 收尾：留在未解决的情绪时刻，不要给玩家完整的答案

8. 禁用清单（违反即重写）
   - 禁止："你好"/"最近怎么样"/"我明白"/"我知道了"等填充台词
   - 禁止：角色自我介绍式的说明背景信息
   - 禁止：连续两行对白没有任何情势变化
   - 禁止：最后一行台词给出情感闭合（结尾必须留钩）

9. sceneDesc镜头语言——只写摄影机能拍到的
   - 正确："他把手机屏幕朝下放在桌上，等着"
   - 错误："气氛紧张"、"她感到害怕"、"两人陷入沉默"
   - 必须包含：一个能揭示权力关系的空间细节 + 一个角色的微小身体动作

【输出格式】字段名固定，对白6-10行（不能少于6行）：
{"sceneDesc":"摄影机语言，2-3句，只写可见的具体动作和空间细节，揭示权力关系","dialogue":[{"speaker":"角色完整中文名","text":"说出口的台词——是战术行为，不是真实想法","emotion":"外在情绪状态，1-2个词"}]}

输出：`
    },

    'workshop:suggest_choices': (c) => {
      const node = (c.node ?? c) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const characters = ((c.characters ?? []) as Array<{name:string;role:string;motivation:string}>)
      const charList = characters.map(ch => `${ch.name}（${ch.motivation ?? ch.role}）`).join('、')
      return `你是Robert McKee的编剧顾问，正在为互动影游节点设计道德复杂的选择点并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【核心主题】${worldAnchor.theme ?? ''}
【角色】${charList}

【当前节点】
${JSON.stringify(node, null, 2)}

【McKee的"差距"（Gap）原则——这是设计选择的核心】
每个选项都必须在玩家预期与实际结果之间制造一个"差距"：
- 玩家以为选A会得到X，但实际上得到了与X相关却截然不同的Y
- 差距越大，戏剧价值越高，但差距必须符合故事逻辑，不能是随机惩罚
- 最佳选项设计：每个选项看起来都有其合理性，但每个都有真实的代价

【道德复杂性原则——禁止"正确答案"】
- 禁止设计一个明显"正确"和一个明显"错误"的选项
- 每个选项必须代表不同的价值观立场（忠诚vs.真相、安全vs.尊严、个人vs.集体）
- 玩家选任何一个都应该感到"我可能错了"——这才是真正的道德抉择

【dramatic_cost（戏剧代价）】——选择这个选项，角色在情感/关系/自我认知上付出的代价
不是"失去物品"，而是"失去某种自我"或"背叛某个关系"

【thematic_resonance（主题共鸣）】——这个选择如何回应故事的核心主题
必须具体：不是"体现了主题"，而是"通过选择X，玩家亲身体验了'[主题核心问题]'"

【输出模板】字段名固定，2-4个选项：
{"choices":[{"text":"追问真相","consequence":"对方崩溃，说出了连他自己都没准备好说的话","longterm":"获得真相但永久破坏了这段关系，对方不会再信任你","dramatic_cost":"你用真相换取了一段友谊——你必须独自承担知道真相的重量","thematic_resonance":"玩家亲历了'知道真相是否总是值得的'这一主题核心问题"},{"text":"选择保护他，假装不知道","consequence":"他的眼神里有感激，也有一丝怀疑","longterm":"你的沉默成为一种权力，他欠你一个他不知道的人情","dramatic_cost":"你用一个谎言保护了关系，但你无法再以平等的姿态面对他","thematic_resonance":"玩家亲历了'善意的谎言是否是真正的善意'"}]}

要求：text不超过10个字，consequence描述立即发生的情节，longterm描述对后续章节的影响

输出：`
    },

    'workshop:scene_analysis': (c) => {
      const node = (c.node ?? c) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const dialogue = (node.dialogue as Array<{speaker:string;text:string}> | undefined) ?? []
      const dialogueText = dialogue.map((l, i) => `${i + 1}. ${l.speaker}："${l.text}"`).join('\n')
      return `你是一位资深剧本编辑，专门诊断对白的结构性问题。你的任务是对这个互动影游场景做精准的编剧批注并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【核心主题】${worldAnchor.theme ?? ''}

【节点基本信息】
标题：${node.title ?? ''}
类型：${node.type ?? ''}
创作备注：${node.notes ?? ''}
场景描述：${node.sceneDesc ?? '（未填写）'}

【当前对白（共${dialogue.length}行）】
${dialogueText || '（尚无对白）'}

【分析框架】
你需要像Robert McKee审稿一样，找到这段对白中：
1. 真正有效的部分（working）：哪里做到了动作性对白/潜台词/权力动态/声音差异化
2. 具体问题（最多3个，按严重程度排序）：
   - on-the-nose：角色说出了他们真实想法，没有戏剧性迂回
   - throat-clearing：开场填充台词，无信息量
   - 权力平板：整场没有权力转移，关系没有变化
   - 声音趋同：两个角色说话方式无法区分
   - 情感直给：直接陈述情绪而非通过行为体现
   - 无钩收尾：最后一行给出了情感闭合，玩家没有继续的欲望
3. killer_line：一句你建议加入的台词，能立刻提升整场张力——给出具体台词文本和建议插入位置

【输出格式】字段名固定：
{"working":"这段对白中真正有效的部分，具体指出哪行或哪个技巧做得好","issues":[{"line":"有问题的原始台词（引用原文）","problem":"问题类型和具体原因","fix":"具体的重写建议，给出修改后的台词"}],"killer_line":"一句能改变场景能量的建议台词——包含说话者和台词内容，以及建议插在第几行之后"}

注意：如果对白为空或少于3行，working字段写"对白内容不足，无法完整分析"，issues写空数组，killer_line写一句能开场的建议台词。

输出：`
    },

    'workshop:character_voice': (c) => {
      const character = (c.character ?? c) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      return `你是一位角色分析师，请为这个互动影游角色生成详细的"声音指纹"档案。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事背景】${worldAnchor.storyCore ?? ''}
【类型风格】${worldAnchor.genre ?? ''}

【角色信息】
姓名：${character.name ?? ''}
角色定位：${character.role ?? ''}
核心动机：${character.motivation ?? ''}
与主线关系：${character.relationship ?? ''}

【任务】分析这个角色，生成声音指纹档案。从动机和背景推断其说话方式，不要泛泛而谈，要具体到可以直接用于写台词的程度。

【输出格式】字段名固定：
{"speaking_rhythm":"说话节奏描述（快/慢，短句/长句，直接/迂回）","vocabulary":"常用词汇类型和禁用词（如：绝不用感叹词，多用数字和数据）","defense_mechanism":"当压力下的语言防御机制（如：转移话题，反问，沉默）","lie_tells":"说谎时的语言特征（如：过度解释，突然变得礼貌）","sample_lines":["一句展示其声音特征的示例台词","另一句"]}

输出：`
    },

    'workshop:revise_dialogue': (c) => {
      const node = (c.node ?? c) as Record<string, unknown>
      const critique = (c.critique ?? {}) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const characters = ((c.characters ?? []) as Array<{name:string;role:string;wound?:string;lie?:string;want?:string;need?:string}>)
      const currentDialogue = (node.dialogue as Array<{speaker:string;text:string}> | undefined) ?? []
      const critiqueIssues = (critique.issues as Array<{line:string;problem:string;fix:string}> | undefined) ?? []
      const killerLine = (critique.killer_line as string | undefined) ?? ''

      return `你是Robert McKee级别的编剧，正在修订一段问题对白。这是第二稿——你已经看过第一稿和批注，现在要写出真正达到标准的版本。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【主题】${worldAnchor.theme ?? ''}
【角色心理档案】
${characters.map(ch => `${ch.name}：伤痛="${ch.wound ?? '推断'}"，谎言="${ch.lie ?? '推断'}"，想要="${ch.want ?? ch.role}"，需要="${ch.need ?? '推断'}"`).join('\n')}

【当前节点】
标题：${node.title ?? ''}
类型：${node.type ?? ''}
创作备注：${node.notes ?? ''}

【第一稿对白（共${currentDialogue.length}行，问题版本）】
${currentDialogue.map((l, i) => `${i+1}. ${l.speaker}："${l.text}"`).join('\n') || '（空）'}

【编辑批注——必须逐条解决】
${critiqueIssues.map((issue, i) => `${i+1}. 问题台词："${issue.line}" → 问题：${issue.problem} → 修改建议：${issue.fix}`).join('\n') || '（无批注，但对白行数不足，需扩写至6行以上）'}
${killerLine ? `【推荐加入的关键台词】${killerLine}` : ''}

【修订铁律——违者无效】
1. 最终对白必须≥6行（当前${currentDialogue.length}行，不足则扩写）
2. 每行对白都是战术行为，禁止直陈情绪和背景
3. 权力必须在场景中转移至少一次
4. 至少一个角色说出与真实想法相反的话
5. 两个角色的说话节奏和用词必须可区分
6. 最后一行不能给出情感闭合，必须留钩
7. sceneDesc只写摄影机可见的动作和空间细节，不少于80字符

【输出格式】与原始write_dialogue完全相同：
{"sceneDesc":"摄影机语言，2-3句，只写可见的具体动作和空间细节，揭示权力关系，不少于80字符","dialogue":[{"speaker":"角色完整中文名","text":"说出口的台词——是战术行为","emotion":"外在情绪状态"}]}

输出：`
    },

    'validate:director_review': (c) => {
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const characters = ((c.characters ?? []) as Array<{name:string;role:string;wound?:string;lie?:string;want?:string;need?:string;motivation?:string}>)
      const nodes = ((c.nodes ?? []) as Array<{id:string;title:string;type:string;dialogue?:Array<{speaker:string;text:string}>;emotionFunction?:{tension?:number;internal_lie?:string};sceneDesc?:string}>)
      const endings = ((c.endings ?? []) as Array<{title:string;type:string;description?:string}>)

      // Send key nodes in full: all branch + ending nodes; others summarized
      const nodesWithMeta = nodes as Array<typeof nodes[0] & { fakeBranch?: boolean; choiceTargets?: string[] }>
      const keyNodes = nodesWithMeta.filter(n => n.type === 'branch' || n.type === 'ending')
      const fakeBranches = nodesWithMeta.filter(n => n.fakeBranch)
      const nodeStats = {
        total: nodes.length,
        branches: nodes.filter(n => n.type === 'branch').length,
        fakeBranches: fakeBranches.length,
        avgDialogue: nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + (n.dialogue?.length ?? 0), 0) / nodes.length * 10) / 10 : 0,
        thinNodes: nodes.filter(n => !n.dialogue || n.dialogue.length < 6).length,
        avgTension: nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + (n.emotionFunction?.tension ?? 0), 0) / nodes.length * 10) / 10 : 0,
      }

      return `你是一个由五位顶级专家组成的创作终审委员会，正在为一部互动影游项目出具绿灯评审报告并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【项目信息】
故事核：${worldAnchor.storyCore ?? ''}
主题：${worldAnchor.theme ?? ''}
类型：${worldAnchor.genre ?? ''}
预计时长：${worldAnchor.durationMinutes ?? 0}分钟
结局数量：${worldAnchor.endingCount ?? endings.length}

【角色档案（McKee四维）】
${characters.map(ch => `${ch.name}（${ch.role}）：动机="${ch.motivation ?? ''}"，伤痛="${ch.wound ?? '未设定'}"，谎言="${ch.lie ?? '未设定'}"，想要="${ch.want ?? ''}"，需要="${ch.need ?? ''}"`).join('\n')}

【结局】
${endings.map(e => `[${e.type}] ${e.title}：${e.description ?? ''}`).join('\n') || '未设定'}

【关键节点（分支+结局）对白样本】
${keyNodes.slice(0, 8).map(n => `--- ${n.title}（${n.type}，tension=${n.emotionFunction?.tension ?? '?'}）---\n${(n.dialogue ?? []).slice(0, 4).map(d => `${d.speaker}："${d.text}"`).join('\n') || '（无对白）'}`).join('\n\n')}

【项目数据统计】
总节点：${nodeStats.total} | 分支节点：${nodeStats.branches} | 假分支（所有选项指向同一节点）：${nodeStats.fakeBranches} | 平均对白行数：${nodeStats.avgDialogue} | 内容稀薄节点：${nodeStats.thinNodes} | 平均紧张度：${nodeStats.avgTension}
${fakeBranches.length > 0 ? `\n【警告：假分支列表】\n${fakeBranches.map(n => `- "${n.title}"：所有选项都导向同一节点，玩家选择无实际差异`).join('\n')}` : ''}

【六位评审委员】——每位从自己的核心标准出发，给出0-10分、一个具体观察（必须引用具体节点标题或幕名）、一条可执行的改进建议

1. **斯皮尔伯格（情感冲击力）**：这个故事会让观众哭吗？主角的旅程是否有内在弧度？最关键的情感时刻是否成立？打分依据：情感真实性、角色可共情度、结局的情感落点

2. **麦基（结构完整性）**：三幕结构是否成立？中点大反转是否存在？最终选择是否是全片最难的道德抉择？打分依据：故事脊柱强度、张力节奏、选择的戏剧代价

3. **乔布斯（产品体验）**：玩家是否感到自己在做真实有意义的选择？UI/UX是否优雅到让人感到惊喜？有没有"one more thing"时刻——一个让一切重新被理解的反转？打分依据：选择的感知权重、体验的流畅性、惊喜感

4. **角色心理学家（角色深度）**：每个角色的行为是否与其伤痛/谎言/需要保持一致？角色之间的关系张力是否来自真实的心理冲突？打分依据：角色弧度一致性、心理真实性、关系动态

5. **首席观众·第一轮（可重玩性）**：看完第一遍后，是否想立刻重玩做不同选择？不同结局是否真的展现了不同的人生观？打分依据：分支差异度、结局情感分量、"如果当时选了另一条路"的吸引力。评分时必须考察：选择路径是否会导致实质不同的剧情体验，还是只有对白微调？

6. **发行总监（可重玩价值）**：从商业角度评估项目能否驱动玩家多次游玩并传播。打分依据：每条主要路径是否提供足够差异化的情感体验和信息；是否存在"隐藏内容"驱动探索欲；首通与二周目的体验落差是否足以形成口碑传播；玩家是否会因"好奇另一个结局"而自发分享

【输出模板】字段名固定：
{"verdicts":[{"lens":"斯皮尔伯格·情感冲击力","score":7,"observation":"主角在第二幕核心情感时刻（节点'抉择之夜'）写得扎实，但结局节点'告别'的情感落点过于仓促，没有给玩家足够的时间停留在那个重量里","note":"为结局节点'告别'增加至少2行对白用于情感沉淀，让玩家在关闭游戏前能喘一口气"},{"lens":"麦基·结构完整性","score":8,"observation":"三幕节拍清晰，第二章第二幕的中点反转设计合理，但最终分支节点'最后的门'只有3个选项，未能达到'全片最难选择'的标准","note":"为第三章第三幕的最终分支增加第4个选项，代表角色妥协自我价值的路径，让这个时刻真正难以抉择"},{"lens":"乔布斯·产品体验","score":6,"observation":"选择设计有重量感，但第一章至第二章的全程缺少一个信息反转时刻——玩家在整个过程中没有被意外击中过","note":"在第二章第一幕加入一个探索节点，揭示一个重新解读前两章所有事件的隐藏信息"},{"lens":"角色心理学家·角色深度","score":7,"observation":"主角的伤痛和谎言设定得很好，但在第二章第二幕的分支节点'信任测试'上，角色的选择没有体现其'谎言'在起作用","note":"在分支节点'信任测试'的选项consequence中标注哪个选项是角色在用谎言保护自己，让玩家感受到心理防御机制"},{"lens":"首席观众·可重玩性","score":6,"observation":"4个结局类型有差异，但情感基调相近——3个结局都是'沉重'，没有一个让人感到解脱或轻盈","note":"为至少1个结局加入真正的情感对比：不是'好结局'，而是一个让人感到'尽管失去了一切，但值得'的结局"},{"lens":"发行总监·可重玩价值","score":5,"observation":"两条主要路径在第二章之后实质趋同，玩家在二周目会发现超过60%的内容与首通相同，缺乏足够的差异化驱动力","note":"为两条主路径各设计至少一个专属场景，确保二周目有新内容奖励好奇心；在explore节点中埋入只有特定路径玩家才能解读的隐藏线索"}],"overallScore":7,"greenlit":false,"executiveSummary":"项目有清晰的道德主题和扎实的结构基础，角色设定有深度。核心问题是内容密度不足（平均对白远低于McKee标准）和缺少能改变玩家认知的信息反转时刻，且二周目体验差异化不足。修复这两个问题后建议绿灯。","mustFix":["第二章第三幕节点'告白'：平均对白行数不足6行，需在Workshop批量精修","第三章第一幕：缺少信息反转类探索节点，需新增一个能重新解读前情的发现","第二章第二幕分支节点'信任测试'：mustFix——两条选择路径在第三章的后续情节实质相同，必须为每条路径设计专属结果节点"],"standout_moment":"第二章第二幕节点'信任测试'中，若玩家选择保护对方，对方说出'你知道我最怕什么吗——就是有一天发现，一直保护我的人，其实才是我该害怕的'——这句台词同时完成了权力反转、伏笔揭示和主题回应，是全剧目前最精彩的单一时刻"}

输出：`
    },

    'workshop:scene_tension': (c) => {
      const node = (c.node ?? c) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const characters = ((c.characters ?? []) as Array<{name:string;role:string;motivation:string;wound?:string;lie?:string;want?:string;need?:string}>)
      const charSummary = characters.map(ch => `${ch.name}（${ch.role}）：想要="${ch.want ?? ch.motivation}"，需要="${ch.need ?? '未设定'}"，伤痛="${ch.wound ?? '未设定'}"，谎言="${ch.lie ?? '未设定'}"`).join('\n')
      const dialogue = (node.dialogue as Array<{speaker:string;text:string}> | undefined) ?? []
      const dialogueText = dialogue.map((l, i) => `${i + 1}. ${l.speaker}："${l.text}"`).join('\n')

      return `你是一位资深戏剧顾问，专门诊断场景张力不足的结构性原因并给出具体重写建议，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块（不要写\`\`\`json），字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【核心主题】${worldAnchor.theme ?? ''}
【类型风格】${worldAnchor.genre ?? ''}

【角色档案】
${charSummary || '（未设定）'}

【当前节点】
标题：${node.title ?? ''}
类型：${node.type ?? ''}
戏剧功能：${(node as Record<string,unknown>).dramaticFunction ?? '未设定'}
紧张度：${(node.emotionFunction as Record<string,unknown> | undefined)?.tension ?? '未设定'}/10
场景描述：${node.sceneDesc ?? '（未填写）'}
创作备注：${node.notes ?? ''}

【当前对白（共${dialogue.length}行）】
${dialogueText || '（尚无对白）'}

【诊断框架——按此顺序分析】
1. tension_diagnosis：这个场景的张力来源是什么？是外部冲突（争论/对立）、内部冲突（角色的内心撕裂）、信息不对等（一方知道对方不知道的事），还是什么都没有？
2. missing_element：四大戏剧引擎（冲突/悬念/反转/代价）中，哪个最缺失？冲突=两力对抗；悬念=玩家知道危险但角色不知道；反转=对玩家/角色认知的颠覆；代价=角色必须付出某种损失才能前进
3. rewrite_suggestion：至少100字的具体建议——不是原则重述，而是告诉编剧这个场景应该发生什么、加什么台词、删什么内容、节奏如何调整
4. upgraded_line：一句能立刻提升场景张力的关键台词，格式："[说话人]：'台词内容'"——这句话必须包含潜台词，让场景能量突变
5. mcguffin：这个场景的MacGuffin——驱动角色欲望的具体对象/信息/目标（可以是一个物品、一个秘密、一个承诺、一句话）。如果场景没有MacGuffin，这是张力为零的根本原因
6. dramatic_irony：场景中是否存在戏剧性反讽（玩家知道某件事但场景中的角色不知道）？如有，如何放大这种反讽？如无，给出一个可以引入戏剧反讽的具体方案

【输出格式】字段名固定：
{"tension_diagnosis":"场景当前张力来源，1-2句，要具体到来自哪种戏剧机制","missing_element":"缺少什么关键戏剧元素（冲突/悬念/反转/代价），说明为何缺失以及缺失的后果","rewrite_suggestion":"至少100字的具体重写建议，包含：需要发生什么新事件、推荐删除什么、节奏调整方向、人物行为应如何变化","upgraded_line":"推荐一句能提升张力的关键台词，格式：说话人：'台词'——这句话本身就是一个戏剧动作","mcguffin":"这个场景的MacGuffin是什么——驱动欲望的具体对象/信息/目标；若不存在则描述应引入什么","dramatic_irony":"是否存在戏剧性反讽？具体描述反讽内容，以及如何通过对白或场景设计放大这种信息不对等"}

输出：`
    },

    'workshop:choice_consequence': (c) => {
      const choice = (c.choice ?? {}) as Record<string, unknown>
      const currentNode = (c.currentNode ?? {}) as Record<string, unknown>
      const worldAnchor = (c.worldAnchor ?? {}) as Record<string, unknown>
      const characters = ((c.characters ?? []) as Array<{name:string;role:string;wound?:string;want?:string;need?:string;motivation?:string}>)
      const nodes = ((c.nodes ?? []) as Array<{id:string;title:string;type:string;notes?:string}>)
      const charSummary = characters.map(ch => `${ch.name}（${ch.role}）：动机="${ch.motivation ?? ''}"，想要="${ch.want ?? ''}"，需要="${ch.need ?? ''}"，伤痛="${ch.wound ?? '未设定'}"`).join('\n')
      const nodeList = nodes.map(n => `[${n.type}] id="${n.id}" title="${n.title}"${n.notes ? `：${n.notes}` : ''}`).join('\n')

      return `你是一位互动叙事设计顾问，专门分析玩家选择在叙事层面的涟漪效应，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块（不要写\`\`\`json），字段名必须与模板完全一致。

【故事核】${worldAnchor.storyCore ?? ''}
【核心主题】${worldAnchor.theme ?? ''}

【角色档案】
${charSummary || '（未设定）'}

【当前节点】
标题：${currentNode.title ?? ''}
类型：${currentNode.type ?? ''}
创作备注：${currentNode.notes ?? ''}

【被分析的选择】
选项文字：${choice.text ?? ''}
条件：${choice.conditions ?? '无'}
变量效果：${choice.variableEffects ?? '无'}
重量标记：${choice.choiceWeight ?? '未设定'}
已设定的后果：${choice.consequence ?? '（未填写）'}

【后续可能节点列表】
${nodeList || '（未提供）'}

【分析框架——从六个维度推演这个选择的完整影响】

1. immediate（立即后果）：玩家做出这个选择，进入下一个场景时，最显著的变化是什么？包括：角色的外在状态变化、关键人物的反应、场景环境的改变

2. chapter_impact（本章内累积影响）：在本章剩余节点中，这个选择会如何持续发酵？考虑：某段关系的信任度变化、某个信息被知道或隐藏、某条路径被永久关闭或开启

3. ending_probability（结局概率影响）：这个选择如何改变各结局的可能性？用+/-描述，例如："好结局+15%，悲剧结局-20%，隐藏结局+5%（需配合后续特定选择）"

4. character_cost（角色代价）：做出这个选择，角色在心理或关系层面付出什么代价？不是"失去物品"，而是"失去某种自我认知"或"背叛某种关系中的隐性承诺"。这个代价应当与角色的WOUND和LIE产生共鸣

5. thematic_resonance（主题呼应）：这个选择如何与核心主题形成呼应或对比？具体描述：玩家通过这个选择，亲身体验了主题的哪个层面？是在印证主题、挑战主题，还是揭示主题的悖论？

6. regret_factor（后悔系数）与regret_reason（后悔原因）：regret_factor只能是"高"、"中"或"低"。regret_reason：玩家在看到后续发展后，最可能后悔这个选择的理由是什么？好的设计让玩家后悔，但也理解为什么当时选了它

【输出格式】字段名固定：
{"immediate":"立即进入下一场景时的具体变化，1-3句，涵盖角色状态/人物反应/环境变化","chapter_impact":"本章内会持续累积的影响：关系变化、信息泄露或隐藏、机会窗口的开启或关闭","ending_probability":"对各结局可能性的影响，用+/-百分比描述，注明需要配合什么条件","character_cost":"角色的心理代价或关系代价——与其WOUND/LIE深度绑定，不是物质损失","thematic_resonance":"这个选择如何与主题形成呼应或对比，玩家通过它亲历了主题的哪个维度","regret_factor":"高或中或低","regret_reason":"玩家事后最可能后悔的原因——要让玩家理解当时为何选它，又理解为何事后遗憾"}

输出：`
    },

    'validate:report': (c) => `你收到互动影游校验报告，需要从结构和叙事两个维度生成改进建议并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【校验数据】
${JSON.stringify(c, null, 2)}

【分析维度】
1. 结构问题：死路节点、断链、不可达节点（对应 error/warning 级别问题）
2. 叙事问题：情感节奏单调（EMOTION_MONOTONE）、选项重复（DUPLICATE_CHOICE）、结局单一（SINGLE_ENDING）
3. 可重玩性：分支密度、结局差异化程度
4. 角色一致性：关键角色是否在主要路径都有出场机会

【输出模板】字段名固定，值替换为针对此校验数据的真实建议：
{"summary":"整体结构基本完整，但存在若干死路节点需要优先修复，情感节奏偏紧张，缺少呼吸节点。","priority_issues":["节点X缺少出口，玩家将卡死","连续5个节点tension均≥7，观众将产生悬疑疲劳"],"suggestions":["在第二章增加至少一个merge节点以汇聚多条故事线","在第一章插入1个温情/轻松场景作为情感对比点","为结局节点增加差异化的情感基调"]}

输出：`,
  }

  const fn = templates[key]
  if (fn) return fn(ctx)
  return `请根据以下数据给出建议：\n${JSON.stringify(ctx, null, 2)}`
}
