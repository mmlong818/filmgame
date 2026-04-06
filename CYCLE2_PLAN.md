# Cycle 2 开发计划

> 基于对 Cycle 1 代码库的架构审查（审查日期：2026-04-04）
> 审查范围：types/project.ts、projectStore.ts、persistence.ts、world/page.tsx、structure/page.tsx、validate/page.tsx、workshop/page.tsx、validation/engine.ts、API route

---

## 1. 关键 Bug 修复（必须，影响正确性）

- [ ] **`canReachEnding` 无深度限制，环形图死循环**
  - 文件：`lib/validation/engine.ts` L121-129
  - 问题：`visited` 集合在递归时以 `new Set(visited)` 传入，导致对同一路径的不同分支各自维护独立 visited，组合爆炸。大型环形图（>50节点）可能造成调用栈溢出或浏览器卡死。
  - 修复方向：改为迭代 BFS，或对 visited 做全局传递而非每次复制。

- [ ] **`commitBranches` 内部直接调用 `useProjectStore.getState()`（L204, L210）**
  - 文件：`app/project/[id]/structure/page.tsx`
  - 问题：在 `set()` 回调外部调用 getState().updateNode() 会绕过 Zustand 的批量更新机制，每次 updateNode 触发一次独立 render + localStorage 写入，N 个节点产生 N 次保存。
  - 修复方向：收集所有变更后调用一次 `bulkSetStructure` 或批量 patch。

- [ ] **`loadProjectWithFallback` 在服务端调用时静默返回 null 但不报告**
  - 文件：`lib/persistence.ts` L24-39
  - 问题：fetch 失败后 fallback 到 localStorage，但 localStorage 在 SSR 环境返回 null（L10-13 的 typeof window 检查），导致 server-side 调用始终返回 null 且没有任何错误提示。
  - 实际影响：若未来加入 server component，项目加载会静默失败。

- [ ] **`goToPhase` 缺少 `updatedAt` 更新，导致 `saveProject` 写入旧时间戳**
  - 文件：`lib/store/projectStore.ts` L162-168
  - 问题：`goToPhase` 调用 `saveProject(p)` 但 p 的 `updatedAt` 未刷新，与其他 action 不一致。

- [ ] **`validate/page.tsx` useEffect 在 mount 时无条件调用 AI fetch**
  - 文件：`app/project/[id]/validate/page.tsx` L19-35
  - 问题：每次进入 validate 页面都会自动触发 `runValidation` + AI fetch，没有任何 loading 状态指示，用户不知道后台在请求。如果 AI API 慢，页面看起来是空的，用户会反复刷新。
  - 修复方向：显示"正在生成 AI 建议..."的加载状态，或改为手动触发。

---

## 2. 类型安全增强

- [ ] **`AiReview` 接口定义在 world/page.tsx 组件内部（L7-14），应提升到 types 层**
  - 与 API 返回类型完全解耦，无法被其他文件复用或做运行时校验。

- [ ] **`commitStructure` 将 `node.type` 直接 `as NodeType` 强转（L111）**
  - 文件：`app/project/[id]/structure/page.tsx` L111
  - AI 返回的 type 字符串未做合法性校验，传入非法值（如 `"dialogue"`）会绕过 TypeScript 静默写入。
  - 修复方向：加一个 `isValidNodeType(t: string): t is NodeType` guard。

- [ ] **`validation/engine.ts` 用 `(node as Record<string, unknown>).exploreReturnNodeId`（L16）**
  - 完全绕过类型系统。`StoryNode` 已有 `exploreReturnNodeId?: string` 字段，直接使用 `node.exploreReturnNodeId` 即可。

- [ ] **`Project.directorReview` 字段双重可选（`DirectorReview | null` + `?:`）**
  - 文件：`lib/types/project.ts` L185
  - `directorReview?: DirectorReview | null` 导致该字段有三个有效状态（undefined / null / 对象），消费侧需要双重检查。统一为 `directorReview: DirectorReview | null` 并在 `createEmptyProject` 中初始化为 null。

- [ ] **`WorldPage` 中 `voiceProfiles` 的类型内联嵌套（L26-32），应提取为具名接口**
  - 现在 `Record<string, { speaking_rhythm: string; ... }>` 散落在组件中，与 AI 返回格式无 schema 绑定。

