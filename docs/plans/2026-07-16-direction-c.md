# filmgame-2 方向 C：AI 与体验升级 实现计划

> **For agentic workers:** 本计划按 Task 分块，可由多个子代理并行/串行执行。依赖关系见「执行拓扑」。每个 Task 有独立文件清单、步骤、验证方式与 commit 点。步骤用 `- [ ]` 复选框跟踪。
>
> **前置阅读（Next 16 破坏性变更）：** 动手 SSE 路由前必须读 `node_modules/next/dist/docs/01-app/03-api-reference/…/route`（Streaming 段）与 `…/proxy`；本仓库 Next 16 的 route handler / proxy 约定与训练数据不同（见 `AGENTS.md`）。LangGraph / LangSmith 的 API 以 `node_modules/@langchain/langgraph`、`node_modules/@langchain/core/tracers/run_collector` 的 `.d.ts` 为准。

**Goal:** 把 v0.3.0（SQL 数据层已就绪）的 AI 层与交互体验补齐三块短板：（1）结构生成真正 LangGraph 化并全程可观测；（2）长任务（结构生成最长 30 分钟）有节点级流式进度反馈；（3）修复一批前端性能与交互正确性缺陷（预览变量回滚、流程图布局持久化、校验页自动请求、渲染全量重算等）。

**部署约束:** 现主力形态是本地长驻 Node（`DEPLOY_MODE=local`，可跑 `claude_cli`）。未来 `DEPLOY_MODE=deploy` 可能跑 Vercel serverless（函数时长硬上限，通常 300s，Fluid 最多 ~800s）。**30 分钟量级的结构生成在 serverless 上无法在单请求内跑完——这是硬约束**，方案对两种形态分别给出行为与降级路径。

**Tech Stack（不新增依赖）:** `@langchain/langgraph@^1.3.0`、`langsmith@^0.6.0`、`@langchain/core@^1.1.44` 均已在 `package.json`。前端性能只用 React 19 内置 `useMemo`/`useCallback`/`memo` + 组件本地 `useState`，不引入防抖库（3 行 `setTimeout` 足够，遵循「谨慎引入依赖」）。ID 统一复用已有 `nanoid`。

---

## 关键事实基线（改动前已核对）

| 事实 | 证据 | 对设计的影响 |
|------|------|-------------|
| `lg-structure.ts` 内部是 spine(串行) + `Promise.all`(章节)，无 `StateGraph`/`Send` | `lib/ai/lg-structure.ts:102-132` | 「LangGraph 化」= 真重写；上一次重构计划 Task 8 已给出完整 StateGraph 设计但未落地（`docs/plans/2026-05-06-langchain-refactor.md:818-1000`）。 |
| `lg-workshop.ts`（`runBatchFillEmotion`/`runBatchWriteDialogue`）**无任何 import** | 全仓 grep 仅命中定义处与旧计划 | 是死代码。真实的工坊批量在客户端 `runBulkAi`（`workshop/page.tsx:274-345`），且已有 `BulkProgressOverlay` 进度。 |
| `claude --print --output-format text` 缓冲 stdout 到进程 close 才 resolve | `lib/ai/lc-cli-model.ts:74-91` | CLI 模式**不能逐 token 流式**；进度上限是节点级（spine 完成 / 第 N/M 章完成）。 |
| 结构生成路由超时上限 `1_800_000ms`（30min） | `app/api/ai/route.ts:8`、`app/api/ai/structure/route.ts` | serverless 函数时长远小于此，必须降级。 |
| 节点级保存管线可用：`updateNode → saveNode(projectId,node) → PATCH /api/projects/:id/nodes/:id`（防抖 700ms） | `lib/persistence.ts:233-262`、`lib/store/projectStore.ts:290-299` | 流程图布局持久化直接复用，零新管线。 |
| `StoryNode.position` 字段已存在，但 `FlowView.getPos` 只用 `manualPos ?? autoPos`，从不读 `node.position` | `FlowView.tsx:240-242,313,329-331` | 布局持久化 = 拖拽写回 `node.position` + 加一个「是否手动布局」判据。 |
| 两处路径 DFS 重复 | `branches/page.tsx:9-25` `findAllPaths`；`validate/page.tsx:321-333` `dfs` | 抽到 `lib/graph.ts`，统一 cap + 环防护。 |
| `langgraph` 支持 `streamMode:"updates"` 与原生 `"text/event-stream"` 编码 | `node_modules/@langchain/langgraph/dist/pregel/types.d.ts` | 节点级进度用 `stream(input,{streamMode:"updates"})` 直接拿到「每个节点完成后的增量 state」。 |
| `RunCollectorCallbackHandler` 位于 `@langchain/core/tracers/run_collector` | `node_modules/@langchain/core/dist/tracers/run_collector.d.ts` | 用它捕获 root run id 回传前端。 |
| LangSmith env 已在模板，但变量名可能是遗留写法 | `.env.local.example:1-4`（`LANGSMITH_TRACING_V2`） | 需按已装 `langsmith@0.6` 核对正确变量名（`LANGSMITH_TRACING` vs 遗留 `LANGCHAIN_TRACING_V2`），见 Task C Step 1。 |

