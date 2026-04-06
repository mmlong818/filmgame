# QA Report - Cycle 1

审查时间：2026-04-04  
审查范围：world / scale / structure / workshop / validate / validation engine / persistence

---

## Critical Bugs（可能导致数据丢失或崩溃）

### CB-1 Workshop：节点切换时未保存 in-progress 编辑内容
**文件**：`app/project/[id]/workshop/page.tsx`  
**位置**：`nodeDrafts` 状态 + 节点列表点击事件（L60-74, L313）

编辑区的 `sceneDesc`、`emotionFunction`、`dialogue` 全部直接调用 `updateNode` 写入 store（已持久化），这部分没问题。但 **AI 生成的草稿**（`nodeDrafts[nodeId]`）只存在于本地 React 状态。用户对 A 节点触发"AI 设计此节点"后，如果还未点"通过"就切换到 B 节点，再切回来时草稿仍然存在（`nodeDrafts` 未清除），**但如果期间页面刷新或路由跳转，该草稿丢失且无任何警告**。用户以为 AI 已经保存，实际上没有。

**复现路径**：AI 设计节点 → 不点"通过" → 刷新页面 → 草稿消失，节点内容未变。

---

### CB-2 Structure：`commitBranches` 内部直接调用 `useProjectStore.getState()`
**文件**：`app/project/[id]/structure/page.tsx`  
**位置**：`commitBranches`（L178-194, L204-214）

`commitBranches` 是普通函数（不是 hook），在循环内多次调用 `useProjectStore.getState().updateNode()`。这绕过了 React 的批量更新机制。在 Zustand 之外直接调用 `getState()` 并不是错误，但函数内部在第一轮循环（L193）调用 `updateNode` 写入节点后，第二轮循环（L204）用 `useProjectStore.getState().project!.nodes` 读取"最新"节点列表做顺序连接。如果 Zustand store 的 `updateNode` 是异步/批量提交的，第二轮读到的数据可能是旧值，导致顺序连接逻辑跳过部分节点，**产生隐性死路而没有报错**。

---

### CB-3 Persistence：`syncToServer` 的防抖竞态
**文件**：`lib/persistence.ts`  
**位置**：`syncToServer`（L56-65）

`saveTimer` 是模块级变量。多个 `saveProject` 在 500ms 内连续调用时，前一个定时器被 `clearTimeout` 取消，只有最后一次会发送请求——这是期望行为。  
但问题在于：`loadProjectWithFallback` 会从服务端拉取数据并**覆盖 localStorage**（L31-33）。若用户在网络请求返回（延迟较高）期间修改了项目，服务端返回的旧版本会覆盖掉用户在 localStorage 中的最新改动，且无任何版本比对逻辑（没有 `updatedAt` 比较）。**数据回滚风险**。

---

### CB-4 Scale：AI 生成失败时无 UI 反馈，页面停在空白状态
**文件**：`app/project/[id]/scale/page.tsx`  
**位置**：`generatePlans`（L19-37）

`catch` 块只有 `console.error(e)`，`setLoading(false)` 会执行（`finally` 隐式），但 `scalePlanOptions` 仍为空数组。UI 进入"暂无方案，请先完成世界锚点设置"状态，没有错误提示，没有"重试"按钮（顶部"重新生成"按钮存在，但无错误说明用户不知道发生了什么）。

---

## Logic Errors（功能不按预期工作）

### LE-1 World：`handleAiReview` 失败时 review 仍为 null，无错误提示
**文件**：`app/project/[id]/world/page.tsx`  
**位置**：L86-102

`catch` 只有 `console.error(e)`，UI 上没有任何错误反馈。用户点击"AI 专家审查"后 loading 停止，review 区域不出现，用户不知道是成功（内容为空）还是失败。同样问题出现在 `generateVoiceProfile`（L67-84）：`catch` 是 `/* ignore */`，失败完全静默。

---

### LE-2 World：`durationMinutes` 可以输入 0 或负数，`endingCount` 无下限保护
**文件**：`app/project/[id]/world/page.tsx`  
**位置**：L144-152, L165-174

`<input type="number" min={15} max={360}>` 的 `min/max` 属性仅为 HTML 提示，不阻止用户手动输入。`update('durationMinutes', Number(e.target.value))` 直接写入 store，没有 JS 层面的范围校验。若输入 0，validation engine 的时长检测（`engine.ts` L238）会因 `targetMinutes > 0` 条件跳过，但后续逻辑可能依赖正数时长。`endingCount` 同理，没有 JS 校验。

---

