# 猫叔的互动影游创作系统 — 产品需求文档

| 项 | 内容 |
|----|------|
| 文档版本 | 1.1（新增 FR-15/16/17、NFR-5，对应「驾驶舱 × 编剧房间」升级，实施计划见 `docs/plans/2026-08-30-cockpit-redesign.md`） |
| 对应产品版本 | v0.6.0 |
| 日期 | 2026-08-30 |
| 性质 | 基线需求文档：由 v0.5.0 已实现功能反推整理，作为后续迭代的需求基准 |
| 事实来源 | 代码实现（`lib/`、`app/`）优先于本文档；发现冲突时以代码为准并回改本文档 |

---

## 1. 产品概述

### 1.1 定位

面向**编剧和互动叙事设计师**的 AI 辅助创作工具：从一句故事核心出发，经过 5 个阶段的结构化流程，产出可交付的互动影游剧本（含分支结构、变量系统、多结局、逐节点对白）。

### 1.2 核心理念

- **AI 全程协作，编剧主导创意**：AI 承担生成、审查、精修等重复劳动，创作者对每一步产出保有确认、修改、否决权。
- **流程化拆解**：把互动影游创作拆为「世界锚点 → 规模规划 → 结构与分支 → 场景工坊 → 全局校验」5 个阶段，每阶段有独立页面、独立 AI 能力和明确的完成标准。
- **自用优先**：单密码认证、本地部署为主力形态，不做多租户和注册体系。

### 1.3 目标用户

| 用户 | 场景 |
|------|------|
| 编剧 / 互动叙事设计师 | 独立完成一部互动影游剧本的全流程创作 |
| 内容团队原型验证者 | 快速搭建可玩原型（预览播放）验证叙事结构 |

---

## 2. 范围

### 2.1 范围内

- 5 阶段创作工作流及阶段门控
- 多 provider AI 集成（含无 API Key 的 Claude CLI 本地模式）
- 项目级 AI 双模式（快速 / 思考）
- 结构生成的节点级流式进度
- 交互式预览播放（含变量状态回滚）
- 全局校验引擎 + 五位专家导演终审
- JSON / ink 格式导出
- Postgres 单一数据源、节点级自动保存、乐观锁、离线队列
- 单密码认证、BYOK API Key 加密存储

### 2.2 范围外（明确不做）

- 多租户 / 用户注册体系
- 工坊批量 AI 的服务端编排（保持客户端编排 + 进度覆盖层）
- token 级流式输出（CLI provider 不支持，跨 provider 不统一）
- serverless 后台任务队列（QStash / Inngest 等外部依赖）
- 视频 / 美术资产管理（本产品只负责剧本文本层）

---

## 3. 工作流总体需求

### FR-0 阶段门控

- 5 个阶段按序推进：`world → scale → structure → workshop → validate`（定义于 `lib/types/phase.ts`）。
- 每阶段状态为 `locked / in_progress / done`；未完成前置阶段时后续阶段锁定。
- 上游阶段的关键改动（如世界观、结构变更）须将下游标记为过期（`downstreamStale`），提示用户重新生成。
- 顶栏常驻：阶段导航、AI 模式徽标、预览入口。

### FR-1 项目管理

- 项目列表：展示标题、当前阶段、节点数、更新时间；支持新建空项目、从模板创建、打开种子示例项目。
- 项目归档：归档标志位（不物理删除），可恢复。
- 项目数据模型见第 7 节。

---

## 4. 各阶段功能需求

### FR-2 阶段一：世界锚点（world）

- 编辑故事核心、主题、类型、世界规则、目标时长（分钟）、结局数量。
- 角色管理：姓名、定位（主角/反派/配角/其他）、动机、关系，以及深度心理字段（创伤 wound、谎言 lie、表层欲望 want、深层需要 need）。
- 变量管理：名称、类型（flag / counter / relationship / item）、默认值、描述。
- AI 能力（5 项）：
  - `review`：内容一致性审查（一致性、结构分析、互动潜力、逐字段问题清单、时长匹配度）
  - `fix_issues`：按审查结论一键修复
  - `suggest_characters`：角色建议
  - `suggest_variables`：变量建议
  - `endings_design`：结局方向设计（good / bad / neutral / secret 四类型）