---

## 设计决策摘要

| # | 决策点 | 推荐 | 一句话理由 |
|---|--------|------|-----------|
| 1 | `lg-structure` LangGraph 化 | **真 `StateGraph` 重写**：`generateSpine` → 条件边 `Send` 扇出 → `generateChapter`(并行) → reducer 收集 | 依赖已在；直接同时解锁 #3（`stream` 供 SSE）、#6（图级 trace）、单章失败单独重试；旧计划本就要求它。 |
| 2 | `lg-workshop` | **删除（死代码）**，不改名不重写 | 无引用；真实批量在客户端且已有进度覆盖层。改名只会保留一个误导性的空壳。工坊批量的服务端图化明确列为**范围外**。 |
| 3 | 长任务进度传输 | **服务端流式：POST route handler 返回 `ReadableStream`（NDJSON / SSE 帧），客户端用 `fetch` + `response.body` reader 消费**；不用 `EventSource`，不用轮询 | `EventSource` 只能 GET 且难带大 body/cookie；轮询需要一个能在请求之外存活的 worker（serverless 无），单请求内流式是最少活动件的正确原语。 |
| 4 | 进度粒度 | **节点级**：`骨干生成中 → 骨干完成 → 第 N/M 章生成中/完成` | CLI 不能逐 token（事实基线）；即便 API provider 能 token 流，跨 provider 统一到节点级最简且够用。 |
| 5 | 两种部署形态 | **local/VPS：全流式跑满 30min**；**serverless：受函数时长限制**，总时长 < 限额时正常流完，超限则连接被杀→前端提示「超出函数时长，请减小规模或本地运行」；可选降级=客户端分章编排（每章一请求） | 直面 serverless 硬约束；分章编排作为**可选 Task**（不阻塞主线），因每次调用 < 限额且天然带进度。 |
| 6 | LangSmith trace id 贯通 | **开启 tracing env + `RunCollectorCallbackHandler` 捕获 root run id**；非流式 `/api/ai` 响应加 `runId`，流式在**首事件**回传 `runId`；前端错误态展示/记录 | 出问题能对应到 LangSmith 后台；零新依赖。 |
| 7 | 前端性能 | **高频输入本地缓冲**（受控本地 `useState`，blur + 300ms 防抖写 store）**+ `useMemo` 依赖收窄到 `nodes/acts/chapters` + 派生扫描记忆化** | 根因是「每敲一字 → store 换新 project 引用 → 全树重渲染 + 全量扫描」；先掐断 store churn，再挡住必要重算的成本。 |
| 8 | 预览变量回滚 | **`varHistory` 快照栈与 `history` 索引对齐**，回退/跳转按索引恢复快照 | 优于「重放 effect」——重放需记录每步所选 choice 的 effect，快照隐式保存且天然正确处理绝对赋值/非幂等 effect。 |
| 9 | 流程图布局持久化 | **`node.position` + 新增 `positionManual` 标志**；拖拽 `onNodeDragStop` 写节点级保存管线；加载时手动节点优先 `node.position`，其余仍 `autoLayout` | 复用既有 `saveNode` 管线，零新后端；`positionManual` 区分「用户拖过」与「默认网格/自动布局」。 |
| 10 | 校验页自动 AI | **移除挂载时的自动 `/api/ai` report 请求**，保留本地 `runValidation`，露出手动按钮 | 每次进页面自动烧一次 AI 调用是浪费且违反用户意图；本地校验免费可留。 |
| 11 | 小项 | `world/page.tsx` 两处 `Math.random` ID → `nanoid(8)`；DFS 抽到 `lib/graph.ts` `enumeratePaths(start,nodeMap,maxPaths)`（cap + per-path visited 环防护） | 统一 ID 生成；消重并集中控制组合爆炸。 |

---

## 架构与文件变更地图

