import type { PromptContext } from './shared'

export const validatePrompts: Record<string, (c: PromptContext) => string> = {

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

【五位评审委员】——每位从自己的核心标准出发，给出0-10分、一个具体观察（必须引用具体节点标题或幕名）、一条可执行的改进建议。verdicts 数组必须恰好5项，与下列五位一一对应

1. **斯皮尔伯格（情感冲击力）**：这个故事会让观众哭吗？主角的旅程是否有内在弧度？最关键的情感时刻是否成立？打分依据：情感真实性、角色可共情度、结局的情感落点

2. **麦基（结构完整性）**：三幕结构是否成立？中点大反转是否存在？最终选择是否是全片最难的道德抉择？打分依据：故事脊柱强度、张力节奏、选择的戏剧代价

3. **乔布斯（产品体验）**：玩家是否感到自己在做真实有意义的选择？UI/UX是否优雅到让人感到惊喜？有没有"one more thing"时刻——一个让一切重新被理解的反转？打分依据：选择的感知权重、体验的流畅性、惊喜感

4. **角色心理学家（角色深度）**：每个角色的行为是否与其伤痛/谎言/需要保持一致？角色之间的关系张力是否来自真实的心理冲突？打分依据：角色弧度一致性、心理真实性、关系动态

5. **首席观众（可重玩性与传播价值）**：看完第一遍后，是否想立刻重玩做不同选择？不同结局是否真的展现了不同的人生观？打分依据：分支差异度、结局情感分量、"如果当时选了另一条路"的吸引力。评分时必须考察：选择路径是否会导致实质不同的剧情体验，还是只有对白微调；首通与二周目的体验落差是否足以形成口碑传播；是否存在"隐藏内容"驱动探索欲

【输出模板】字段名固定：
{"verdicts":[{"lens":"斯皮尔伯格·情感冲击力","score":7,"observation":"主角在第二幕核心情感时刻（节点'抉择之夜'）写得扎实，但结局节点'告别'的情感落点过于仓促，没有给玩家足够的时间停留在那个重量里","note":"为结局节点'告别'增加至少2行对白用于情感沉淀，让玩家在关闭游戏前能喘一口气"},{"lens":"麦基·结构完整性","score":8,"observation":"三幕节拍清晰，第二章第二幕的中点反转设计合理，但最终分支节点'最后的门'只有3个选项，未能达到'全片最难选择'的标准","note":"为第三章第三幕的最终分支增加第4个选项，代表角色妥协自我价值的路径，让这个时刻真正难以抉择"},{"lens":"乔布斯·产品体验","score":6,"observation":"选择设计有重量感，但第一章至第二章的全程缺少一个信息反转时刻——玩家在整个过程中没有被意外击中过","note":"在第二章第一幕加入一个探索节点，揭示一个重新解读前两章所有事件的隐藏信息"},{"lens":"角色心理学家·角色深度","score":7,"observation":"主角的伤痛和谎言设定得很好，但在第二章第二幕的分支节点'信任测试'上，角色的选择没有体现其'谎言'在起作用","note":"在分支节点'信任测试'的选项consequence中标注哪个选项是角色在用谎言保护自己，让玩家感受到心理防御机制"},{"lens":"首席观众·可重玩性与传播","score":6,"observation":"4个结局类型有差异，但情感基调相近——3个结局都是'沉重'，没有一个让人感到解脱或轻盈；且两条主要路径在第二章之后实质趋同，二周目缺乏差异化驱动力","note":"为至少1个结局加入真正的情感对比，并为两条主路径各设计至少一个专属场景，让二周目有新内容奖励好奇心"}],"overallScore":7,"greenlit":false,"executiveSummary":"项目有清晰的道德主题和扎实的结构基础，角色设定有深度。核心问题是内容密度不足（平均对白远低于McKee标准）和缺少能改变玩家认知的信息反转时刻，且二周目体验差异化不足。修复这两个问题后建议绿灯。","mustFix":["第二章第三幕节点'告白'：平均对白行数不足6行，需在Workshop批量精修","第三章第一幕：缺少信息反转类探索节点，需新增一个能重新解读前情的发现","第二章第二幕分支节点'信任测试'：mustFix——两条选择路径在第三章的后续情节实质相同，必须为每条路径设计专属结果节点"],"standout_moment":"第二章第二幕节点'信任测试'中，若玩家选择保护对方，对方说出'你知道我最怕什么吗——就是有一天发现，一直保护我的人，其实才是我该害怕的'——这句台词同时完成了权力反转、伏笔揭示和主题回应，是全剧目前最精彩的单一时刻"}

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
