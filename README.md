# 猫叔的互动影游创作系统

[English](README_EN.md) · 中文

> 从一句故事核心，到可交付的互动影游剧本。AI 全程协作，编剧主导创意。

![Tech Stack](https://img.shields.io/badge/Next.js-16.2-black) ![React](https://img.shields.io/badge/React-19-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8) ![Version](https://img.shields.io/badge/Version-0.5.0-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1) ![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F) ![LangChain](https://img.shields.io/badge/LangChain-LangGraph-1C3C3C)

![homepage](public/screenshots/homepage.jpeg)

---

## 什么是猫叔的互动影游创作系统？

这是一款面向编剧和互动叙事设计师的 AI 辅助创作工具。它将互动影游的创作流程拆解为 **5 个阶段**，在每个阶段提供 AI 协作，让创作者始终保持对故事的主导权。

---

## 5 阶段工作流

### 阶段一：世界锚点

定义故事核心、主题、世界规则与主要角色。AI 可一键审查内容一致性、生成角色建议、设计结局方向。

![世界锚点](public/screenshots/world.jpeg)

---

### 阶段二：规模规划

选择项目体量——精简版 / 标准版 / 史诗版，AI 生成三套完整方案并估算创作工时，一键确认后进入结构设计。

![规模规划](public/screenshots/scale.jpeg)

---

### 阶段三：结构与分支

**列表视图**：按章→幕→节点的层级管理全部叙事节点，支持添加、排序、设置类型（开场/分支/推进/探索/结局）。AI 生成叙事骨干时会流式展示实时进度（骨干完成→逐章生成第 N/共 M 章）。

![结构列表](public/screenshots/structure-list.jpeg)

**流程图视图**：基于 @xyflow/react 的可视化叙事地图，节点自动布局，悬停高亮路径，拖拽自由排列；手动拖拽调整过的节点位置会持久化保存，刷新页面后布局不丢失。

![结构流程图](public/screenshots/structure-flow.jpeg)

---

### 阶段四：场景工坊

逐节点填充场景描述、情感弧、对白。左侧节点树一览全局进度，右侧工作区 AI 可一键撰写对白、填充情感、建议选项分支。角色声纹卡记录说话节奏、词汇习惯、压力下的防御机制等特征，让每个角色的台词风格保持一致；单节点支持用一句话指令让 AI 按需修改对白；批量 AI 精修可选范围（全部节点 / 当前章 / 当前幕），并展示预计耗时和失败重试清单。

![场景工坊](public/screenshots/workshop.jpeg)

![场景工坊-对白](public/screenshots/workshop2.jpeg)

---

### 阶段五：全局校验

自动检测 10 类结构问题（孤立节点、断连结局、情感浅化、变量断链、分支死路等），生成情感曲线、路径时长分布图、叙事地图，支持导出 JSON / ink 格式。此外可一键触发「五位专家导演终审」，从不同视角给出评分、必须修改项与高光时刻点评。

![全局校验](public/screenshots/validate.jpeg)

---

### 预览播放

任意阶段均可点击「预览」实时体验完整交互剧情，支持变量追踪、情感面板、历史路径回溯，无需离开创作环境；点击「返回上一步」时变量状态会正确回滚到该步之前的快照，不会残留已执行过的选项效果。

![预览播放](public/screenshots/preview.jpeg)

---

## 快速开始

### 环境要求

- Node.js 24+（`scripts/` 下的脚本用原生 TypeScript 直接运行，无需额外编译步骤）
- Docker（本地跑 Postgres 17；无 Docker 也可用托管数据库替代，见下文）
- [Claude CLI](https://claude.ai/download)（可选，仅当 AI provider 选择「Claude CLI」本地模式时需要，已登录、`claude` 命令可用）

### 安装运行

```bash
git clone https://github.com/mmlong818/filmgame.git
cd filmgame
pnpm install                # 或 npm install

cp .env.local.example .env.local
# 编辑 .env.local：设置登录密码 APP_PASSWORD；
# AUTH_SECRET / ENCRYPTION_KEY 各生成一个不同的 32 字节 hex：
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

pnpm db:up                  # 启动本地 Postgres 17 容器
pnpm db:migrate             # 建表
pnpm db:seed                # 插入示例项目，方便直接打开看效果

pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)，用 `APP_PASSWORD` 登录后，从项目列表选择示例项目、创作模板，或直接新建空项目开始。

没有 Docker、想用托管数据库（Neon）替代本地容器，或需要生产部署（Vercel / VPS）的具体步骤，见 [docs/db-setup.md](docs/db-setup.md)。

---

## 认证与数据可靠性

- **单密码登录**：面向自用部署设计，登录页只需输入 `.env.local` 中配置的 `APP_PASSWORD`，无需注册账号体系；会话以签名 cookie 保存。
- **Postgres 为唯一数据源**：不再依赖 localStorage 或本地 JSON 文件持久化项目数据，浏览器缓存仅作乐观展示和离线兜底。
- **自动保存**：保存粒度细化到单个节点级别，写入采用乐观锁（version 校验），多个标签页同时编辑同一项目时会提示版本冲突；断网时的写入会进入本地队列，恢复网络后自动续传；关闭页面前会自动冲刷未落库的改动，避免丢失。
- **API Key 加密存储**：BYOK 场景下用户填入的第三方 API Key 经 AES-256-GCM 加密后落库，不以明文保存。

---

## AI 集成

### AI 双模式

每个项目可在顶栏随时切换两种 AI 生成模式，切换后续的 AI 动作按新模式执行：

| 模式 | 说明 |
|------|------|
| ⚡ **快速模式** | 轻量模型、关闭深度思考，适合先快速搭建骨架 |
| 🧠 **思考模式**（默认） | 深度推理，质量优先，单次生成约 1-10 分钟 |

典型流程是快速搭骨架 → 切到思考模式重构精修。两个模式各自使用的模型可在设置页分别指定（留空则按 provider 给默认值）。

### AI Provider

filmgame 支持多种 AI 接入方式，在设置页面切换：

| 模式 | 说明 |
|------|------|
| **Claude CLI**（默认） | 无需 API Key，使用已登录的 Claude 订阅账号，`claude --print` 调用；仅本地模式（`DEPLOY_MODE=local`）可用，生产部署（`DEPLOY_MODE=deploy`）会禁用此项 |
| **Anthropic API** | 填入 API Key，直连官方接口 |
| **OpenAI API** | 填入 API Key，使用 GPT 系列模型 |
| **Google Gemini API** | 填入 API Key，使用 Gemini 系列模型 |
| **自定义端点** | 任意 OpenAI 兼容接口（本地部署、中转等） |

支持的 AI 阶段和动作（共 19 项，定义于 `lib/ai/schemas.ts` 的 `SCHEMA_REGISTRY`）：

| Phase | Action | 说明 |
|-------|--------|------|
| `world` | `review`, `fix_issues`, `suggest_characters`, `suggest_variables`, `endings_design` | 世界观相关 |
| `scale` | `generate` | 规模方案生成 |
| `structure` | `spine`, `chapter` | 叙事骨干和章节结构 |
| `branches` | `generate` | 分支连接拓扑 |
| `workshop` | `fill_emotion`, `write_dialogue`, `revise_dialogue`, `suggest_choices`, `scene_analysis`, `scene_tension`, `character_voice`, `choice_consequence` | 节点内容创作与精修 |
| `validate` | `report`, `director_review` | 全局审查、五位专家导演终审 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.2 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 状态管理 | Zustand v5 |
| 流程图 | @xyflow/react v12 |
| AI 编排 | LangChain / LangGraph，LangSmith 可观测性（可选） |
| AI Provider | Claude CLI / Anthropic / OpenAI / Gemini / 自定义端点 |
| 数据库 | PostgreSQL 17 + Drizzle ORM |
| 语言 | TypeScript 5 |

---

## 项目结构

```
filmgame/
├── app/
│   ├── api/auth/        # 登录/登出（单密码 + 签名会话 cookie）
│   ├── api/ai/          # AI 网关（LangChain/LangGraph 调度各 provider）
│   ├── api/projects/    # 项目 CRUD API（含单节点保存端点）
│   ├── api/settings/    # BYOK API Key 读写（AES-256-GCM 落库）
│   └── project/[id]/    # 5个阶段页面
│       ├── world/       # 世界观
│       ├── scale/       # 规模
│       ├── structure/   # 结构
│       ├── workshop/    # 工坊
│       └── validate/    # 验收
├── lib/
│   ├── ai/              # LangChain provider 适配、prompt 模板、schemas（SCHEMA_REGISTRY）
│   ├── db/              # Drizzle schema 与仓储层
│   ├── server/          # 加密、会话签名、鉴权
│   ├── store/           # Zustand 状态管理
│   ├── types/           # TypeScript 类型定义
│   ├── validation/      # 10类校验引擎（BFS）
│   └── persistence.ts   # 客户端自动保存（乐观锁 + 离线队列）
├── drizzle/             # 数据库迁移 SQL（drizzle-kit 生成）
├── docker-compose.yml   # 本地 Postgres 17 容器
└── scripts/seed-db.mjs  # 示例项目种子脚本
```

---

## License

版权所有 © 2026 猫叔（[mmlong818](https://github.com/mmlong818)）

本项目源代码可用于个人学习与非商业研究，但**任何形式的使用、修改或再分发，须在显著位置保留原始作者署名及本版权声明**。未经书面授权，不得将本软件或其衍生版本用于商业用途。

---

## Contributors

- [mmlong818](https://github.com/mmlong818) — 作者与维护者