### 新建文件
| 文件 | 职责 |
|------|------|
| `app/api/ai/structure/stream/route.ts` | 结构生成的**流式**入口：`withAuth` POST，返回 `ReadableStream`，消费 `structureGraph.stream(input,{streamMode:"updates"})`，逐节点发进度帧（首帧含 `runId`）。 |
| `lib/graph.ts` | 图算法工具：`enumeratePaths(startId, nodeMap, maxPaths=50): string[][]`（DFS + per-path visited 环防护 + cap）。branches / validate 共用。 |
| `lib/hooks/useBufferedField.ts`（或就近内联小工具） | 高频输入本地缓冲：受控本地值 + blur/防抖回写 store 的极小 hook（若只用于 workshop 也可内联，不强制成文件）。 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `lib/ai/lg-structure.ts` | 重写为真 `StateGraph`（`Annotation.Root` + `Send` 扇出 + reducer 收集）；导出 `structureGraph`（供 stream）与保留 `runStructureGraph()`（一次性 `invoke`，供非流式路由与 serverless 兜底）。 |
| `lib/ai/lg-workshop.ts` | **删除**（确认无引用后）。 |
| `lib/ai/lc-chains.ts` | `runChain` 支持捕获并返回 `runId`（`RunCollectorCallbackHandler` 经 invoke config 注入）。 |
| `app/api/ai/route.ts` | 响应体加 `runId`；错误响应也带 `runId`（若已产生）。 |
| `app/api/ai/structure/route.ts` | 保留为**非流式兜底**（serverless / 不支持流式的客户端）；响应加 `runId`。 |
| `app/project/[id]/structure/page.tsx` | `generateStructure` 优先走 `/api/ai/structure/stream`（fetch reader 消费进度），驱动新的进度状态机（`骨干生成中 / 第 N/M 章 …`）；流式不可用时回退到既有非流式路由。**同时移除挂载自动生成**？→ 不动：结构页首次进入本就应生成（`useEffect` 触发）；仅把「无反馈 spinner」升级为进度 UI。 |
| `app/project/[id]/workshop/components/NodeTreeSidebar.tsx` | 派生计算（排序、角色弧线、变量索引）`useMemo` 记忆化，依赖精确到 `nodes/characters/variables`；搜索过滤独立 `useMemo`（依赖 `nodes+nodeSearch`），避免搜索输入触发全量角色/变量扫描。 |
| `app/project/[id]/workshop/page.tsx` | 高频输入（标题、对白 speaker/text/emotion、场景描述、备注、choice 文本）改本地缓冲组件，blur/防抖回写 `updateNode`，掐断每键 store churn。 |
| `app/project/[id]/structure/FlowView.tsx` | (a) `buildFlowData` 的 `useMemo` 依赖由 `[project,…]` 收窄为 `[project.nodes,project.acts,project.chapters,hoveredNodeId,manualPos]`；(b) 布局持久化：`onNodeDragStop` 写 `updateNode(id,{position,positionManual:true})`，`getPos` 优先手动布局，`manualPos` 初始从 `node.position`(positionManual) 播种。 |
| `app/project/[id]/preview/page.tsx` | 加 `varHistory` 快照栈；`navigateTo`/`enterExplore` 入栈，`goBack`/`jumpTo`/`reset` 恢复/截断，保证 varState 与 history 对齐。 |
| `app/project/[id]/validate/page.tsx` | 删除挂载 `useEffect` 内的 `/api/ai` 自动请求（保留 `runValidation`+`setValidationReport`），使手动「AI 生成改进建议」按钮显现。 |
| `app/project/[id]/world/page.tsx` | 两处 `Math.random().toString(36)...`（:148,:175）→ `nanoid(8)`。 |
| `app/project/[id]/branches/page.tsx` | `findAllPaths` 改为调用 `lib/graph.ts` 的 `enumeratePaths`。 |
| `lib/types/project.ts` | `StoryNode` 加 `positionManual?: boolean`。 |
| `lib/schema/project.ts` | `StoryNodeSchema` 加 `positionManual: z.boolean().optional()`（保持与类型守卫一致）。 |
| `.env.local.example` | 校正 LangSmith 变量名（见 Task C）。 |

### 明确范围外（本次不做）
- 工坊批量（`runBulkAi`）服务端图化 / 其 SSE 化——已有客户端进度覆盖层，收益低、改动大。
- token 级流式——CLI 不支持，跨 provider 不统一。
- serverless 后台任务队列（QStash/Inngest 等）——违反「自用、谨慎依赖」。
- 模型 ID 刷新（`config.ts`/`lc-providers.ts` 的 `claude-opus-4-5` 等）——属独立事项，与本方向无关；**如需刷新先查 `E:\CC\ai-models.md`**（此处仅提示，不在本计划改动）。

---

## 执行拓扑（子代理调度）

```
AI 层链（串行为主）:
  Task A (lg-structure 真图化 + 删 lg-workshop)
        ├──► Task B (SSE 流式路由 + 结构页进度 UI)   ─┐ B、C 可并行
        └──► Task C (LangSmith runId 贯通)            ─┘（C 也含独立的 /api/ai runId）

前端/逻辑（彼此独立，全并行，且与 AI 层链并行）:
  Task D (workshop 性能: 输入缓冲 + Sidebar memo)
  Task E (preview 变量回滚)
  Task F (FlowView: memo 依赖收窄 + 布局持久化 + 类型/schema)
  Task G (validate 改手动)
  Task H (小项: world nanoid + lib/graph.ts DFS 抽取)

  Task I (可选降级: serverless 客户端分章编排)  依赖 A
  Task Z (全量验收, 串行, 最后)  依赖全部
```

