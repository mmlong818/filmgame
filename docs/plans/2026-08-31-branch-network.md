# 实施计划：分支网络结构规范 + 定向重构（2026-08-31）

对应需求：`docs/requirements.md` FR-18 / FR-19（v0.7 立项）。
背景：真实检查第 1 轮（`E:/CC/tasks/real-check/filmgame-2026-08-31-r1/report.md`）确认——
精简版生成产出"单线 + 终章扇出"结构（18 节点仅 1 分支，路径差异化 0%），
根源在 `lib/ai/prompts.ts` buildActNodes 的幕预算规则（预算 <3 时退化为纯推进节点）；
且诊断链（路径分析/校验/终审）完备但修复回路靠人工。

分支：`feat/cockpit-redesign` 续作。数据层不动；改动集中在 `lib/ai/`（prompts/schemas）、
structure/validate 两页与 `lib/validation` 只读消费。

## 阶段 A · 分支网络规范（FR-18）

### A1 骨架模板重写（lib/ai/prompts.ts · buildActNodes）
- [ ] 幕预算下限提升为 4（入口 + branch + 2 路径）；当规模方案给的幕预算 <4 时，
      **跨幕合并**：本章内相邻两幕合并预算，保证每章至少产出一个完整菱形分支（branch → 2-3 路径 → merge）
- [ ] 结构模式选择器：首章/中章默认「菱形分支-汇合」；节点预算充裕（≥8/幕）时可用「章内平行路线」
      （branch 后两条路径各自推进 2+ 节点再汇合）；终章保留「变量门控扇出」
- [ ] 每章预算允许（幕预算 ≥6）时插入 1 个 explore 节点（带 exploreReturnNodeId 语义占位）
- [ ] 修正 merge 矛盾：骨架继续使用 merge 节点（汇合是网络的必要件），
      删除 prompt 规则文本中"严禁 merge/不再使用 merge"两处（360/367 行），
      并确认校验引擎与预览对 merge 类型的现有支持（NODE_TYPES 已含 merge）
- [ ] 中段 branch 骨架 notes 强制：每个选项写 variableEffects；至少一个无条件保底选项

### A2 规模方案联动（prompts.ts · scale:generate）
- [ ] 方案生成约束：每幕节点数 ≥4；体量小时减少幕数而非压低幕预算
- [ ] 方案卡与对比表增加「分支节点数」预估字段（schemas.ts 的 scale schema 加字段，
      scale 页对比表展示）

### A3 分支拓扑联动（prompts.ts · branches:generate）
- [ ] 中段 branch 的 conditions 规则：至少一个选项无条件（保底出口）；
      带条件选项的变量阈值必须 ≤ 该点位之前理论可达上界（把校验 UNSATISFIABLE 的规则写进生成约束）
- [ ] 菱形路径的 variableEffects 差异化：不同路径写不同变量（供终章门控区分）

### A4 生成后自检
- [ ] 结构应用（通过）后前端自动跑一次本地校验引擎（纯本地免费），
      在结构页辅助区显示「分支密度 / GATED / 不可达」三项速报，超标即时可见
      （复用现有 structWarnings 展示管道）

## 阶段 B · 定向重构（FR-19）

### B1 动作注册（lib/ai/schemas.ts + prompts.ts）
- [ ] `structure:targeted_fix` 入 SCHEMA_REGISTRY：
      输入 context = 结构摘要（章/幕/节点/选项/变量）+ 校验 issues + directorReview.mustFix；
      输出 schema = 补丁操作数组：
      `{ ops: [{ op: 'add_node'|'update_node'|'add_choice'|'update_choice'|'set_explore_return'|'bind_ending', ... , reason: string }] }`
      每个 op 带 reason（对应哪条 issue/note）
- [ ] prompt 约束：不得删除已有对白/场景内容；新增节点 notes 写明剧情意图；
      优先解决 error 级 issue，其次 mustFix，再 warning

### B2 补丁应用层（app/project/[id]/structure/）
- [ ] 新文件 `targetedFix.ts`：补丁校验（目标节点存在、连接合法、id 生成）与应用
      （组装新 chapters/acts/nodes 后走 bulkSetStructure——撤销快照已自动挂载）
- [ ] 补丁预览 UI（复用 branch_preview 的呈现模式）：逐 op 一行（操作 + 目标 + reason），
      支持逐项勾选采纳，「应用所选」→ bulkSetStructure
- [ ] 应用后自动重跑本地校验，辅助区显示「通过率 X% → Y%」前后对比

### B3 入口
- [ ] 结构页辅助区「AI 协作」新增「按校验结果定向重构」（无 lastValidation 时先引导跑校验）
- [ ] 校验页问题清单头部加跳转链接「→ 去结构页定向重构」

## 验收基准

- `pnpm tsc --noEmit` 零错误、`pnpm build` 成功
- 新建项目选精简版真跑生成：每章含中段分支+汇合；全片分支密度 ≥25%；
  校验无 ALL_CHOICES_GATED / UNSATISFIABLE；分支路径分析页差异化 >0%
- 对带 issues 的项目跑定向重构：预览-勾选-应用后 issues 数下降、通过率上升、
  已填对白未丢失、⌘Z 可整体回滚
- 真实检查回归：重跑 checklist 第 5 节 + 8.1（新结构可玩性走查）