### LE-3 Structure：`commitStructure` 中节点 position 用固定公式计算，不考虑已存节点位置
**文件**：`app/project/[id]/structure/page.tsx`  
**位置**：L111

```ts
position: { x: ni * 200, y: ai * 120 }
```

所有节点的初始 position 由序号乘以固定间距决定。FlowView 中 `nodesDraggable={false}`（FlowView.tsx L164），用户**根本无法拖动节点**。Flow 视图仅是只读展示，UI 上没有任何说明，容易让用户误以为无法交互是 bug。

---

### LE-4 Structure：FlowView 点击节点跳转不携带节点 ID
**文件**：`app/project/[id]/structure/FlowView.tsx`  
**位置**：L132-134

```ts
const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
  router.push(`/project/${params.id}/workshop`)
}, [router, params.id])
```

`node` 参数被忽略，点击任何节点都跳到 workshop 首页，不会选中对应节点。正确做法应该是 `router.push(\`/project/${params.id}/workshop?node=${node.id}\`)`。

---

### LE-5 Workshop：`callAiDesignNode` 中两个并行请求任意失败都不提示
**文件**：`app/project/[id]/workshop/page.tsx`  
**位置**：L150-177

`Promise.all([emotionFetch, dialogueFetch])` 之后分别检查 `eData.ok` 和 `dData.ok`，只有当两者都失败（即 `draft` 为空对象）时才不更新 draft。若只有一个失败，另一个的内容会写入草稿但没有提示部分失败——用户可能误以为设计完整。

---

### LE-6 Validation Engine：可达性检测逻辑有缺陷
**文件**：`lib/validation/engine.ts`  
**位置**：L44-65

可达性判断方式：收集所有 `choice.targetNodeId` 加入 `reachable` 集合，然后检查每个节点是否在集合中。这只检测"是否有任何边指向它"，**不能检测从 start 节点是否真正可达**（它混淆了"被引用"和"可达"）。例如：节点 A→B→C，D→B，若 D 本身不可达，B 和 C 也应被标记为不可达，但当前逻辑因为 D→B 这条边存在，会认为 B 可达。

---

### LE-7 Validation Engine：`NO_PATH_TO_ENDING` 误报（递归中 `visited` 共享问题）
**文件**：`lib/validation/engine.ts`  
**位置**：L121-143

`canReachEnding` 在 `some` 中传入 `new Set(visited)` 是对的（每个分支独立）。但存在另一个问题：对每个 `start` 节点单独检查是否能到达结局，但只要任意一条路径能到结局就返回 `true`，而实际上应该检查"是否存在一条路径**无法**到达结局"。当前逻辑是：start 节点本身是否存在**任何一条**到结局的路径。如果 start 有两个 choice，一个到结局，一个是死路，当前逻辑不报 `NO_PATH_TO_ENDING`，但玩家走死路分支时确实无法到结局。（`DEAD_END` 会捕获到死路节点，但 `NO_PATH_TO_ENDING` 应该补充"存在无法到达结局的分支"语义。）

---

### LE-8 Validate：`handleDirectorReview` 失败时无错误提示
**文件**：`app/project/[id]/validate/page.tsx`  
**位置**：L73-94

`finally` 里只有 `setDirectorLoading(false)`。请求失败时 `review` 仍为 `null`，按钮恢复原状，用户不知道是否失败。

---

### LE-9 Validate：页面初始化时自动触发 AI 报告请求（无法取消或防抖）
**文件**：`app/project/[id]/validate/page.tsx`  
**位置**：L19-35

`useEffect` 在页面挂载时立即调用 `runValidation` 并发起 AI 报告请求，即使用户没有点任何按钮。虽然有 `AbortController`，但如果用户快速在页面间跳转，可能触发多次无用请求。更重要的是：这个 `useEffect` 依赖数组为空（`[]`），但它内部使用了 `project`，如果 `project` 更新（如从服务端同步），报告不会重新生成。

---

## Edge Cases（特殊情况未处理）

### EC-1 World：删除角色后，voiceProfiles 中的对应记录不清理
**文件**：`app/project/[id]/world/page.tsx`  
**位置**：`deleteCharacter` 调用（L204）

`deleteCharacter(ch.id)` 只从 store 删角色，但 `voiceProfiles` 是本地 state，`ch.id` 对应的条目不会删除。下次若有新角色恰好复用相同 id（`nanoid` 极小概率但理论存在），会显示错误的声音指纹。更直接的问题是内存中保留了无用数据。

---

### EC-2 Structure：`commitBranches` 中 title-based 模糊匹配可能关联错误节点
**文件**：`app/project/[id]/structure/page.tsx`  
**位置**：`resolveTargetId`（L162-169）