### FR-3 阶段二：规模规划（scale）

- AI 一次生成三套体量方案（精简 / 标准 / 史诗），每套含：章数、每章幕数、总节点数、总分支数、预估创作工时、AI 理由、章节大纲。
- 用户选定一套方案后确认，进入结构阶段；后续结构生成必须遵循选定方案的规模（章数、节点量级）。

### FR-4 阶段三：结构与分支（structure / branches）

**列表视图**
- 按 章 → 幕 → 节点 三级层级管理；支持增删、排序。
- 节点类型：`start / normal / branch / merge / explore / ending`。
- 幕支持戏剧功能标注（setup / conflict / turn / resolution）。

**AI 结构生成**
- 两步生成：叙事骨干（spine）→ 逐章节点（chapter），基于 LangGraph StateGraph，章节并行扇出，单章失败可单独重试。
- **流式进度**：生成过程通过 NDJSON 流逐帧反馈（骨干生成中 → 骨干完成 → 第 N/共 M 章），首帧携带 trace runId；流不可用时自动回退非流式请求。
- 分支拓扑生成（`branches:generate`）：为节点间生成选项连接（含条件与变量效果）。

**流程图视图**
- 基于 @xyflow/react 的可视化叙事地图：自动布局、悬停高亮路径、拖拽排列。
- 手动拖拽的节点位置持久化（`position + positionManual`，经节点级保存管线落库），刷新后不丢；未拖动过的节点仍走自动布局。

**分支路径页**
- 枚举从开场到结局的路径（共用 `lib/graph.ts` 的 DFS，带环防护与路径数上限），展示路径统计。

### FR-5 阶段四：场景工坊（workshop）

- 左侧节点树：全局进度一览，支持搜索过滤；大项目下输入不得引发全树重渲染（性能需求见 NFR-1）。
- 右侧工作区逐节点填充：场景头（地点 / 时段 / 内外景）、场景描述、情感弧（emotionIn / emotionOut / playerEmotion / tension / internal_lie / fear）、对白（说话人 / 文本 / 情绪）、选项（文本 / 目标节点 / 条件 / 变量效果 / 后果 / 权重）、备注、预估时长。
- **角色声纹卡**：记录说话节奏、词汇习惯、压力下的防御机制、说谎特征、示例台词，约束 AI 生成的台词风格一致性；工坊内提供声纹卡入口。
- AI 能力（8 项）：`fill_emotion`（填情感弧）、`write_dialogue`（写对白）、`revise_dialogue`（单节点一句话指令修订）、`suggest_choices`（选项建议）、`scene_analysis`、`scene_tension`、`character_voice`、`choice_consequence`。
- **批量 AI 精修**：可选范围（全部节点 / 当前章 / 当前幕），展示预计耗时、逐节点进度覆盖层、失败重试清单。

### FR-6 阶段五：全局校验（validate）

**本地校验引擎**（`lib/validation/engine.ts`，免费、即时，进入页面自动运行）

共 23 项检测，按严重度分级（error / warning / info），产出通过率评分（100 − error×20 − warning×8 − info×2，下限 0）。可达性类检测（UNREACHABLE / NO_PATH_TO_ENDING / TRAP_BRANCH）的图遍历必须承认 explore 节点经 `exploreReturnNodeId` 返回主线的边，与预览、ink 导出的运行时语义一致；条件类检测须覆盖"图上连通但条件永假"的软锁（变量阈值超过全图效果加总的理论上界）：

