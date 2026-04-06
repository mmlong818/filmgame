# 猫叔的互动影游创作系统

> 从一句故事核心，到可交付的互动影游剧本。AI 全程协作，编剧主导创意。

![Tech Stack](https://img.shields.io/badge/Next.js-16.2-black) ![React](https://img.shields.io/badge/React-19-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8)

---

## 什么是猫叔的互动影游创作系统？

这是一款面向编剧和互动叙事设计师的 AI 辅助创作工具。它将互动影游的创作流程拆解为 **5 个阶段**，在每个阶段提供 AI 协作，让创作者始终保持对故事的主导权。

### 5 阶段工作流

```
世界观 → 规模 → 结构 → 工坊 → 验收
(World)  (Scale) (Structure) (Workshop) (Validate)
```

| 阶段 | 做什么 | AI 能力 |
|------|--------|---------|
| **世界观** | 定义故事核心、主题、世界规则、角色 | 审查一致性、建议角色、设计结局 |
| **规模** | 选择体量（精简/标准/史诗） | 生成三套方案，估算工作量 |
| **结构** | 生成章节→幕→节点拓扑图 | 骨干设计、分支连接 |
| **工坊** | 逐节点填充场景、对白、情感弧 | AI 撰写对白、建议选项 |
| **验收** | 全局校验、路径分析、结局可达性 | 8 类问题检测、路径时长分布 |

---

## 核心特性

- **节点流程图**：基于 @xyflow/react 的可视化叙事地图，节点拖拽、连线一目了然
- **变量系统**：支持数值/布尔/枚举变量，节点读写变量驱动分支逻辑
- **角色弧线**：在工坊侧栏查看每个角色在全剧中的出场轨迹
- **路径时长分布**：DFS 计算所有可达结局，柱状图展示各路径时长
- **BFS 可达性检测**：自动发现孤立节点、死路、断连结局
- **双端存储**：localStorage（客户端实时）+ `/data/projects/*.json`（服务端持久化）

---

## 示例项目：量子侦探

项目内置示例——**《量子侦探》**，一部科幻悬疑互动影游：

> 一名失忆的量子物理学家在平行宇宙间穿梭，试图找回记忆，却发现每个自己都做出了截然不同的选择。

- **规模**：3章 9幕 63节点
- **结局**：3条路径（遗忘·重建 / 融合·新生 / 归零·延续）
- **角色**：林宇（主角）、阿尔法（反派/镜像自我）、陈晓（支线）
- **已填充**：54个节点完整对白和情感设计

---

## 快速开始

### 环境要求

- Node.js 18+
- [Claude CLI](https://claude.ai/download)（已登录，`claude` 命令可用）

### 安装运行

```bash
git clone https://github.com/mmlong818/filmgame.git
cd filmgame
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 加载示例项目

**无需任何操作。** 启动服务后打开 [http://localhost:3000](http://localhost:3000)，项目列表会自动从服务端同步《量子侦探》示例项目。

### 生成新的种子项目

```bash
node seed-project.mjs
```

> 需要 Next.js 服务运行中，耗时约 20-40 分钟（全量 AI 生成）

---

## AI 集成

filmgame 通过 Claude CLI 调用 AI，**无需 API Key**，使用你已登录的 Claude 账号：

```
POST /api/ai → child_process.spawn('claude', ['--print', ...])
```

支持的 AI 阶段和动作：

| Phase | Action | 说明 |
|-------|--------|------|
| `world` | `review`, `suggest_characters`, `suggest_variables`, `endings_design` | 世界观相关 |
| `scale` | `generate` | 规模方案生成 |
| `structure` | `spine`, `chapter` | 叙事骨干和章节结构 |
| `branches` | `generate` | 分支连接拓扑 |
| `workshop` | `fill_emotion`, `write_dialogue`, `suggest_choices`, `revise_dialogue` | 节点内容创作 |
| `validate` | `review` | 全局审查 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.2 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 状态管理 | Zustand v5 |
| 流程图 | @xyflow/react v12 |
| AI | Claude CLI (claude --print) |
| 存储 | localStorage + 本地 JSON 文件 |
| 语言 | TypeScript 5 |

---

## 项目结构

```
filmgame/
├── app/
│   ├── api/ai/          # AI 网关（调用 Claude CLI）
│   ├── api/projects/    # 项目 CRUD API
│   └── project/[id]/    # 5个阶段页面
│       ├── world/       # 世界观
│       ├── scale/       # 规模
│       ├── structure/   # 结构
│       ├── workshop/    # 工坊
│       └── validate/    # 验收
├── lib/
│   ├── ai/prompts.ts    # 所有 AI prompt 模板
│   ├── store/           # Zustand 状态管理
│   ├── types/           # TypeScript 类型定义
│   └── validation/      # 8类校验引擎（BFS）
├── data/projects/       # 服务端项目存储
└── seed-project.mjs     # 示例项目生成器
```

---

## License

MIT
