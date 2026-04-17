# 猫叔的互动影游创作系统

[English](README_EN.md) · 中文

> 从一句故事核心，到可交付的互动影游剧本。AI 全程协作，编剧主导创意。

![Tech Stack](https://img.shields.io/badge/Next.js-16.2-black) ![React](https://img.shields.io/badge/React-19-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8)

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

**列表视图**：按章→幕→节点的层级管理全部叙事节点，支持添加、排序、设置类型（开场/分支/推进/探索/结局）。

![结构列表](public/screenshots/structure-list.jpeg)

**流程图视图**：基于 @xyflow/react 的可视化叙事地图，节点自动布局，悬停高亮路径，拖拽自由排列。

![结构流程图](public/screenshots/structure-flow.jpeg)

---

### 阶段四：场景工坊

逐节点填充场景描述、情感弧、对白。左侧节点树一览全局进度，右侧工作区 AI 可一键撰写对白、填充情感、建议选项分支。

![场景工坊](public/screenshots/workshop.jpeg)

![场景工坊-对白](public/screenshots/workshop2.jpeg)

---

### 阶段五：全局校验

自动检测 8 类结构问题（孤立节点、断连结局、情感浅化等），生成情感曲线、路径时长分布图、叙事地图，支持导出 JSON / ink 格式。

![全局校验](public/screenshots/validate.jpeg)

---

### 预览播放

任意阶段均可点击「预览」实时体验完整交互剧情，支持变量追踪、情感面板、历史路径回溯，无需离开创作环境。

![预览播放](public/screenshots/preview.jpeg)

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

访问 [http://localhost:3000](http://localhost:3000)，从项目列表选择创作模板或直接新建空项目开始。

---

## AI 集成

filmgame 支持多种 AI 接入方式，在设置页面切换：

| 模式 | 说明 |
|------|------|
| **Claude CLI**（默认） | 无需 API Key，使用已登录的 Claude 订阅账号，`claude --print` 调用 |
| **Anthropic API** | 填入 API Key，直连官方接口 |
| **OpenAI API** | 填入 API Key，使用 GPT 系列模型 |
| **Google Gemini API** | 填入 API Key，使用 Gemini 系列模型 |
| **自定义端点** | 任意 OpenAI 兼容接口（本地部署、中转等） |

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
| AI | Claude CLI / Anthropic / OpenAI / Gemini / 自定义端点 |
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

版权所有 © 2026 猫叔（[mmlong818](https://github.com/mmlong818)）

本项目源代码可用于个人学习与非商业研究，但**任何形式的使用、修改或再分发，须在显著位置保留原始作者署名及本版权声明**。未经书面授权，不得将本软件或其衍生版本用于商业用途。
