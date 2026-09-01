import type { PromptContext } from './shared'

export const worldPrompts: Record<string, (c: PromptContext) => string> = {

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
{"consistency":"通过","structure_analysis":"对故事核张力结构的分析，指出欲望和阻碍是否明确","interactive_potential":"高","issues":[],"duration_match":"匹配","overall":"综合评价，1-2句"}

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
      const endings = (wa.endingsDesign as Array<{title:string,type:string,triggerCondition:string,avoidCondition:string,keyVariable?:string}> | undefined) ?? []
      const chars = (c.characters ?? []) as Array<{name:string,role:string}>
      const endingsSummary = endings.map((e, i) => `结局${i+1}「${e.title}」(${e.type})：达成条件=${e.triggerCondition}${e.keyVariable ? `；关键变量=${e.keyVariable}` : ''}`).join('\n')
      const charSummary = chars.map(ch => `${ch.name}(${ch.role})`).join('、')
      return `你是互动影游系统设计师。根据故事设定和结局条件，提取出游戏需要追踪的叙事变量，输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【故事类型】${wa.genre ?? ''}
【故事核】${wa.storyCore ?? ''}
【世界规则】${wa.worldRules ?? ''}
【角色】${charSummary || '暂无（请根据故事类型推断需要哪些关系变量）'}

【结局设计】
${endingsSummary || '暂无——请根据故事类型自行设计3-5个有意义的追踪变量（如关系好感度、道德倾向、关键标记等）'}

【变量机制约定——全部变量共用同一套小整数量表，禁止百分比】
玩家每做一次相关选择，变量以整数增量（通常+1，少数+2）累积，全程关键选择次数有限，变量现实上限约为0-10，不是0-100的百分比进度条。
- counter：整数累加，defaultValue通常为"0"，现实量程0~10（如好感度、道德值）
- flag：0或1的开关（如是否完成了某件事、是否发现了秘密）
- relationship：关系值，量程约-5到+5，负为敌对，正为亲密
- item：是否持有某物品/信息

【要求】从结局条件提取变量名（如"affection_A>=3"→变量affection_A）；每个变量名用英文下划线命名；给出type/defaultValue/description；共3-6个变量
若某结局标注了"关键变量"（如"勇气值>=4"），必须原样提取该变量名对应的英文下划线命名并生成对应变量（如"勇气值"→courage），不得另造无关新变量名，确保每个结局的关键变量都能在输出的变量列表中找到对应项。结局给出的阈值应落在0-10整数量表内（建议3-6），若结局阈值明显是百分比或超出该量表，仍按原变量名生成变量，但description中注明"阈值需在应用层按0-10量表校准"。

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

【变量机制约定——keyVariable的阈值必须遵守，禁止使用百分比】
本游戏的叙事变量不是百分比进度条，而是小整数计数器：玩家每做一次相关选择，变量通常以+1的整数增量累积（少数情况+2），全程关键选择次数有限，变量现实上限约为0-10。
因此keyVariable的阈值必须是与"+1累积"机制匹配的小整数，建议范围3-6（例如"courage>=4"），禁止写成百分比（如"80%"、"100%"）或不成比例的大数字（如">=80"）。

【设计要求】
- 每个结局必须代表主题的不同维度（救赎/毁灭/妥协/真相…）
- 结局之间的达成路径要互斥——选择不同的关键节点才能到达
- triggerCondition：玩家需要做什么关键选择才能走向此结局（具体行为，非抽象描述）
- avoidCondition：哪类选择会导致偏离此结局走向其他结局
- keyVariable：如果有变量追踪（如信任度、勇气值），写出关键变量名和阈值（遵守上面的0-10整数量表，阈值3-6），否则留空

【输出模板（共${count}个结局）】
{"endings":[{"id":"e1","title":"结局标题","type":"good","description":"此结局中玩家经历的最终命运，1-2句","triggerCondition":"达成此结局需要做的关键选择（具体）","avoidCondition":"哪些选择会让玩家偏离此结局","keyVariable":"courage>=4（0-10整数量表，阈值3-6；无变量追踪则留空）"},{"id":"e2","title":"结局标题","type":"bad","description":"...","triggerCondition":"...","avoidCondition":"...","keyVariable":""},{"id":"e3","title":"结局标题","type":"neutral","description":"...","triggerCondition":"...","avoidCondition":"...","keyVariable":""}]}

type只能是：good、bad、neutral、secret之一。secret结局需要特别隐蔽的条件。

输出：`
    },
}