---

## 3. UX 改进（高价值）

- [ ] **layout.tsx：`loadProject` 失败后直接 `router.push('/')` 无任何错误说明**
  - 文件：`app/project/[id]/layout.tsx` L21-22
  - 用户打开分享链接或书签时，项目不存在会被无声地踢回首页，完全不知道发生了什么。
  - 改进：显示"项目不存在或已被删除"的错误页，提供"导入 JSON"入口。

- [ ] **structure/page.tsx：AI 生成阶段（struct_loading / branch_loading）没有取消按钮**
  - AI 请求可能挂起数十秒，用户无法中断，只能刷新页面（会丢失状态）。
  - 改进：加 AbortController + "取消"按钮，取消后回到 edit 状态。

- [ ] **validate/page.tsx：validation 问题的"去修复"跳转只传第一个 relatedId**
  - `router.push('/project/.../workshop?node=relatedIds[0]')`，但 workshop 页打开后需要用户自己找到对应节点。
  - 改进：workshop 页已有 `nodeSearch` 状态，跳转时自动定位并高亮对应节点。

- [ ] **world/page.tsx：`voiceProfiles` 状态存在本地 React state，刷新后丢失**
  - AI 声音指纹是有价值的角色信息，应持久化到 `Character` 类型或 project 中。
  - 改进：在 `Character` 接口增加可选 `voiceProfile` 字段并通过 `updateCharacter` 保存。

- [ ] **structure/page.tsx：重置确认 UI 与主操作区混排（L363-370），容易误触**
  - confirmReset 二次确认按钮出现在顶部操作栏，与"添加章"等正常操作并列，高风险。
  - 改进：改为 Modal 对话框形式，明确说明"所有节点和分支将被清空"。

- [ ] **phase 导航无进度百分比**
  - 用户只知道当前在哪个阶段，不知道整体完成度（如"Workshop 已完成 12/30 个节点"）。
  - 改进：在 tab 旁边显示简洁进度徽章。

---

## 4. 叙事工具完整性

- [ ] **搜索功能：在节点/对白中搜索关键词**
  - 当前 workshop 页有 `nodeSearch` state（L43）但只过滤节点标题，没有全文搜索对白内容。
  - 需要：跨节点搜索节点标题 + 对白文本 + 场景描述，结果高亮显示匹配行。

- [ ] **变量使用导览：显示哪些节点读取/写入了特定变量**
  - 当前 `Variable` 对象（types/project.ts L119-125）有 `name`/`type`/`defaultValue`，但没有任何反向索引。
  - `systemFunction.variablesRead` / `variablesWrite`（L72-74）存储的是变量名字符串，和 `Variable.id` 没有绑定关系，重命名变量后会产生悬空引用。
  - 需要：① 变量引用改为 id 而非 name；② 变量详情面板显示所有引用该变量的节点列表。

- [ ] **角色弧线视图：追踪某角色在各路径中的出现和成长**
  - 当前无任何机制追踪"某角色在哪些节点登场"。`DialogueLine.speaker` 是自由文本，与 `Character.name` 没有 id 绑定。
  - 需要：① `DialogueLine.speakerId` 可选字段关联 `Character.id`；② 角色视图显示该角色作为 speaker 出现的所有节点，按章幕排列，可点击跳转。

- [ ] **时间线可视化：各分支路径的时间跨度**
  - `StoryNode.durationSeconds` 已存在，但没有任何地方展示"主路径总时长" vs "各分支路径时长"的对比。
  - 需要：在 validate 页或 structure 页，计算从 start 到每个 ending 的各路径 durationSeconds 累计，显示为路径时长分布图。

- [ ] **选择后果追踪：`Choice.variableEffects` 是自由文本字符串**
  - 文件：`lib/types/project.ts` L92 + `lib/persistence.ts` L103-115（ink 导出解析逻辑）
  - 自由文本格式（`"+trust,-fear,flag=1"`）与 ink 导出解析器强耦合，且无法做类型校验或 UI 辅助输入。
  - 需要：结构化 `VariableEffect` 类型（`{ variableId: string; op: '+' | '-' | '='; value: number | string }`），提供 UI 下拉选择变量 + 操作符，消除 ink 导出时的手动字符串解析。