并行分组建议：一个子代理跑 A→B→C 链；另起 4 个子代理分别跑 D、E、F、G/H。Task I 视是否要 serverless 支持决定是否排期。

---

## Task A：`lg-structure` 真 LangGraph 化 + 删除 `lg-workshop`

**Files:** `lib/ai/lg-structure.ts`（重写）、`lib/ai/lg-workshop.ts`（删除）

**背景:** 现状 `runStructureGraph` = spine 串行 + `Promise.all`。目标：真 `StateGraph`，为 Task B/C 提供 `stream()` 与图级 trace，并支持单章失败单独重试。

- [ ] **Step 1: 重写 `lib/ai/lg-structure.ts`**
  - 用 `Annotation.Root` 定义 state：`worldAnchor/scalePlan/characters`（passthrough）、`chapterCount`、`spine`(reducer 覆盖)、`chapters`(reducer 累加 `[...existing,...incoming]`)、`errors`(reducer 累加)。参照旧计划 `2026-05-06-langchain-refactor.md:840-947` 的 state/节点骨架。
  - 节点 `generateSpine(state)`：复用现有 `loadServerAIConfig`+`createModel`+`buildPrompt('structure','spine',…)`+`extractJson`+`SpineSchema` 校验 + `RETRY_SUFFIX` 重试（保留现有 3 次重试与 gemini `invokeOptions` 处理）。
  - 条件边 `fanOutChapters(state)`：返回 `Array.from({length:chapterCount},(_,i)=> new Send('generateChapter',{...state,chapterIndex:i}))`。
  - 节点 `generateChapter(state)`：单章生成（`ChapterDraftSchema`），失败返回 `{errors:[...]}`，成功返回 `{chapters:[draft]}`。
  - 组图：`START → generateSpine → (conditional) fanOutChapters → generateChapter → END`。导出编译后的 `structureGraph`。
  - **导出两个入口**：`structureGraph`（供 Task B 的 `stream`）；`runStructureGraph(input)` 改为 `await structureGraph.invoke(...)` 后组装 `{spine,chapters,errors}`（保持既有签名/返回结构，供非流式路由与 serverless 兜底不变）。
  - 模型实例：每个节点 `createModel` 一次即可（结构生成非高频，非 `lc-chains` 的 OOM 场景）；如担心 API provider 重复建实例，可在单次 run 内复用——不强制。
  - **不要**保留旧的顶层 `extractJson` 与 `generateSpineWithModel/generateChapterWithModel` 重复实现，合并进节点函数（消除与 `lc-chains.ts` 的 `extractJson` 双份的扩散；`lc-chains` 那份不动，属既有）。

- [ ] **Step 2: 删除 `lib/ai/lg-workshop.ts`**
  - 先确认无引用：`grep -rn "lg-workshop\|runBatchFillEmotion\|runBatchWriteDialogue" app lib`（应仅命中被删文件自身）。删除文件。

- [ ] **Step 3: 验证**
```bash
grep -rn "lg-workshop" app lib            # 期望：无输出
pnpm tsc --noEmit                          # 零错误
# 冒烟：临时脚本 import { runStructureGraph } 跑一个最小 scalePlan(chapterCount:2)，
# 断言返回 { spine, chapters(len 2 或带 errors), errors }，与旧行为同形
```
- [ ] **Commit:** `refactor(ai): rewrite lg-structure as real LangGraph StateGraph; remove dead lg-workshop`

---

## Task B：SSE 流式进度（路由 + 结构页 UI）

**依赖:** Task A（`structureGraph`）
**Files:** `app/api/ai/structure/stream/route.ts`（新）、`app/project/[id]/structure/page.tsx`

**先读:** `node_modules/next/dist/docs/01-app/.../route`（Streaming 段），确认 Next 16 route handler 返回 `ReadableStream` 的正确写法与运行时约束（是否需 `export const runtime`/`dynamic` 等——以文档为准，不臆测）。

- [ ] **Step 1: 新建流式路由 `app/api/ai/structure/stream/route.ts`**
  - `withAuth` 包裹 POST。解析 body `context:{worldAnchor,scalePlan,characters}`，算 `chapterCount`。
  - 返回 `new Response(readable, { headers:{ 'Content-Type':'application/x-ndjson; charset=utf-8', 'Cache-Control':'no-cache', 'X-Accel-Buffering':'no' }})`。
  - 用 `ReadableStream`：在 `start(controller)` 内 `for await (const update of structureGraph.stream(input,{ streamMode:'updates', callbacks:[collector] }))` —— 每个 `update` 是 `{nodeName: partialState}`，据此 `controller.enqueue(encoder.encode(JSON.stringify(evt)+'\n'))`。
  - **首帧**：`{type:'run', runId}`（`runId` 来自 Task C 的 collector；见 Task C Step 2）。
  - **进度帧**：`generateSpine` 完成 → `{type:'spine', ok:!!spine}`；每个 `generateChapter` 完成 → `{type:'chapter', done: ++n, total: chapterCount}`（用本地计数器累加，因 `updates` 会多次命中同名并行节点）。
  - **终帧**：`{type:'done', chapters, errors}`；异常 → `{type:'error', error, errorType}`（分类沿用 `route.ts:classifyError` 语义）。发完 `controller.close()`。
  - 逐帧 flush（`streamMode:'updates'` 天然逐节点产出，无需手动 flush 技巧）。

