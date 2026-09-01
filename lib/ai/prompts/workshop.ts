import type { PromptContext } from './shared'

export const workshopPrompts: Record<string, (c: PromptContext) => string> = {

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
      // 工坊单节点"AI 修改对白"手动指令（不经过 scene_analysis 批注时使用）
      const instruction = (c.instruction as string | undefined) ?? ''

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
${instruction ? `【用户修改指令——最高优先级，必须遵照执行】${instruction}\n` : ''}${critiqueIssues.map((issue, i) => `${i+1}. 问题台词："${issue.line}" → 问题：${issue.problem} → 修改建议：${issue.fix}`).join('\n') || (instruction ? '（无编辑批注，请严格按用户指令修改，同时遵守下方修订铁律）' : '（无批注，但对白行数不足，需扩写至6行以上）')}
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
}