模糊匹配：`n.title.includes(targetNodeTitle) || targetNodeTitle.includes(n.title)`。如果有两个节点标题分别为"调查案发现场"和"发现"，AI 返回 `targetNodeTitle = "发现"`，模糊匹配会命中"调查案发现场"（因为它包含"发现"），产生错误的分支连接，且没有任何警告。

---

### EC-3 Structure：`generateBranches` 中 `nodeList` 可能为空
**文件**：`app/project/[id]/structure/page.tsx`  
**位置**：L124-155

当 `nodes` 参数为 `undefined` 且 `project!.nodes` 为空数组时，AI 会收到空的节点列表，生成无意义的分支数据，`nodeChoices` 可能是空数组，然后进入 `branch_preview` 展示空列表，再"通过"后不会有任何分支写入，但 `stage` 变为 `'edit'`——这是一个静默的失败流程。

---

### EC-4 Workshop：批量 AI 生成中途失败后进度条显示不准确
**文件**：`app/project/[id]/workshop/page.tsx`  
**位置**：`runBulkAi`（L180-244）

`catch { /* continue */ }` 捕获错误后继续执行，`setBulkProgress` 的 `done` 仍然递增，外层 toast 会报告"N 个节点已生成"，但实际上某些节点可能完全没有数据写入。用户会误认为所有节点都已完成。

---

### EC-5 Workshop：`useEffect` 中键盘事件处理在 `project` 为 `null` 时使用 `project?.nodes ?? []`
**文件**：`app/project/[id]/workshop/page.tsx`  
**位置**：L54-74

实际上 `if (!project)` 已在组件顶部返回，所以 `useEffect` 注册时 `project` 一定存在。但 `useEffect` 的依赖数组是 `[selectedId, project?.nodes]`，如果 `project` 在 effect 生命周期中变为 null（极端情况），`nodes` 会是 `undefined`，`findIndex` 会崩溃。低优先级但存在。

---

### EC-6 Persistence：`exportInk` 中 `inkVarName` 可能生成空字符串变量名
**文件**：`lib/persistence.ts`  
**位置**：L102-116

```ts
const inkVarName = (name: string) => name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
```

如果变量名全为中文字符，`inkVarName` 返回空字符串 `""`，生成的 Ink 代码会是 `VAR  = value`，这是无效的 Ink 语法，导出文件无法被 Ink 引擎解析。

---

### EC-7 Persistence：`exportInk` 中 `applyInkEffects` 对负号与减法歧义处理不完整
**文件**：`lib/persistence.ts`  
**位置**：L107

```ts
if (p.startsWith('-') && !p.includes('=')) return `~ ${inkVarName(p.slice(1))} = ${inkVarName(p.slice(1))} - 1`
```

若用户输入的 `variableEffects` 中有 `-trust` 这样的条目，`p.slice(1)` 为 `"trust"`，生成 `~ trust = trust - 1` 是正确的。但若输入 `--trust`（双负号），生成的变量名会是 `trust`（`slice(1)` 去掉一个 `-`），仍然可解析。问题在于整个 `effects` 解析基于逗号分隔，若用户输入带逗号的变量名（如 `a,b`），会被错误地拆分成两个 effect。

---

### EC-8 Validation Engine：`passRate` 计算公式存在缺陷
**文件**：`lib/validation/engine.ts`  
**位置**：L249-253

```ts
const deduction = errorCount + warningCount * 0.5
const passRate = Math.round(Math.max(0, ((total - deduction) / total) * 100))
```

`total` 是节点数量，`deduction` 是问题数量（与节点数量不在同一量纲）。若有 5 个节点但有 3 个 error 和 4 个 warning（比如大量重复选项、断链、死路），`deduction = 3 + 2 = 5`，`passRate = max(0, (5-5)/5*100) = 0`。但若有 100 个节点和 2 个 error，`passRate = (100-2)/100*100 = 98%`，看起来非常健康，即使这 2 个 error 是严重的死路或断链。分子分母混用节点数/问题数，语义不清晰，passRate 数值无实际参考意义。

---

## Missing Features（该有但没有的功能）

### MF-1 角色 CRUD 无防重复名称校验
`world/page.tsx` 中用户可以创建多个同名角色，后续 AI 调用（如 `character_voice`）使用角色名区分声音指纹，同名角色会相互覆盖 `voiceProfiles`（key 为 `ch.id` 所以不会直接冲突，但 AI prompt 中同名角色会造成混乱）。

### MF-2 Scale：无法手动编辑 AI 生成的方案内容
`scale/page.tsx` 只支持"选择"，不支持修改方案的 `chapterCount`、`totalNodes` 等数字，若用户对方案基本满意但需微调，只能整体重新生成。