| 类别 | 检测项 |
|------|--------|
| 结构完整性（error） | DEAD_END 死路、BROKEN_LINK 断链、NO_PATH_TO_ENDING 无法到达结局、TRAP_BRANCH 陷阱分支、ENDING_ORPHAN 孤儿结局定义、UNSATISFIABLE_CONDITION 条件永不可满足（选项/结局永不可达） |
| 结构完整性（warning） | UNREACHABLE 不可达节点、NO_ENDING 无结局、DUPLICATE_CHOICE 重复选项文本、ENDING_NO_DEF 结局节点缺定义、UNKNOWN_VARIABLE_REF 变量断链、UNPARSEABLE_EFFECT 无法解析的变量效果（运行时不会执行）、ALL_CHOICES_GATED 无保底出口（全部选项带条件，可能软锁玩家） |
| 叙事质量（warning） | THIN_DIALOGUE 对白深度不足（McKee ≥6 行标准）、SHORT_DURATION 内容量不足目标时长 50% |
| 叙事质量（info） | EMOTION_MONOTONE 情感节奏单调、SINGLE_ENDING 结局单一、ENDING_VARIETY 结局差异度不足、LOW_BRANCH_DENSITY 分支密度 <25%、WEAK_CHOICES 选择力度不足、NO_EXPLORE_CONTENT 无探索内容、SHALLOW_EMOTION 缺内心谎言、THIN_SCENE_DESC 场景描述过短 |

**可视化**：情感曲线、路径时长分布、叙事地图。

**AI 能力（2 项，均手动触发，禁止进页自动请求）**
- `report`：AI 改进建议报告。
- `director_review`：五位专家导演终审——不同视角评分、总分、greenlit 判定、必须修改项、高光时刻点评。

**导出**：JSON（全量项目数据）、ink（Inkle 叙事脚本格式）。

### FR-7 预览播放（preview）

- 任意阶段可进入，实时体验完整交互剧情。
- 变量追踪面板、情感面板、历史路径面包屑。
- 选项按条件表达式（`&&` / `||`，`>= <= > < == !=`）门控显示；选中后应用变量效果（支持 `+n / -n / =v` 及后缀写法 `name+1`，解析规则与 ink 导出、校验引擎共用 `lib/conditions.ts`）。
- **变量回滚**：返回上一步 / 跳转历史节点时，变量状态精确恢复到该步之前的快照（快照栈与历史栈索引对齐），不残留已执行的选项效果；重置时全部清空。
- 探索节点：进入支线后可自动返回主线（`exploreReturnNodeId`）。

---

## 5. AI 集成需求

### FR-8 AI Provider（5 种，设置页切换）

| Provider | 要求 |
|----------|------|
| Claude CLI（默认） | 无需 API Key，调用已登录的 `claude --print`；仅 `DEPLOY_MODE=local` 可用，deploy 模式禁用并隐藏 |
| Anthropic API | BYOK |
| OpenAI API | BYOK |
| Google Gemini API | BYOK |
| 自定义端点 | 任意 OpenAI 兼容接口 |

### FR-9 AI 双模式

- 项目级模式：`fast`（轻量模型、关深度思考、快速搭骨架）/ `thinking`（默认，深度推理、质量优先，单次生成 1–10 分钟量级）。
- 顶栏随时切换，切换后续 AI 动作按新模式执行；模式徽标常驻顶栏。
- 两模式各自的模型可在设置页分别指定（留空按 provider 默认值）；客户端配置携带 per-mode 模型覆盖。

### FR-10 AI 动作注册表

- 全部 AI 动作（19 项）统一注册于 `lib/ai/schemas.ts` 的 `SCHEMA_REGISTRY`，按 `phase:action` 组织，每项定义输出 schema 并在服务端校验（解析失败自动带 `RETRY_SUFFIX` 重试，最多 3 次）。
- Prompt 模板集中于 `lib/ai/prompts.ts`。

### FR-11 可观测性

- LangSmith tracing 可选开启（`LANGSMITH_*` 环境变量）。
- 每次 AI 调用的 root runId 回传前端：非流式响应体带 `runId`，流式在首帧；AI 错误提示中展示 runId 以便定位 trace。

---

## 6. 认证、数据与可靠性需求

### FR-12 认证

