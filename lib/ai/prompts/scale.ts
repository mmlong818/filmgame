import type { PromptContext } from './shared'

export const scalePrompts: Record<string, (c: PromptContext) => string> = {

    'scale:generate': (c) => `你收到一份互动影游世界设定，需要生成三套规模方案并输出JSON。
禁止输出JSON以外的任何内容，禁止Markdown代码块，字段名必须与模板完全一致。

【世界设定输入】
${JSON.stringify(c, null, 2)}

【规模方案硬性约束——分支网络结构规范（FR-18）】
- 每幕节点数（totalNodes ÷ (chapterCount × actCountPerChapter)）不得低于4（入口+branch+2路径的最小骨架）
- 体量小的方案（如精简版）要通过减少chapterCount或actCountPerChapter降低总量，禁止靠压低"每幕节点数"到4以下来凑小体量——这是v0.6精简版退化为单线的根源
- 每套方案需给出branchCount：该方案预估的branch类型节点数（中段菱形分支/章内平行路线的branch节点+终章门控），用于对比表展示分支密度，必须随规模递增

【输出模板】字段名固定，值替换为根据世界设定推算的真实数字和内容：
{"plans":[{"id":"plan_a","label":"精简版","chapterCount":2,"actCountPerChapter":2,"totalNodes":16,"totalBranches":6,"branchCount":4,"estimatedHours":60,"aiRationale":"适合首次尝试，低成本快速验证","chapters":[{"title":"第一章：开端","brief":"主角登场，核心矛盾浮现"},{"title":"第二章：终局","brief":"矛盾爆发，走向结局"}]},{"id":"plan_b","label":"标准版","chapterCount":3,"actCountPerChapter":3,"totalNodes":40,"totalBranches":12,"branchCount":9,"estimatedHours":110,"aiRationale":"推荐方案，结构完整，复杂度适中","chapters":[{"title":"第一章：引入","brief":"世界建立，角色登场"},{"title":"第二章：对抗","brief":"矛盾激化，选择分叉"},{"title":"第三章：结局","brief":"多线收束，命运揭晓"}]},{"id":"plan_c","label":"史诗版","chapterCount":5,"actCountPerChapter":4,"totalNodes":90,"totalBranches":28,"branchCount":20,"estimatedHours":240,"aiRationale":"高复杂度，适合有经验的团队","chapters":[{"title":"第一章：序章","brief":"铺垫伏笔"},{"title":"第二章：上升","brief":"矛盾扩大"},{"title":"第三章：转折","brief":"核心反转"},{"title":"第四章：高潮","brief":"全面对决"},{"title":"第五章：尾声","brief":"多结局展开"}]}]}

注意：三套方案的章数（chapterCount）、幕数（actCountPerChapter）、节点数（totalNodes）必须随规模递增，且每套方案totalNodes ÷ (chapterCount × actCountPerChapter) ≥ 4；chapters数组长度必须等于chapterCount；章节标题和brief要贴合输入的故事设定。

输出：`,
}