- [ ] **Step 2: 结构页消费流 `structure/page.tsx`**
  - 新增进度状态：`const [progress,setProgress]=useState<{phase:'spine'|'chapters';done:number;total:number}|null>(null)` 与 `runIdRef`。
  - `generateStructure()` 改为：优先 `fetch('/api/ai/structure/stream',{method:'POST',body})`，若 `res.ok && res.body` → 读 `res.body.getReader()` + `TextDecoder`，按 `\n` 分割解析 NDJSON，逐帧更新 `progress`/`runIdRef`；收到 `done` → 走既有 `setStructDraft`/`setStage('struct_preview')` 逻辑；`error` → `setAiError`。
  - **回退**：若 `!res.ok` 或无 `res.body`（老浏览器/代理不透传流）→ 回退调用既有 `/api/ai/structure`（非流式）保持功能不降级。
  - `struct_loading` 视图：把当前纯 spinner（`page.tsx:260-269`）升级为进度文案：`骨干生成中… → 骨干完成，正在生成第 {done}/{total} 章`；`aiError` 展示区保留并附 `runId`（见 Task C）。

- [ ] **Step 3: 部署形态行为（写进 UI 文案与代码注释，不同分支）**
  - `local/VPS`：流式全程可用，无请求硬超时（确认无反向代理 buffering；已设 `X-Accel-Buffering:no`）。
  - `deploy/serverless`：连接受函数时长限制。做法：结构页照常发流式请求；若流在 `done` 之前中断（reader 抛错/EOF 无 `done`）→ 提示「生成超出函数时长上限，请减少章节数、改用更快的 BYOK 模型，或在本地模式运行」。**不**在 serverless 上假装能跑 30min。

- [ ] **Step 4: 验证（可验证的进度）**
```bash
pnpm dev
# 本地 claude_cli：结构页触发生成 → Network 里 stream 请求为 pending/streaming，
#   浏览器逐条收到 spine / chapter done N/M（可在 reader 处 console.log 帧计数）
# 断言：UI 文案随 chapter done 递增到 total；done 帧后进入 struct_preview
# 模拟回退：临时把 stream 路由改 404 → generateStructure 自动回退非流式仍出结果
```
- [ ] **Commit:** `feat(ai): streaming structure generation with node-level progress (SSE/NDJSON) + graceful fallback`

---

## Task C：LangSmith run id 贯通

**依赖:** Task A（图）；`/api/ai` 部分独立
**Files:** `.env.local.example`、`lib/ai/lc-chains.ts`、`app/api/ai/route.ts`、`app/api/ai/structure/route.ts`、（前端错误态）`structure/page.tsx`、`workshop/page.tsx`、`validate/page.tsx`

- [ ] **Step 1: 核对/校正 tracing env 变量名**
  - 按已装 `langsmith@0.6` / `@langchain/core@1` 的 `.d.ts` 或 `node_modules/langsmith` README 确认自动 tracing 的正确变量（`LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY` + `LANGSMITH_PROJECT`；遗留名 `LANGCHAIN_TRACING_V2`）。更新 `.env.local.example:1-4` 为正确变量（当前是 `LANGSMITH_TRACING_V2`，很可能不生效）。
  - **文档与代码冲突处理**：若发现两套变量名并存/歧义，停下确认后再改，不默默二选一。

- [ ] **Step 2: 捕获 root run id**
  - `import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector'`。
  - `lc-chains.ts runChain`：新建 `collector = new RunCollectorCallbackHandler()`，在 `invoke([...], { callbacks:[collector], timeout? })` 传入；返回 `{ result, runId: collector.tracedRuns[0]?.id }`（改签名或加并列导出，调用方 `route.ts` 取用）。CLI 与 structured-output 两路都要接。
  - Task B 流式路由：把同一 `collector` 传给 `structureGraph.stream(input,{callbacks:[collector]})`，在首帧 enqueue `{type:'run', runId: collector.tracedRuns[0]?.id}`（root run 在流开始后即可读到；若首帧时尚未就绪，可在第一个 update 后补发 `run` 帧）。

- [ ] **Step 3: API 响应回传**
  - `/api/ai/route.ts`：`return NextResponse.json({ ok:true, result, runId })`；catch 分支也带上（若已产生）。
  - `/api/ai/structure/route.ts`（非流式兜底）：`{ ok:true, result:{chapters}, runId }`。