### MF-3 Structure：Flow 视图无法导航到节点编辑
FlowView 中节点点击跳转不携带 `?node=` 参数（见 LE-4），实际上 Flow 视图完全无法用于导航到具体节点编辑，这是流程图最基础的交互功能缺失。

### MF-4 Workshop：无"未保存草稿"离开页面拦截
存在未 commit 的 `nodeDrafts` 时，用户点击顶部导航切换阶段，没有任何"你有未保存的草稿，确定离开吗？"提示，草稿直接丢失。

### MF-5 Validate：导出 JSON 只能导出，无法从 JSON 导入
`exportProjectJson` 只有导出，没有对应的导入功能。如果用户想把项目迁移到另一个浏览器（localStorage 不跨域/跨浏览器），或从备份恢复，没有导入入口。

### MF-6 整体：没有项目删除的数据清理
`persistence.ts` 的 `deleteProject` 只删除 localStorage 中的项目和索引条目，没有清理服务端数据（只有 POST，没有 DELETE API 调用）。

---

## Positive Findings（做得好的地方）

1. **World 的防重复渲染设计很细心**：用 `userEdited` ref 区分"初始化赋值"和"用户编辑"，避免了 form 同步到 store 的 effect 在初始化时误触发保存，这个细节处理得很干净。

2. **Structure 的两阶段确认流程设计合理**：先预览结构（struct_preview），确认后再生成分支（branch_preview），用户有两次机会看到 AI 输出并决定是否接受，而不是一次性写入，降低了 AI 输出质量差时的损失。

3. **Validation Engine 的防御性处理**：开头的 `safeNodes` 映射（L8-12）为外部导入的项目补全缺失字段，体现了对数据完整性的考虑。

4. **`commitBranches` 的顺序连接 fallback 逻辑**：为所有无出口的非结局节点自动添加"继续"连接，确保即使 AI 没有为某节点生成分支，流程仍然连通，这是个很实用的安全网。

5. **Persistence 的 debounce + localStorage 优先策略**：`loadProjectWithFallback` 先试服务端、fallback 到 localStorage，同时写入有 500ms debounce，避免频繁网络请求，架构思路合理。

6. **Workshop 的键盘导航**（j/k/ArrowUp/ArrowDown/Escape）：提升了功率用户的效率，实现简洁。

7. **EmotionArcChart 只在有足够数据时渲染**（`orderedNodes.length < 2` 时显示占位提示），避免了单点或空数据的 SVG 渲染问题。

---

## 测试建议（如何手工测试验证）

### 数据丢失类

1. **CB-1 草稿丢失**：选一个节点 → 点"AI 设计此节点" → 等待完成（看到草稿预览）→ **不点通过** → 按 F5 刷新 → 验证节点内容没有变化（正确），同时确认用户有无提示。

2. **CB-3 服务端覆盖**：在低速网络下（Chrome DevTools 节流为 Slow 3G）→ 打开项目页 → 在服务端响应返回前快速编辑 world 内容 → 等请求完成 → 检查内容是否被旧版本覆盖。

### 逻辑错误类

3. **LE-4 Flow 点击不导航**：structure 页切换到"流程图"视图 → 点击任意节点 → 验证跳转到 workshop 后没有选中该节点（应该选中）。

4. **LE-6 可达性误判**：创建节点 A→B→C，再创建孤立节点 D→B（D 没有任何节点指向它）→ 运行校验 → 检查 D 是否被标记为 UNREACHABLE（应该是，但 B 和 C 因为 D 的引用可能被误判为可达）。

5. **EC-6 中文变量名导出**：在 structure 的变量系统中添加一个变量，名称输入全中文如"信任度" → validate 页导出 `.ink` → 用文本编辑器打开，验证 VAR 声明是否合法（应该有 `VAR 信任度 = ...` 但 inkVarName 会把它变成 `VAR  = ...`）。

### 边界值类

6. **LE-2 时长输入 0**：world 页将"预期总时长"清空或输入 0 → 进入 validate → 运行校验 → 检查 SHORT_DURATION 是否出现（应触发但不会，因为 `targetMinutes > 0` 条件跳过）。

7. **EC-2 模糊匹配**：在 structure 创建两个节点，标题分别为"A 发现真相"和"发现"→ 触发 AI 生成分支 → 查看 `commitBranches` 时"发现"节点的连接是否正确（可通过 console.log 或直接看节点的 choices）。

8. **CB-4 Scale AI 失败**：用浏览器 DevTools 拦截 `/api/ai` 请求并返回 500 → scale 页 → 验证是否有错误提示（应有，实际没有）。