- [ ] **探索节点内容缺乏编辑支持**
  - `exploreReturnNodeId` 字段在 workshop 页没有专门的编辑 UI，编剧无法在 workshop 阶段修改探索节点的返回目标。

---

## 5. 性能优化

- [ ] **localStorage 存储上限风险**
  - `saveProject` 每次操作后同步写入完整 project JSON（persistence.ts L67-77）。
  - 对话线丰富的大型项目（50节点 × 10行对白 × 角色声音指纹）JSON 体积可达 500KB+，localStorage 总配额通常 5-10MB，多个项目并存时容易触发 QuotaExceededError。
  - 当前有 catch 但只打 console.error，用户无感知。
  - 优化方向：① toast 提示存储失败；② 提供"清理旧项目"入口；③ 对话内容考虑分片存储或压缩（LZ-string）。

- [ ] **Zustand store 所有操作都重渲染整个 project**
  - 每个 `set((s) => ...)` 返回 `{ project: newProject }`，所有订阅 `project` 的组件全部重渲染。workshop 页 sidebar 每次编辑对白都会重新渲染整个节点列表。
  - 优化方向：拆分 store 订阅（`useProjectStore(s => s.project.nodes)` → 各节点独立 selector），或使用 `zustand/shallow`。

- [ ] **EmotionArcChart 每次渲染都线性遍历所有 chapter/act/node（validate/page.tsx L300-308）**
  - O(chapters × acts × nodes) 的三层嵌套 filter，节点数大时影响渲染性能。
  - 优化方向：在 store 中缓存 orderedNodes，或用 useMemo 包裹。

- [ ] **`syncToServer` debounce 500ms，但 saveProject 本身是同步的**
  - persistence.ts L56-65：localStorage 写入是同步阻塞的，大 JSON 写入（>200KB）在主线程执行，可能阻塞 UI 输入响应。
  - 优化方向：考虑 Web Worker 做序列化，或限制单次保存 JSON 大小。

- [ ] **structure/page.tsx `commitBranches` 中 `orderedNodes` 通过三层 sort+filter 构建（L197-200）**
  - 每次调用都重新遍历，应提取为 selector 或 memoized 函数。

---

## 6. 风险提示

### 架构风险

**双存储一致性问题（高风险）**
localStorage 和服务器文件（`data/projects/{id}.json`）是两套独立存储。`loadProjectWithFallback` 优先读服务器，写入时 localStorage 先同步写、服务器 500ms debounce 后异步写。用户在 debounce 窗口关闭标签页时，localStorage 已更新但服务器未写入，下次从另一台设备（或清除 localStorage 后）访问时数据丢失。当前没有任何版本冲突检测机制。

**变量引用使用名称而非 ID（高风险）**
`systemFunction.variablesRead/variablesWrite` 存储的是 `string[]`（变量名），`Choice.variableEffects` 是自由格式字符串，均与 `Variable.id` 无绑定。重命名变量不会触发任何更新，项目完整性校验（validation engine）也不检查此类悬空引用。随着项目规模增大，这是最容易产生隐患的数据一致性漏洞。

**schemaVersion 字段存在但无迁移逻辑**
`createEmptyProject` 写入 `schemaVersion: 1`，但 `loadProject` / `loadProjectWithFallback` 读取后没有任何版本检查或字段迁移代码。未来添加新必填字段时，老项目加载后会产生 undefined 访问。

### 叙事完整性风险

**`DialogueLine.speaker` 是自由文本**
与 `Character.name` 完全解耦，角色重命名不会同步到对白。大型项目中同一角色可能有多种拼写（"李明"/"李 明"/"LiMing"），角色弧线视图无法准确归因。

**Ink 导出的变量效果解析脆弱**
`persistence.ts` L103-115 的 `applyInkEffects` 函数通过简单字符串 split/prefix 解析 `variableEffects`，格式约束仅靠注释说明，无 schema 保护。编剧输入稍有偏差（如空格、全角字符）即产生错误 ink 代码且无任何提示。