- 单密码登录（`APP_PASSWORD`），HMAC 签名的 httpOnly cookie 会话（无状态，无会话表）。
- 双层防护：`proxy.ts` 全站门禁（未认证浏览器 → /login，未认证 API → 401）+ 每个 route handler `withAuth` 兜底。

### FR-13 数据存储

- **Postgres 为唯一数据源**（PostgreSQL 17 + Drizzle ORM）；表结构：`projects`（元数据 + JSONB 小集合）+ `nodes`（一行一节点，JSONB 载荷）+ `settings`。
- localStorage 仅作乐观展示与离线兜底，加载时按 `version` 对账，DB 胜出。
- 文档级 `schemaVersion` 迁移注册表与物理表 drizzle 迁移正交。
- BYOK API Key 经 AES-256-GCM 加密落库（`ENCRYPTION_KEY` 主密钥），不以明文保存，仅服务端调用时解密。

### FR-14 自动保存

- 保存粒度细化到单节点（PATCH `/api/projects/:id/nodes/:nodeId`），防抖约 700ms。
- 乐观锁：`version` 校验，多标签页同时编辑同一项目时提示版本冲突（BroadcastChannel 感知）。
- 断网写入进入本地队列，网络恢复后指数退避自动续传。
- 页面关闭前（unload）冲刷所有未落库改动。

### FR-15 撤销 / 重做（v0.6 起）

- 破坏性与批量覆盖动作（删除节点/角色/选项/结局、清空下游、重新设计结构、AI 批量覆盖角色/变量/结构/结局设计）执行前自动压入项目快照栈（上限 30，`lib/store/history.ts`）。
- `⌘Z / Ctrl+Z` 撤销、`⇧⌘Z` 重做，全局生效（输入框内放行原生行为）；删除类操作的 toast 附「撤销」按钮。
- 高频输入不产生快照（NFR-1）；恢复走整档保存管线，乐观锁 version 基线沿用服务端确认值；切换项目时清空历史。

### FR-16 命令面板与全局快捷键（v0.6 起）

- `⌘K / Ctrl+K` 呼出命令面板：阶段跳转（锁定阶段不出现）、预览、节点检索（跳转 `/workshop?node=<id>` 并选中）、撤销/重做、中止运行中 AI 任务、项目列表 / 新建项目（`/projects?new=1`）。
- 工坊保留 `j/k/↑/↓/Esc` 节点导航；预览页数字/字母键直选可用选项。

### FR-17 AI 动作的可取消与错误引导（v0.6 起，扩展 FR-11）

- 全部客户端 AI 请求经 AbortController 可中止：单节点动作、批量精修（取消同时中止在飞请求）、结构流式生成（30 分钟上限内任意时刻可停）。
- AI 失败必须对用户可见：按服务端 `errorType`（no_cli / timeout / parse_failed）给差异化中文引导 + 重试按钮（`lib/ai/errors.ts`）；用户主动取消不显示为错误。
- 运行中任务登记于 `lib/ai/taskStore.ts`，命令面板可查看并中止。

---

## 7. 数据模型概要

以 `lib/types/project.ts` 为准，核心实体：

```
Project
├── worldAnchor: WorldAnchor（故事核心/主题/类型/世界规则/时长/结局数/结局设计）
├── characters: Character[]（含 VoiceProfile 声纹卡）
├── scalePlanOptions: ScalePlan[] + selectedScalePlanId
├── chapters: Chapter[] → acts: Act[]（含 nodeIds、戏剧功能）
├── nodes: StoryNode[]（类型/情感弧/系统功能/场景头/场景描述/对白/选项/位置/时长）
│     └── choices: Choice[]（目标节点/条件/变量效果/后果/权重）
├── variables: Variable[]（flag/counter/relationship/item）
├── endings: Ending[]（类型/触发条件/变量条件）
├── lastValidation: ValidationReport
├── directorReview: DirectorReview
├── phaseProgress + currentPhase + downstreamStale
└── aiMode: fast | thinking
```

