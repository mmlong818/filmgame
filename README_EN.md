# Interactive Film Game Studio

[中文](README.md) · English

> From a single story premise to a fully deliverable interactive film game script — AI collaborates throughout, while the writer stays in creative control.

![Tech Stack](https://img.shields.io/badge/Next.js-16.2-black) ![React](https://img.shields.io/badge/React-19-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8)

![homepage](public/screenshots/homepage.jpeg)

---

## What is this?

An AI-assisted authoring tool for screenwriters and interactive narrative designers. It breaks the creation process into **5 structured phases**, providing AI collaboration at each stage while keeping the writer in full creative control.

---

## 5-Phase Workflow

### Phase 1 · World Anchor

Define the story core, themes, world rules, and main characters. AI can review consistency, suggest characters, and propose ending directions in one click.

![World Anchor](public/screenshots/world.jpeg)

---

### Phase 2 · Scale Planning

Choose your project scope — Compact / Standard / Epic. AI generates three complete plans with estimated work hours; confirm and move to structure design.

![Scale Planning](public/screenshots/scale.jpeg)

---

### Phase 3 · Structure & Branches

**List view**: Manage all narrative nodes in a Chapter → Act → Node hierarchy. Add, reorder, and set node types (Opening / Branch / Progression / Explore / Ending).

![Structure List](public/screenshots/structure-list.jpeg)

**Flow view**: A visual narrative map powered by @xyflow/react — auto-layout, hover-to-highlight paths, free drag-and-drop.

![Structure Flow](public/screenshots/structure-flow.jpeg)

---

### Phase 4 · Scene Workshop

Fill in scene descriptions, emotion arcs, and dialogue node by node. The left panel shows global progress; the right workspace lets AI write dialogue, fill emotion functions, and suggest choice branches in one click.

![Scene Workshop](public/screenshots/workshop.jpeg)

![Scene Workshop – Dialogue](public/screenshots/workshop2.jpeg)

---

### Phase 5 · Global Validation

Automatically detects 8 categories of structural issues (orphan nodes, disconnected endings, shallow emotion arcs, etc.). Generates emotion curves, path-length distribution charts, and a narrative map. Supports JSON / ink export.

![Global Validation](public/screenshots/validate.jpeg)

---

### Live Preview

Click "Preview" at any phase to play through the full interactive story — with variable tracking, emotion panels, and history breadcrumbs — without leaving the authoring environment.

![Live Preview](public/screenshots/preview.jpeg)

---

## Getting Started

### Requirements

- Node.js 18+
- [Claude CLI](https://claude.ai/download) (logged in, `claude` command available) — or any supported AI API key

### Install & Run

```bash
git clone https://github.com/mmlong818/filmgame.git
cd filmgame
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start from the Projects screen — pick a template or create a blank project.

---

## AI Integration

Multiple AI providers are supported and can be switched in the Settings panel:

| Mode | Description |
|------|-------------|
| **Claude CLI** (default) | No API key needed — uses your logged-in Claude subscription via `claude --print` |
| **Anthropic API** | Direct API access with your API key |
| **OpenAI API** | GPT-series models with your API key |
| **Google Gemini API** | Gemini-series models with your API key |
| **Custom Endpoint** | Any OpenAI-compatible API (local models, proxies, etc.) |

Supported AI phases and actions:

| Phase | Action | Description |
|-------|--------|-------------|
| `world` | `review`, `suggest_characters`, `suggest_variables`, `endings_design` | World-building |
| `scale` | `generate` | Scale plan generation |
| `structure` | `spine`, `chapter` | Narrative spine and chapter structure |
| `branches` | `generate` | Branch topology |
| `workshop` | `fill_emotion`, `write_dialogue`, `suggest_choices`, `revise_dialogue` | Node content creation |
| `validate` | `review` | Global structural review |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| State | Zustand v5 |
| Flow graph | @xyflow/react v12 |
| AI | Claude CLI / Anthropic / OpenAI / Gemini / Custom |
| Storage | localStorage + local JSON files |
| Language | TypeScript 5 |

---

## Project Structure

```
filmgame/
├── app/
│   ├── api/ai/          # AI gateway
│   ├── api/projects/    # Project CRUD API
│   └── project/[id]/    # 5 phase pages
│       ├── world/
│       ├── scale/
│       ├── structure/
│       ├── workshop/
│       └── validate/
├── lib/
│   ├── ai/prompts.ts    # All AI prompt templates
│   ├── store/           # Zustand stores
│   ├── types/           # TypeScript types
│   └── validation/      # 8-category BFS validation engine
├── data/projects/       # Server-side project storage
└── seed-project.mjs     # Demo project generator
```

---

## License

Copyright © 2026 猫叔 ([mmlong818](https://github.com/mmlong818))

Source code is available for personal learning and non-commercial research. **Any use, modification, or redistribution must retain the original author attribution and this copyright notice.** Commercial use requires prior written authorization.