- [ ] **Step 4: 前端错误态展示 runId**
  - `structure/page.tsx`/`workshop/page.tsx`/`validate/page.tsx` 的 `aiError` 文案后附 `runId`（如 `AI 请求失败（trace: <runId>）`），便于去 LangSmith 后台按 run id 查。成功态不强制展示。

- [ ] **Step 5: 验证**
```bash
# 配好 LANGSMITH_* 后 pnpm dev
# 触发一次 world/suggest_characters 与一次结构生成
# 断言：/api/ai 响应 JSON 含非空 runId；结构流首帧 {type:'run',runId} 非空
# 打开 https://smith.langchain.com 对应 project，用该 runId 能定位到 trace
```
- [ ] **Commit:** `feat(ai): thread LangSmith run id to API responses & stream, surface on errors`

---

## Task D：workshop 性能（输入缓冲 + Sidebar 记忆化）

**Files:** `app/project/[id]/workshop/page.tsx`、`app/project/[id]/workshop/components/NodeTreeSidebar.tsx`、（可选）`lib/hooks/useBufferedField.ts`

**根因:** `updateNode` 每键改 `project.nodes`（新数组）→ store 换新 `project` 引用 → `WorkshopPageInner` 全量重渲 → `NodeTreeSidebar` 每次重跑排序 + 角色弧线扫描(O(nodes×chars)) + 变量索引扫描(O(nodes×vars))。用户报告「大项目每敲一字全扫描」即此。

- [ ] **Step 1: 高频输入本地缓冲**
  - 加极小工具（内联或 `useBufferedField.ts`）：`const [v,setV]=useState(value); useEffect(()=>setV(value),[value]); onChange 只 setV；onBlur 与 300ms 防抖时 commit(v)`。
  - 套到 workshop 的高频字段：节点标题（:453-458）、对白 speaker/emotion/text（:634-660）、场景描述（:571-580）、备注（:861-869）、choice 文本（:747-755）。commit 调既有 `updateNode`/`updateChoice`。
  - **效果**：连续打字期间 store 不变 → 整页与 sidebar 不重渲；停顿/失焦才写一次。

- [ ] **Step 2: Sidebar 记忆化**
  - 排序后的 `chapters`、每章 acts、角色弧线 `arcs`、变量索引 `varUsage` 各自 `useMemo`，**依赖精确**：`arcs`/`varUsage` 依赖 `[project.nodes, project.characters, project.variables]`（不含 `nodeSearch`）；树过滤依赖 `[project.nodes, project.acts, project.chapters, nodeSearch]`。
  - 目标：在搜索框打字（改 `nodeSearch`）时，角色弧线/变量索引的 memo 工厂**不重跑**；在编辑节点标题（改 nodes）时，因 Step 1 已掐断 store churn，正常也不会每键触发。
  - 可选：`export const NodeTreeSidebar = memo(function…)`（Step 1 后 `project` 引用在打字期间稳定，memo 才有意义）。

- [ ] **Step 3: 验证（React DevTools Profiler + 渲染计数）**
```
# 验证手段一（计数）：在 arcs/varUsage 两个 useMemo 工厂首行临时加
#   if (process.env.NODE_ENV!=='production') console.count('sidebar:arcs')  / 'sidebar:varUsage'
# 场景 A（改前基线）：在节点标题连打 10 个字符 → 记录计数增量
# 场景 B（改后）：同操作 → arcs/varUsage 计数增量应为 0（打字期间），仅 blur 后 +1
# 场景 C：搜索框打字 → arcs/varUsage 计数不增（只有树过滤 memo 重算）
# 验证手段二：React DevTools Profiler 录制打字过程，NodeTreeSidebar 的 commit 次数
#   改后应显著下降（打字期间 ~0 次 commit）
# 验收：删除临时 console.count
```
- [ ] **Commit:** `perf(workshop): buffer high-frequency inputs, memoize NodeTreeSidebar derived scans`

---

## Task E：preview 变量回滚

**Files:** `app/project/[id]/preview/page.tsx`

**问题:** `goBack`(:170-177)/`jumpTo`(:179-184) 只改 `currentNodeId` 和截断 `history`，`varState` 不回退 → 变量漂移。

- [ ] **Step 1: 加 `varHistory` 快照栈**
  - `const [varHistory,setVarHistory]=useState<Record<string,string|number>[]>([])`，与 `history` 索引对齐（`varHistory[i]` = 进入 `history[i]` 时刻的 varState 快照）。
  - `navigateTo`：入栈当前 varState **再**应用 effect（保证 `history.push(current)` 与 `varHistory.push(currentVarState)` 同步）。`enterExplore` 同理。注意 `fromExplore` 分支（explore 返回）不 push `history`，则也不 push `varHistory`，保持对齐。
  - `goBack`：`history.pop()` 的同时 `setVarState(varHistory[last]); varHistory=varHistory.slice(0,-1)`。
  - `jumpTo(nodeId)`：`idx=history.indexOf(nodeId)` → `setVarState(varHistory[idx]); history/varHistory 都 slice(0,idx)`。
  - `reset`：两栈都清空，varState 重置为默认（已有逻辑）。