---

## 8. 非功能需求

### NFR-1 性能

- 工坊高频输入（标题、对白、场景描述等）本地缓冲，blur / 300ms 防抖回写 store：连续打字期间不得触发全页与侧栏重渲染。
- 侧栏派生扫描（角色弧线、变量索引）记忆化，依赖精确收窄；搜索输入不触发全量扫描。
- 流程图 hover / 无关字段变更不触发全图自动布局重排。
- 路径枚举带上限（防组合爆炸）与环防护。

### NFR-2 部署形态

| 形态 | 行为 |
|------|------|
| `DEPLOY_MODE=local`（主力） | 本地长驻 Node；Claude CLI 可用；结构生成流式可跑满 30 分钟 |
| `DEPLOY_MODE=deploy` | serverless（函数时长硬上限）；Claude CLI 禁用；流式超限中断时明确提示用户减小规模 / 换更快模型 / 本地运行 |

- 环境要求：Node.js 24+、Docker（本地 Postgres 17）或托管 Postgres（Neon）。

### NFR-3 安全

- 密钥与凭证只经环境变量（`APP_PASSWORD` / `AUTH_SECRET` / `ENCRYPTION_KEY` / `DATABASE_URL`）注入，不硬编码。
- 输入校验在系统边界执行：API 读写、导入三处 zod safeParse（`lib/schema/project.ts`）。
- 加密、签名、哈希全部使用 Node 内置 `crypto`，不引入第三方认证依赖。

### NFR-4 技术栈约束

Next.js 16.2 (App Router) / React 19 / TypeScript 5 / Tailwind v4 / Zustand v5 / @xyflow/react v12 / LangChain + LangGraph / PostgreSQL 17 + Drizzle ORM。新增依赖须逐个说明理由（见工作区「谨慎引入依赖」原则）。

### NFR-5 视觉与交互体系（v0.6 起）

- 全站唯一视觉语言「叙事蓝图」（安静工程图纸：冷调图纸白 + 制图蓝 + 橙红点睛，装饰克制）：语义 token 经 Tailwind `@theme` 暴露（`app/globals.css`），页面禁止使用 gray/zinc/slate/amber 等字面色类；节点类型的文案与配色只从 `lib/ui/nodeTypes.ts` 取。
- 信息架构约定「核心产出区 + 辅助区」：主栏只放会进入最终剧本数据的内容与主流程按钮；一切 AI 动作与产物、区块级说明、设计原则收进右侧 `AssistRail`（`app/components/ui/assist-rail.tsx`，宽屏吸顶独立滚动，窄屏下落）。工坊中央稿纸只保留故事本体（场景头/场景描述/对白/抉择），情感弧、系统功能、时长、备注一律入辅助区。
- 共享组件库 `app/components/ui/`（Button / Input / Modal / ConfirmButton / Skeleton / StickyNote / IndexCard / Tag），删除确认统一为两步 `ConfirmButton`；模态统一具备 Esc 关闭 + 焦点圈定 + `aria-modal`。
- 预览页主题为组件级 CSS 变量（`--pv-*`），不得以覆写 Tailwind 字面类的方式实现主题。
- a11y 基线：可交互元素键盘可达（button 语义或 role/tabIndex），加载态用骨架屏而非纯文字。

---

## 9. 验收基准

- `pnpm tsc --noEmit` 零错误、`pnpm build` 成功。
- 全流程可走通：新建项目 → 世界锚点 → 规模确认 → 结构生成（流式进度可见）→ 工坊填充 → 校验通过率与导出 → 预览可玩且变量回滚正确。
- 各版本迭代的详细验收标准见 `docs/plans/` 对应实施计划。

---

## 附：文档维护约定

- 本文档描述「产品应该是什么」；实施计划（`docs/plans/`）描述「某次迭代怎么做」。新功能先在此登记需求，再写实施计划。
- README 面向使用者，允许简化表述（如「10 类结构问题」实际为 20 项检测）；需求文档以代码事实为准。
