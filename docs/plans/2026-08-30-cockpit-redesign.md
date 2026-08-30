# 实施计划：驾驶舱升级 × 编剧房间视觉语言（2026-08-30）

对应需求：`docs/requirements.md`（v0.5.0 基线）之上的体验层升级。
分支：`feat/cockpit-redesign`。数据层 / AI 服务端 / 校验引擎不动。

## 视觉语言：编剧房间（Writers' Room）

隐喻体系：软木板（应用外壳）· 索引卡（列表项）· 打字机稿纸（编辑区）·
朱批（危险/当前）· 便签（AI 的固定形态）· 纸胶带（章节/项目标签）。

### Token（`app/globals.css` @theme，已就绪）

| 语义 | Tailwind 类 | 用途 |
|------|------------|------|
| paper / paper-dim | `bg-paper` `bg-paper-dim` | 稿纸/卡片面、悬停 |
| kraft / kraft-deep | `bg-kraft` | 软木板底（外壳背景用 `.corkboard` 类） |
| line / line-soft | `border-line` `border-line-soft` | 实线边框 / 弱分隔 |
| ink / ink-soft / pencil | `text-ink` `text-ink-soft` `text-pencil` | 主文/次级/辅助 |
| vermilion | `text-vermilion` 等 | 朱红：主动作、当前项、危险 |
| inkblue | `text-inkblue` | 墨蓝：链接、条件、信息 |
| leaf / amberink | `text-leaf` `text-amberink` | 成功 / 警示 |
| sticky / sticky-green | `bg-sticky` | 便签黄（AI 批注）/ 绿（任务） |

字体类：`.courier`（剧本体 Courier Prime）、`.hand`（手写体，仅便签标题/短批注）。
工具类：`.corkboard` `.paper-sheet` `.paper-sheet-ruled` `.pin/.pin-red` `.tape-label` `.skeleton`。
阴影：`var(--shadow-card)` `var(--shadow-card-lift)` `var(--shadow-sticky)`。

### 硬规则

1. **禁止** gray/zinc/slate/amber 等字面色类——一律语义 token。
2. **禁止**内联 onMouseEnter/onMouseLeave 改 style 做 hover——用 CSS hover 类。
3. 节点类型的文案与配色只从 `lib/ui/nodeTypes.ts` 取（或 `<NodeTypeBadge>`）。
4. 圆角克制：卡片/按钮直角或 2-3px；便签、图钉是唯一装饰倾斜元素。
5. 中文 UI 文案；代码标识符/路径保持原样。

## 交互基建（已就绪，换装时必须接入）

| 能力 | 入口 | 用法 |
|------|------|------|
| AI 动作状态机 | `lib/hooks/useAiAction.ts` | `const ai = useAiAction(); ai.run('撰写对白', signal => aiJson(...))`；渲染 `ai.loading / ai.error / ai.cancel / ai.retry` |
| AI 请求 | `lib/ai/client.ts` 的 `aiJson(phase, action, ctx, signal)` | 失败抛 `AiActionError`（含 errorType/runId），`formatAiError` 已产出中文引导 |
| 两步确认 | `app/components/ui/confirm.tsx` `<ConfirmButton onConfirm>` | 替代一切手写删除确认 |
| 模态 | `app/components/ui/modal.tsx` | Esc/焦点圈定/aria 已内置 |
| Toast | `useToast().toast(msg, type, { action })` | 删除后给「撤销」action → `undo()`（`lib/store/history`） |
| 撤销 | `lib/store/history.ts` | 破坏性 store action 已自动压栈；⌘Z 全局生效 |
| 骨架屏 | `app/components/ui/skeleton.tsx` | 替代「加载中...」文字 |
| 输入 | `app/components/ui/input.tsx` | 统一 inputClass；高频字段配合 `lib/hooks/useBufferedField` |

### 路由约定（命令面板依赖）

- `/project/[id]/workshop?node=<nodeId>`：工坊页打开时选中该节点。
- `/projects?new=1`：项目列表页打开时弹出新建模态。

## 逐页任务

- [x] 阶段 0：token 系统 + ui 组件库 + nodeTypes 单一来源 + Toast 升级
- [x] 阶段 1：AbortController 全线 + errorType 引导 + ⌘K + undo/redo
- [ ] 项目壳 `app/project/[id]/layout.tsx` + 首页 + save-status + ai-settings-modal
- [ ] 项目列表 `app/projects/page.tsx`（卡片墙 + 搜索 + ?new=1）
- [ ] world（6 个 AI 动作错误可见化 + 角色输入缓冲 + 骨架屏）
- [ ] scale（卡片键盘可达 + useAiAction + 骨架屏）
- [ ] structure（流式进度条 + 生成可取消 + FlowView 配色接 nodeTypes）
- [ ] workshop（软木板侧栏 + 稿纸编辑区 + 便签 AI + ?node= + 8 动作接 useAiAction）
- [ ] validate（director_review 补 catch + 严重度分组折叠 + 图表配色）
- [ ] preview（组件级真主题替换 globals.css 的 62 行覆写 hack）
- [ ] 收尾：删除 globals.css 遗留区与 art-deco.tsx、`/branches` 接入入口、响应式基线、验收

## 验收基准

`pnpm tsc --noEmit` 零错误；`pnpm build` 成功；
全流程手工走通：登录 → 项目列表 → 五阶段 → 预览；AI 动作可取消、失败有引导有重试；
删除类操作可 ⌘Z 撤销；⌘K 可跳阶段与检索节点。