- [ ] **Step 2: 验证**
```
pnpm dev → preview（author 模式，右下角变量面板可见）
# 设 2~3 个带 effect 的选项，走 A→B→C 累积变量
# goBack：面板变量值回到 B 时刻；再 goBack 回 A 时刻
# jumpTo 面包屑中间节点：变量值 == 那一步的值
# reset：变量归默认
# 断言面板显示值与手算一致（含 +/- 与绝对赋值 x=5 混合场景）
```
- [ ] **Commit:** `fix(preview): roll back variable state on goBack/jumpTo via snapshot stack`

---

## Task F：FlowView 记忆化 + 布局持久化

**Files:** `app/project/[id]/structure/FlowView.tsx`、`lib/types/project.ts`、`lib/schema/project.ts`

- [ ] **Step 1: 收窄 `useMemo` 依赖**
  - `buildFlowData` 的 memo（:315-319）依赖由 `[project,hoveredNodeId,manualPos]` → `[project.nodes, project.acts, project.chapters, hoveredNodeId, manualPos]`。避免 project 上无关字段（endings/variables/worldAnchor 等）变化触发全图 `autoLayout` 重排。
  - （可选、更优雅）把「布局+基础节点/边」与「hover 高亮叠加」拆两个 memo：布局 memo 依赖 `[nodes,acts,chapters,manualPos]`；高亮叠加依赖 `[baseData,hoveredNodeId]`。这样 hover 不再重跑 `autoLayout`(BFS)。若时间紧，Step 1 的收窄即达成用户要求，拆分标注为增强项。

- [ ] **Step 2: 类型/schema 加 `positionManual`**
  - `lib/types/project.ts` `StoryNode` 加 `positionManual?: boolean`。
  - `lib/schema/project.ts` `StoryNodeSchema` 加 `positionManual: z.boolean().optional()`（维持编译期类型守卫通过）。存储无需迁移（在既有 node 行 JSONB / position 内）。

- [ ] **Step 3: 拖拽持久化**
  - `FlowView` 引入 `useProjectStore` 的 `updateNode`（或经 prop 回调；组件目前只吃 `project` prop，最小改动是直接 `useProjectStore(s=>s.updateNode)`）。
  - `handleNodeDragStop`（:329-331）：除更新本地 `manualPos`，再 `updateNode(node.id, { position:{x,y}, positionManual:true })` → 触发节点级 `saveNode` PATCH（复用管线）。
  - `manualPos` 初始播种：组件挂载时用 `useState(()=> new Map(project.nodes.filter(n=>n.positionManual).map(n=>[n.id,n.position])))`，使刷新后手动布局仍在。
  - `getPos`（:240-242）：`manualPos.get(id) ?? (node.positionManual ? node.position : autoPos.get(id)) ?? {x:0,y:0}`。

- [ ] **Step 4: 验证**
```
pnpm dev → 结构页流程图视图
# 拖动某节点到新位置 → Network 出现一条 nodes PATCH（体积小）
# 刷新页面 → 该节点仍在拖放位置；未拖过的节点仍走 autoLayout
# 编辑无关字段（如变量名）→ Profiler 确认流程图未整体重排（Step 1 生效）
pnpm tsc --noEmit
```
- [ ] **Commit:** `feat(structure): persist manual FlowView node layout; narrow memo deps`

---

## Task G：校验页改纯手动

**Files:** `app/project/[id]/validate/page.tsx`

- [ ] **Step 1:** 删除挂载 `useEffect`(:19-37) 内的 `fetch('/api/ai',… 'report')` 及其 `AbortController`/`setLoading(true)`。**保留** `runValidation(project)`+`setValidationReport(r)`（本地、免费）。`aiSuggestions` 初值保持 `null`，使 `!aiSuggestions` 分支的手动按钮「AI 生成改进建议」(:272-280) 显现，点击走既有 `handleAiReport`。
- [ ] **Step 2: 验证**
```
pnpm dev → 进入 validate 页
# Network 断言：挂载时无 /api/ai 请求；本地校验统计正常渲染
# 手动点「AI 生成改进建议」→ 恰好一次 /api/ai 请求，结果渲染
```
- [ ] **Commit:** `fix(validate): make AI report manual-only, remove auto request on mount`

---

## Task H：小项（nanoid + DFS 抽取）

**Files:** `app/project/[id]/world/page.tsx`、`lib/graph.ts`（新）、`app/project/[id]/branches/page.tsx`、`app/project/[id]/validate/page.tsx`

- [ ] **Step 1: world nanoid**
  - `world/page.tsx` 顶部 `import { nanoid } from 'nanoid'`；:148 与 :175 的 `id: Math.random().toString(36).slice(2,10)` → `id: nanoid(8)`。