### 批量操作类

9. **EC-4 批量生成部分失败**：在 DevTools 中让部分 AI 请求失败（可用请求拦截随机 block 50% 请求）→ 运行"批量 AI 设计全部节点"→ 等完成后检查 toast 提示的节点数与实际有内容的节点数是否一致。

---

**报告覆盖情况确认**：
- [x] Phase 1：世界锚点（world/page.tsx）
- [x] Phase 2：规模规划（scale/page.tsx）
- [x] Phase 3：结构编辑（structure/page.tsx + FlowView.tsx）
- [x] Phase 4：场景填充（workshop/page.tsx）
- [x] Phase 5：校验（validate/page.tsx）
- [x] Validation Engine（lib/validation/engine.ts）
- [x] Persistence（lib/persistence.ts）

---

## Cycle 2 验证记录

审查时间：2026-04-04  
审查人：Scout（QA）

### Cycle 1 变更验证

**Nova / Branches 页面**：通过

- 5 个模块均存在：统计卡片（Module 1）、节点类型分布（Module 2）、路径分析（Module 3）、分支节点详情表格（Module 4）、网络健康检测（Module 5）。
- DFS 路径查找有完整防护：`visited: Set<string>` 防止无限循环，`if (paths.length > 50) return` 限制最多 50 条路径。
- 空状态处理完整：`project` 为 null 时显示"加载中..."；`nodes.length === 0` 时显示引导页（含跳转到结构编辑的链接）；路径分析无 start 节点时显示提示文字；无路径到结局时显示"没有找到通向结局的路径"。
- 注：健康检测中的"无法到达节点"逻辑（L123）仍使用"是否有任何边指向它"的旧判断，与 engine.ts 同源问题。该页面为展示用途，未修复（不影响核心校验逻辑）。

**Muse / Workshop 改进**：通过

- `nodeCompleteness` 函数存在（L15-22），4 维评分：sceneDesc 长度、dialogue 行数、tension 是否填写、choices 是否有出口。
- `speakerColor` 函数存在（L24-28），基于角色名 charCode hash 映射到 6 种颜色。
- `SceneDescHint` 组件存在（L850-855），提供三档字数提示：0 字不显示、<60 字显示建议提示（`建议 60+ 字以呈现镜头感`）、60-120 字显示 `✓ N 字`、>120 字显示 `✓ N 字 · 场景感充足`。

**Core / Scale 增强**：通过

- 方案对比表格：`CompareTable` 组件存在（L87-99），包含章数/总节点数/分支数/预估工时 4 行对比数据。
- 章节大纲折叠：`PlanCard` 内部有 `chaptersOpen` 状态控制折叠，点击"▶ 章节大纲（N 章）"按钮展开，使用 `e.stopPropagation()` 防止误触发方案选择，样式使用 amber 主色系边框线。

### 新修复的问题

**LE-6 可达性检测**：已修复

- 文件：`lib/validation/engine.ts`，L44-73
- 修复内容：将原来"收集所有 choice.targetNodeId"的错误逻辑替换为 BFS 遍历。从 start 节点（无 start 则 fallback 到第一个节点）出发，用队列广度优先遍历所有真正可达的节点，存入 `reachable` Set 后再做 UNREACHABLE 检测。
- 修复基于 Cycle 2 最新版本的 engine.ts（含 Core 的 `passRate` 和 `canReachEnding` 修改），未覆盖其他改动。
- 错误提示文案同步更新为"从开场节点出发没有任何路径到达它"，语义更准确。

### 剩余需要 Cycle 3 处理的问题

以下问题在 Cycle 1 QA 报告中已记录，尚未修复：

- **CB-1**：Workshop AI 草稿未保存时刷新页面草稿丢失（无 beforeunload 弹窗拦截——代码中已有 beforeunload handler 但仅阻止刷新，不阻止路由跳转）
- **CB-2**：Structure `commitBranches` 绕过 React 批量更新的隐性死路风险
- **CB-3**：Persistence 服务端数据覆盖本地最新改动（无 `updatedAt` 版本比对）
- **LE-4**：FlowView 节点点击不携带 `?node=` 参数（跳转后不选中对应节点）
- **LE-7**：`NO_PATH_TO_ENDING` 语义不完整（只检测"有无通路"，不检测"是否存在无法到结局的分支"）
- **EC-6**：`exportInk` 中文变量名被 `inkVarName` 清空为空字符串，生成无效 Ink 语法
- **Branches 健康检测**：页面内联的"无法到达"判断未同步 BFS 修复（低优先级，校验页 engine.ts 已修复）