- [ ] **Step 2: `lib/graph.ts` 抽取路径枚举**
  - `export function enumeratePaths(startId, nodeMap: Map<string,StoryNode>, maxPaths=50): string[][]`：DFS，per-path `visited` 环防护（`new Set(visited)` 传递，与两处现状一致），命中 `ending` push 路径，`paths.length>=maxPaths` 早停。**在函数注释里写明**：cap 是防组合爆炸的启发式，超出部分不枚举（与现有 branches>50 / validate>=30 行为对齐；统一为可配 `maxPaths`）。
  - `branches/page.tsx`：`findAllPaths(startId,nodeMap)` → `enumeratePaths(startId,nodeMap,50)`；删除本地 `findAllPaths`(:9-25)。
  - `validate/page.tsx` `PathDurationTable`：`dfs` 循环(:321-333) → `const paths = enumeratePaths(startNode.id, nodeMap, 30)`；随后 duration/ending 计算(:336-348) 不变。删除本地 `dfs`。
  - 注意两处对 `paths.length` 阈值文案（branches「仅显示前 8」+extra、validate「仅显示前30条」）保持各自 maxPaths 语义。

- [ ] **Step 3: 验证**
```bash
pnpm tsc --noEmit
grep -rn "Math.random" app/project      # 期望 world 处消失（其余若有属既有，不动）
pnpm dev
# 打开两个真实项目（41/65 节点）的 branches 与 validate 页：
#   路径总数/最短最长/时长分布 与抽取前一致（可先记录基线数值再对比）
```
- [ ] **Commit:** `refactor(graph): extract path DFS to lib/graph.ts; use nanoid for world ids`

---

## Task I（可选）：serverless 客户端分章编排降级

**依赖:** Task A
**Files:** `app/api/ai/structure/spine/route.ts`（新）、`app/api/ai/structure/chapter/route.ts`（新）、`structure/page.tsx`

**何时做:** 仅当确定要在 serverless 上支持较大规模结构生成时。否则 Task B Step 3 的「超限提示」已是可接受行为。

- [ ] **Step 1:** 暴露 Task A 的两个节点函数为独立细粒度路由：`POST /spine`（返回 spine，≤90s）、`POST /chapter`（body 带 `spine+chapterIndex`，返回单章，≤300s，压在函数时长内）。均 `withAuth` + 返回 `runId`。
- [ ] **Step 2:** `structure/page.tsx` 在 `DEPLOY_MODE==='deploy'`（经 `/api/settings` 暴露的 `deployMode`）时，改走「先 /spine，再 for i in 0..M 串行/有限并发 /chapter」，进度天然按 chapter 计。每章独立 trace（无图级 tree，接受此权衡）。
- [ ] **Step 3: 验证:** `DEPLOY_MODE=deploy pnpm build && pnpm start`，触发生成，每次网络调用 < 函数时长；进度按 N/M 前进；单章失败仅重试该章。
- [ ] **Commit:** `feat(deploy): client-orchestrated per-chapter structure gen for serverless`

---

## Task Z：全量验收（串行，最后）

- [ ] `pnpm tsc --noEmit` 零错误；`pnpm build` 成功。
- [ ] 真实检查（用两个真实项目，41/65 节点）：结构生成流式进度可见并跑完；LangSmith 后台按响应 `runId` 可定位；工坊大项目打字不卡（Profiler 打字期间 sidebar ~0 commit）；流程图拖拽刷新不丢；预览来回跳转变量正确；校验页无自动请求。
- [ ] `grep -rn "lg-workshop"` 无残留；`grep -rn "Math.random" app/project/[id]/world` 无残留；`branches`/`validate` 复用 `lib/graph.ts`。
- [ ] **Commit:** `chore: direction-c AI & UX upgrade verified`

---

## 验收标准

| 项目 | 验收条件 |
|------|---------|
| 真 LangGraph | `lg-structure` 为 `StateGraph`+`Send`；`structureGraph.stream` 产出逐节点 update；`lg-workshop` 删除且无引用 |
| 流式进度 | 结构页显示 `骨干完成 → 第 N/M 章`；流不可用自动回退非流式；serverless 超限有明确提示 |
| trace 贯通 | `/api/ai` 响应与结构流首帧带非空 `runId`；错误态展示 runId；LangSmith 可定位 |
| 工坊性能 | 打字期间 store 不 churn、`NodeTreeSidebar` 角色/变量 memo 不重跑（console.count/Profiler 可证）|
| 流程图 | 拖拽写节点级 PATCH，刷新保留；无关字段变更不触发全图重排 |
| 预览回滚 | goBack/jumpTo/reset 后变量面板值与该步一致 |
| 校验页 | 挂载无 `/api/ai` 请求；手动按钮触发恰一次 |
| 小项 | world 用 nanoid；两页复用 `enumeratePaths`，路径统计与改前一致 |
| 类型/构建 | `tsc` 零错误、`build` 成功 |
