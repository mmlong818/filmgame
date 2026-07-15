# filmgame-2 方向 B：数据可靠性 — SQL 数据库正式化实现计划

> **For agentic workers:** 本计划按 Task 分块，可由多个子代理并行/串行执行。依赖关系见「执行拓扑」。每个 Task 有独立文件清单、步骤、验证命令与 commit 点。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 把 filmgame-2 从「localStorage-first + JSON 文件影子同步」升级为「正式 SQL 数据库（Postgres）为唯一真源」。数据层用 ORM 抽象以保持部署可迁移；加最小自用认证；BYOK 密钥加密落库；两个真实用户项目无损迁移进库。

**部署约束:** 目标未定。数据访问全部收敛到 `lib/db/*`，本地开发用 Docker Postgres；预留部署适配阶段（Vercel serverless 或 VPS Docker 均可）。仅自用，不做多租户/注册。

**Tech Stack（新增依赖，逐个说明理由）:**
| 包 | 类型 | 为什么加它 / 为什么不用替代 |
|----|------|------|
| `drizzle-orm` | runtime | 薄查询构建器，零运行时依赖、无引擎二进制、无 codegen → serverless 冷启动最优；类型从 schema 直接推导。 |
| `drizzle-kit` | devDep | 从 schema 生成**可审查的纯 SQL** 迁移，契合高风险数据迁移需要看清每一条 DDL。 |
| `pg` + `@types/pg` | runtime/dev | node-postgres，最成熟通用的 Postgres 驱动；主机/serverless 适配器生态最广（Neon/Supabase pooler 皆兼容）。 |

**不新增**（谨慎依赖）：认证、会话签名、密码哈希、AES 加密全部用 Node 内置 `crypto`；cookie 用 Next 内置 API；ID 复用已有 `nanoid`；单测用 Node 内置 `node --test`。**drizzle-zod 不引入**（项目已手写 zod 风格，且规避 zod v4 兼容风险）。**better-sqlite3 不引入**（见决策 9，SQLite 双方言 v1 不做）。

---

## 设计决策摘要

| # | 决策点 | 推荐 | 一句话理由 |
|---|--------|------|-----------|
| 1 | ORM 选型 | **Drizzle ORM + drizzle-kit + pg** | 无引擎二进制/无 codegen，冷启动与部署体积最优；纯 SQL 迁移可审查；多方言为未来 SQLite 留门。 |
| 2 | 表结构 | **折中：`projects`（元数据+JSONB 小集合）+ `nodes`（一行一节点，JSONB 载荷）** | 节点是唯一的热/细粒度编辑实体，独立成行支撑单节点保存与未来 C 方向的节点级并发；choices/dialogue 从不被 SQL 查询，嵌在节点 JSONB 里最简。 |
| 3 | 数据流 | **DB 为真源；Zustand 为会话工作副本；节点级防抖保存 + 乐观更新 + 指数退避重试；localStorage 降为离线/崩溃缓存** | 单节点保存只写一小行，杜绝整档 120KB 写放大；localStorage 不再权威，加载时按 `version` 对账 DB 胜出。 |
| 4 | 运行时校验 | **全模型 zod（`lib/schema/project.ts`），在 API 读/写、导入三处 safeParse** | 系统边界硬校验；不在每次 store 变更做（会话内 TS 可信）。 |
| 5 | 迁移链 | **`schemaVersion` 文档迁移注册表 + 物理表 drizzle 迁移，二者正交** | 读时/导入时把旧文档顺序迁到 `CURRENT`；表结构演进走 drizzle-kit，互不耦合。 |
| 6 | 认证 | **`APP_PASSWORD` + `/login` + HMAC 签名 httpOnly cookie（无状态）+ `proxy.ts` 门禁 + 每个 route handler `withAuth` 兜底** | Next 16 文档明确要求不可只靠 proxy；无状态 HMAC 免会话表；零新依赖。 |
| 7 | BYOK 加密 | **AES-256-GCM（`ENCRYPTION_KEY` 主密钥）加密 apiKey 存 `settings` 表；停止写 localStorage** | 消除现有明文密钥；仅服务端在调用时解密。 |
| 8 | 存量迁移 | **一次性 `scripts/migrate-json-to-db.mjs`（读 data/*.json→迁移→zod 校验→事务 upsert）+ 客户端 localStorage 一次性导入流** | 两个真实项目 + 作者浏览器里可能仅存在于 localStorage 的未同步稿都要无损进库，全程非破坏、幂等。 |
| 9 | 本地开发 | **docker-compose Postgres + drizzle-kit 脚本 + seed；无 Docker → 托管 Postgres（Neon）dev 分支** | **v1 不做 SQLite 双方言**：JSONB 是 schema 核心而 SQLite 无原生 JSONB，且双迁移线 + 原生构建违反谨慎依赖；代码保持方言无关为未来留门。 |

---

## 架构与文件变更地图

### 新建文件
| 文件 | 职责 |
|------|------|
| `docker-compose.yml` | 本地 Postgres 服务（含 volume + healthcheck） |
| `drizzle.config.ts` | drizzle-kit 配置（dialect=postgresql，schema/out 路径，DATABASE_URL） |
| `lib/db/index.ts` | pg Pool 单例（防 Next 热重载连接泄漏）+ drizzle 实例导出 |
| `lib/db/schema.ts` | Drizzle 表定义：`projects` / `nodes` / `settings` |
| `lib/db/projects.ts` | 仓储层：Project ↔ (projects 行 + nodes 行) 组装/拆分、CRUD、乐观锁 `version` |
| `lib/db/settings.ts` | settings 仓储：读写 + 解密/加密调用 |
| `lib/schema/project.ts` | 全模型 zod（ProjectSchema/StoryNodeSchema/ChoiceSchema…）+ `z.infer` 与 `lib/types/project.ts` 一致性守卫 |
| `lib/schema/migrations.ts` | `CURRENT_SCHEMA_VERSION`、`MIGRATIONS` 注册表、`migrateProject(doc)`、`normalizeLegacy(doc)` |
| `lib/server/crypto.ts` | AES-256-GCM 加解密 + HMAC 会话签名/校验 + scrypt 密码校验（全用 node:crypto） |
| `lib/server/auth.ts` | `withAuth()` route handler 包装 + `verifySession(req)` |
| `proxy.ts`（仓库根） | 全站门禁：未认证浏览器→/login，未认证 /api/**→401 |
| `app/login/page.tsx` | 密码登录页 |
| `app/api/auth/login/route.ts` / `app/api/auth/logout/route.ts` | 登录签发 cookie / 登出清除 |
| `app/api/projects/[id]/nodes/[nodeId]/route.ts` | 节点级 PATCH/DELETE（细粒度保存） |
| `scripts/migrate-json-to-db.mjs` | 一次性存量 JSON→DB 导入（幂等、带报告） |
| `test/schema.test.mjs` / `test/migrations.test.mjs` | `node --test` 单测：zod 解析真实数据、迁移链 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `lib/persistence.ts` | 重写：DB 后端保存管线（节点级/整档、防抖、重试、离线队列、save-state 事件）；localStorage 降级为缓存 |
| `lib/store/projectStore.ts` | `loadProject` 改为异步从 DB 水合；节点类变更走节点级保存；接入 `version` 乐观锁与 BroadcastChannel |
| `lib/ai/config.ts` | 移除 apiKey 落 localStorage；仅存 provider/model/baseUrl |
| `lib/ai/server-config.ts` | `loadServerAIConfig` 改为读 `settings` 表 + 解密（保持签名，AI 层无感） |
| `app/api/projects/route.ts` | GET 列表/POST 创建改走仓储 + zod + `withAuth` |
| `app/api/projects/[id]/route.ts` | GET/POST/DELETE 改走仓储 + zod + 乐观锁 409 + `withAuth` |
| `app/api/projects/[id]/archive/route.ts` | 改走仓储（archived 标志位，不再挪文件）+ `withAuth` |
| `app/api/settings/route.ts` | 改读写 `settings` 表；POST 加密 apiKey + `withAuth` |
| `app/api/ai/route.ts` / `app/api/ai/structure/route.ts` / `app/api/gen-log/route.ts` | 加 `withAuth`；gen-log 在 deploy 模式下 no-op |
| `app/projects/page.tsx` | 列表改从 DB；移除 localStorage index 合并逻辑；接入 localStorage 一次性导入提示 |
| `app/project/[id]/layout.tsx` | 恢复兜底改为「DB 为准」的异步水合；移除 v0.2.0 的 localStorage-first 恢复分支 |
| `next.config.ts` | `serverExternalPackages: ['pg']`（避免打包原生依赖） |
| `.env.local.example` | 追加 `DATABASE_URL`/`APP_PASSWORD`/`AUTH_SECRET`/`ENCRYPTION_KEY`/`DEPLOY_MODE` |
| `.gitignore` | 追加 `/drizzle/`（生成的迁移可提交，但排除临时）；确认 `.env*` 已忽略 |
| `package.json` | 依赖 + `db:*` 脚本 |

### 退役 / 变角色
- `lib/server/atomic-write.ts` — 迁移完成后 JSON 写入路径退役（Task 12 删除，确认无引用）。
- `data/projects/*.json`、`data/archive/*.json` — 迁移后仅作历史备份，代码不再读写。

---

## 执行拓扑（子代理调度）

```
Task 1 (基础设施)
  ├── Task 2 (drizzle schema)  ─┐
  ├── Task 3 (zod + 迁移链)     ─┤（2、3 可并行）
  └── Task 5 (认证/crypto)      ─┤（依赖 1 的 env）
                                 ▼
                          Task 4 (仓储层, 依赖 2+3)
                                 ├── Task 6 (BYOK/settings, 依赖 2+4+5)
                                 ├── Task 7 (API 重写, 依赖 4+5)
                                 └── Task 9 (存量迁移脚本, 依赖 4)
                                 ▼
                          Task 8 (客户端数据流, 依赖 7)
                                 ▼
                          Task 10 (DEPLOY_MODE 门控, 依赖 6+7)
                                 ▼
                          Task 11 (本地开发打磨) → Task 12 (全量验收)
```

---

## Task 1：基础设施 — 依赖、env、docker-compose、DB 连接

**Files:** `package.json`、`docker-compose.yml`、`drizzle.config.ts`、`lib/db/index.ts`、`.env.local.example`、`next.config.ts`、`.gitignore`

- [ ] **Step 1: 安装依赖**
```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
pnpm list drizzle-orm drizzle-kit pg
```
期望：各包显示版本，无 peer 报错。

- [ ] **Step 2: 创建 `docker-compose.yml`**（`postgres:17-alpine`，端口 5432，命名 volume `filmgame_pgdata`，`POSTGRES_PASSWORD` 来自 env，`healthcheck: pg_isready`）。

- [ ] **Step 3: 追加 `.env.local.example`**
```bash
# 数据库
DATABASE_URL=postgres://filmgame:filmgame@localhost:5432/filmgame
# 认证（自用单密码）
APP_PASSWORD=change-me
AUTH_SECRET=<openssl rand -hex 32>
# BYOK 密钥加密主密钥（32 字节 hex）
ENCRYPTION_KEY=<openssl rand -hex 32>
# 运行模式：local 允许 claude_cli；deploy 禁用
DEPLOY_MODE=local
```
并 `cp .env.local.example .env.local` 填真实值。

- [ ] **Step 4: 创建 `drizzle.config.ts`**（`dialect: 'postgresql'`，`schema: './lib/db/schema.ts'`，`out: './drizzle'`，`dbCredentials.url: process.env.DATABASE_URL`）。

- [ ] **Step 5: 创建 `lib/db/index.ts`** — pg `Pool` 全局单例（`globalThis` 缓存防热重载连接泄漏），导出 `db = drizzle(pool, { schema })`。

- [ ] **Step 6: `next.config.ts`** 设 `serverExternalPackages: ['pg']`；`.gitignore` 忽略 `/drizzle/*.tmp`，保留提交 `/drizzle/*.sql`。

- [ ] **Step 7: 启动 DB 验证**
```bash
docker compose up -d
docker compose exec -T db pg_isready -U filmgame   # 期望 accepting connections
pnpm tsc --noEmit
```
- [ ] **Commit:** `chore(db): add drizzle+pg deps, docker-compose, db connection singleton`

---

## Task 2：Drizzle 表结构 + 初始迁移

**Files:** `lib/db/schema.ts`、`drizzle/*.sql`（生成）

- [ ] **Step 1: 定义 `lib/db/schema.ts`**
  - `projects`：`id text pk`、`title text`、`createdAt/updatedAt timestamptz`、`currentPhase text`、`selectedScalePlanId text null`、`schemaVersion integer`、`version integer default 1`（乐观锁）、`archived boolean default false`、`archivedAt timestamptz null`、`downstreamStale boolean default false`；JSONB 列：`phaseProgress`、`worldAnchor`、`characters`、`scalePlanOptions`、`chapters`、`acts`、`variables`、`endings`、`lastValidation`、`directorReview`。
  - `nodes`：`id text pk`、`projectId text` FK→projects.id `on delete cascade`、`actId text`、`order integer`、`type text`、`position jsonb`、`data jsonb`（title/emotionFunction/systemFunction/sceneHeader/sceneDesc/dialogue/choices/durationSeconds/notes/dramaticWeight/exploreReturnNodeId）、`version integer default 1`、`updatedAt timestamptz`。索引 `idx_nodes_project (projectId, order)`。
  - `settings`：`id text pk`（固定 `'singleton'`）、`provider text`、`model text null`、`baseUrl text null`、`apiKeyEnc text null`、`updatedAt timestamptz`。
  - 导出 `InferSelectModel` 类型别名供仓储层用。

- [ ] **Step 2: 生成并应用迁移**
```bash
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate      # 或 push；生产用 migrate
```
- [ ] **Step 3: 验证表已建**
```bash
docker compose exec -T db psql -U filmgame -c "\dt"          # 期望 projects/nodes/settings
docker compose exec -T db psql -U filmgame -c "\d nodes"     # 确认 jsonb 列与索引
pnpm tsc --noEmit
```
- [ ] **Commit:** `feat(db): add projects/nodes/settings tables and initial migration`

---

## Task 3：全模型 zod + schemaVersion 迁移链（可与 Task 2 并行）

**Files:** `lib/schema/project.ts`、`lib/schema/migrations.ts`、`test/schema.test.mjs`、`test/migrations.test.mjs`

- [ ] **Step 1: `lib/schema/project.ts`** — 按 `lib/types/project.ts` 逐字段写 zod（`VoiceProfileSchema`…`ChoiceSchema`/`StoryNodeSchema`/`ProjectSchema`），风格对齐 `lib/ai/schemas.ts`。数组默认 `.default([])`，可选字段 `.optional()`。末尾加编译期一致性守卫：`type _Check = Project extends z.infer<typeof ProjectSchema> ? true : never`（防 zod 与 TS 类型漂移）。

- [ ] **Step 2: `lib/schema/migrations.ts`**
  - `export const CURRENT_SCHEMA_VERSION = 1`。
  - `normalizeLegacy(doc)`：`schemaVersion` 缺失/0 → 补 1，补齐缺失数组/默认值（处理早期 localStorage 导出）。
  - `MIGRATIONS: Record<number, (doc:any)=>any>`：目前空（框架就位），注释示范如何加 `1: (d)=>({...d, schemaVersion:2})`。
  - `migrateProject(doc)`：`normalizeLegacy` → 从 `doc.schemaVersion` 顺序应用到 `CURRENT_SCHEMA_VERSION` → 返回。

- [ ] **Step 3: 单测（node 内置 runner，零依赖）**
  - `test/schema.test.mjs`：读 `data/projects/g120MnzS.json`、`x-TZT55r.json`，`ProjectSchema.parse` 必须成功；断言 node 数 41 / 65。
  - `test/migrations.test.mjs`：喂一个 `schemaVersion` 缺失的最小文档，`migrateProject` 后 `schemaVersion===1` 且 `ProjectSchema.safeParse().success`。
```bash
node --test
pnpm tsc --noEmit
```
> 注意：若两个真实文件解析失败，说明 zod 与实际数据不符 —— **停下核对**，以真实数据为准修 schema，不要放宽到 `z.any()`。

- [ ] **Commit:** `feat(schema): full-project zod validation + schemaVersion migration chain`

---

## Task 4：仓储层（依赖 2+3）

**Files:** `lib/db/projects.ts`

- [ ] **Step 1: 组装/拆分**
  - `toRows(project)`：拆成 `projectRow`（元数据 + JSONB 小集合，不含 nodes）+ `nodeRows[]`。
  - `fromRows(projectRow, nodeRows)`：重建完整 `Project`（nodes 按 `order` 排序），`migrateProject` + `ProjectSchema.parse` 后返回。

- [ ] **Step 2: CRUD + 乐观锁**
  - `getProject(id)`、`listProjects({includeArchived})`（返回 `ProjectSummary`，nodeCount 用 `count(nodes)`）。
  - `saveProject(project, expectedVersion?)`：事务内 upsert projectRow（`version` 自增；若传 `expectedVersion` 且与库中不符 → 抛 `ConflictError`）+ 差量同步 nodeRows（按 id upsert，删除库中多余 node）。
  - `saveNode(projectId, node, expectedVersion?)`：只 upsert 单 node 行 + bump 该行 `version`，并 bump projects.updatedAt（不 bump projects.version，避免节点保存与整档保存互相 409）。
  - `deleteNode` / `archiveProject(id)`（置 archived）/ `deleteProject(id)`（级联）。

- [ ] **Step 3: 验证**（写一段临时 node 脚本或在 Task 9 脚本里复用）
```bash
pnpm tsc --noEmit
```
- [ ] **Commit:** `feat(db): project repository with node-level writes and optimistic version`

---

## Task 5：认证 + crypto（依赖 1，可与 2/3/4 并行）

**Files:** `lib/server/crypto.ts`、`lib/server/auth.ts`、`proxy.ts`、`app/login/page.tsx`、`app/api/auth/login/route.ts`、`app/api/auth/logout/route.ts`

- [ ] **Step 1: `lib/server/crypto.ts`**（全 `node:crypto`）
  - `encryptSecret(plain)` / `decryptSecret(enc)`：AES-256-GCM，`ENCRYPTION_KEY`(hex)，输出 `iv:tag:ciphertext`(base64)。
  - `signSession(payload)` / `verifySession(token)`：HMAC-SHA256（`AUTH_SECRET`），payload 含 `exp`；`timingSafeEqual` 比对。
  - `verifyPassword(input)`：与 `APP_PASSWORD` 用 scrypt+`timingSafeEqual` 常量时间比对。

- [ ] **Step 2: `app/api/auth/login/route.ts`** — POST 校验密码，签发 httpOnly + Secure + SameSite=Lax cookie（`filmgame_session`，有效期如 30 天）。`logout` 清除 cookie。

- [ ] **Step 3: `proxy.ts`（仓库根，Node 运行时）**
  - `verifySession(cookie)`；未认证浏览器请求（非 /login、非静态）→ redirect `/login`；未认证 `/api/**`（除 `/api/auth/login`）→ `401 JSON`。
  - `config.matcher` 排除 `_next/static`、`_next/image`、favicon、`/login`、`/api/auth/login`。
  - **注意（Next 16）**：文件名必须是 `proxy.ts`（`middleware.ts` 已废弃）；导出函数名 `proxy`；不要设 `runtime` 配置项（proxy 会报错）。

- [ ] **Step 4: `lib/server/auth.ts` — `withAuth(handler)`** 包装：在每个 route handler 内再校验一次 session（Next 文档明确要求不可只靠 proxy）。

- [ ] **Step 5: `app/login/page.tsx`** — 极简密码输入表单，POST /api/auth/login，成功后跳 `/projects`。

- [ ] **Step 6: 验证**
```bash
pnpm build && pnpm start &
curl -i localhost:3000/api/projects            # 期望 401
curl -i -c cookie.txt -X POST localhost:3000/api/auth/login -d '{"password":"<真值>"}' -H 'Content-Type: application/json'  # 期望 Set-Cookie
curl -i -b cookie.txt localhost:3000/api/projects   # 期望 200（Task 7 后）
```
- [ ] **Commit:** `feat(auth): password login, HMAC session, proxy gate + withAuth`

---

## Task 6：BYOK 加密 + settings 表（依赖 2+4+5）

**Files:** `lib/db/settings.ts`、`lib/ai/server-config.ts`、`app/api/settings/route.ts`、`lib/ai/config.ts`

- [ ] **Step 1: `lib/db/settings.ts`** — `getSettings()`（读 singleton 行，解密 apiKey 供服务端用）/ `saveSettings(cfg)`（`encryptSecret(apiKey)` 后写 `apiKeyEnc`；apiKey 为空则保留原值）。

- [ ] **Step 2: `lib/ai/server-config.ts`** — `loadServerAIConfig()` 改为 `getSettings()`（**保持签名不变**，AI 层 lc-providers/lc-chains 无感）；`saveServerAIConfig` 走 `saveSettings`。删除 `data/settings.json` 读写。

- [ ] **Step 3: `app/api/settings/route.ts`** — GET 返回 masked（复用现有 mask 逻辑）；POST `withAuth` + 现有 zod 校验 + `saveSettings`。

- [ ] **Step 4: `lib/ai/config.ts`（客户端）** — `saveAIConfig` 不再写 apiKey 到 localStorage（仅 provider/model/baseUrl）；apiKey 只经 POST /api/settings 到服务端。

- [ ] **Step 5: 验证**
```bash
curl -b cookie.txt -X POST localhost:3000/api/settings -d '{"provider":"anthropic","apiKey":"sk-ant-test","model":"claude-opus-4-5"}' -H 'Content-Type: application/json'
docker compose exec -T db psql -U filmgame -c "select provider, left(api_key_enc,12) from settings;"  # 期望密文非明文
curl -b cookie.txt localhost:3000/api/settings   # 期望 apiKey 掩码
```
- [ ] **Commit:** `feat(security): encrypt BYOK api key at rest (AES-256-GCM), move settings to DB`

---

## Task 7：API 路由重写（依赖 4+5）

**Files:** `app/api/projects/route.ts`、`app/api/projects/[id]/route.ts`、`app/api/projects/[id]/nodes/[nodeId]/route.ts`、`app/api/projects/[id]/archive/route.ts`

- [ ] **Step 1: `projects/route.ts`** — GET → `listProjects()`；POST（创建）→ `ProjectSchema.parse` + `saveProject`。全部 `withAuth`。保留 `SAFE_ID` 校验。

- [ ] **Step 2: `projects/[id]/route.ts`** — GET → `getProject`（含 `version`）；POST（整档保存）→ 解析 body、取 `If-Match`/body.version 作 `expectedVersion`、`ConflictError`→`409`；DELETE → `deleteProject`。`withAuth`。

- [ ] **Step 3: `projects/[id]/nodes/[nodeId]/route.ts`（新）** — PATCH → `saveNode`（节点级，带 node.version 乐观锁）；DELETE → `deleteNode`。`withAuth`。

- [ ] **Step 4: `archive/route.ts`** — POST → `archiveProject`；DELETE → `deleteProject`。`withAuth`。移除文件搬运。

- [ ] **Step 5: 验证**
```bash
pnpm tsc --noEmit && pnpm build
# 用 cookie.txt 跑一遍 GET 列表 / POST 创建 / PATCH 节点 / 409 冲突（连发两次带旧 version 的 POST）
```
- [ ] **Commit:** `feat(api): DB-backed project/node routes with zod + optimistic lock + auth`

---

## Task 8：客户端数据流重构（依赖 7）

**Files:** `lib/persistence.ts`、`lib/store/projectStore.ts`、`app/projects/page.tsx`、`app/project/[id]/layout.tsx`

- [ ] **Step 1: 重写 `lib/persistence.ts`**
  - `saveProject(project)` → 防抖(~700ms) PATCH 整档 `/api/projects/:id`；`saveNode(projectId, node)` → 防抖 PATCH 节点。
  - 保存状态事件：`dispatchEvent('filmgame:save-state', {state:'saving'|'saved'|'error'|'conflict'})`。
  - 失败：指数退避重试 3 次；仍失败 → 写 localStorage `filmgame:pending:<id>` 兜底 + 触发 `save-error`。
  - `online` 事件 → flush pending。
  - localStorage：仅存最近快照（乐观 paint + 离线兜底），不再维护 index/archive 索引键。
  - 保留 `exportProjectJson`/`exportInk`（纯客户端，无关 DB）。

- [ ] **Step 2: `lib/store/projectStore.ts`**
  - `loadProject(id)` 改异步：先 localStorage 乐观 paint，再 `GET /api/projects/:id`，按 `version`/`updatedAt` 对账（DB 胜出），存 `loadedVersion`。
  - 节点类 action（`updateNode`/`addChoice`/`updateChoice`/`deleteChoice`/`addNode`/`deleteNode`）→ 调 `saveNode`；元数据/结构类 → `saveProject`。
  - 保存请求带 `loadedVersion`；收到 409 → 触发 `conflict`，UI 提示「已在别处修改，点此加载最新」。
  - 接入 `BroadcastChannel('filmgame:project')`：保存成功广播 `{id, version}`；他标签页命中同 id → 标记 stale + 提示刷新。

- [ ] **Step 3: `app/projects/page.tsx`** — 列表纯从 `GET /api/projects`；移除 localStorage index 合并；archive/delete 走 API；加「检测到本地未同步数据，导入到数据库？」提示（触发 Task 9 客户端导入流）。

- [ ] **Step 4: `app/project/[id]/layout.tsx`** — 恢复逻辑改为 DB 为准的异步水合，移除 v0.2.0 localStorage-first 恢复分支；`notFound` 判定基于 API 404。

- [ ] **Step 5: 验证**（dev 环境手测）
```bash
pnpm dev
# 编辑单节点 → Network 只见一条 nodes PATCH、体积远小于整档；save-state 指示 saving→saved
# 双标签页开同一项目：A 存 → B 收到 stale 提示
# 断网编辑 → 提示 error 且 localStorage 有 pending；恢复网络后自动 flush
```
- [ ] **Commit:** `refactor(client): DB-first save pipeline, node-level saves, multi-tab conflict handling`

---

## Task 9：存量迁移（依赖 4；可在 Task 8 前/并行）

**Files:** `scripts/migrate-json-to-db.mjs`；客户端导入流并入 Task 8 Step 3

- [ ] **Step 1: `scripts/migrate-json-to-db.mjs`**
  - 遍历 `data/projects/*.json` + `data/archive/*.json`（archive 置 archived=true）。
  - 每个：`migrateProject` → `ProjectSchema.parse`（失败 → 记录并跳过，不中断，最后汇总）→ `toRows` → 事务 upsert。
  - **幂等**：若库中该 id `updatedAt >= 文件 updatedAt` 则跳过。
  - 结束打印报告：imported / skipped / failed（含文件名与原因）。

- [ ] **Step 2: 客户端 localStorage 一次性导入**（Task 8 Step 3 的提示触发）— 扫描 `filmgame:project:*`/index/archive，对每个 `migrateProject`+校验后 POST 到 API；按 id+updatedAt 去重；**非破坏**（导入成功前不删 localStorage）。

- [ ] **Step 3: 验证（真实数据）**
```bash
node scripts/migrate-json-to-db.mjs
docker compose exec -T db psql -U filmgame -c "select id,title from projects;"                 # 期望 g120MnzS / x-TZT55r
docker compose exec -T db psql -U filmgame -c "select project_id,count(*) from nodes group by 1;" # 期望 41 / 65
node scripts/migrate-json-to-db.mjs    # 再跑一次 → 全部 skipped（幂等）
```
- [ ] **Commit:** `feat(migration): one-time JSON->DB import (idempotent) + client localStorage import`

---

## Task 10：DEPLOY_MODE 门控（依赖 6+7）

**Files:** `lib/ai/lc-providers.ts`、`app/api/ai/route.ts`、`app/api/gen-log/route.ts`、`app/components/ai-settings-modal.tsx`

- [ ] **Step 1:** `DEPLOY_MODE==='deploy'` 时，`createModel`/`runChain` 遇 `provider==='claude_cli'` → 抛清晰错误（`no_cli: claude_cli disabled in deploy mode`）；`local` 保留。
- [ ] **Step 2:** settings 弹窗读一个 `GET /api/settings` 暴露的 `deployMode`，deploy 下隐藏 `claude_cli` 选项并提示需 BYOK。
- [ ] **Step 3:** `gen-log` 路由在 deploy 模式下 GET 返回空、DELETE no-op（serverless 无持久 fs）；`withAuth`。
- [ ] **验证:** `DEPLOY_MODE=deploy pnpm build && pnpm start`，claude_cli 调用返回明确错误；设置页无该选项。
- [ ] **Commit:** `feat(deploy): gate claude_cli behind DEPLOY_MODE, guard fs-bound routes`

---

## Task 11：本地开发打磨（依赖多数）

**Files:** `package.json`、`scripts/seed-db.mjs`、`docs/db-setup.md`

- [ ] **Step 1:** `package.json` 脚本：`db:up`(docker compose up -d)、`db:down`、`db:generate`、`db:migrate`、`db:studio`(drizzle-kit studio)、`db:seed`、`db:migrate-json`。
- [ ] **Step 2:** `scripts/seed-db.mjs` — 插入 1 个示例项目（复用 `PROJECT_TEMPLATES` 语义），供全新克隆非空。
- [ ] **Step 3:** `docs/db-setup.md` — 起步步骤、无 Docker 走托管 Postgres(Neon) 的 `DATABASE_URL` 说明、部署适配（Vercel serverless 用 pooled/Neon 驱动 + 迁移在 CI；VPS Docker 用 pg Pool + volume）与 SQLite 为何 v1 不做的取舍。
- [ ] **验证:** 全新环境 `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev` 一条龙可用。
- [ ] **Commit:** `chore(db): dev scripts, seed data, setup docs`

---

## Task 12：全量验收（串行，最后）

- [ ] `pnpm tsc --noEmit` 零错误；`pnpm build` 成功；`node --test` 全绿。
- [ ] 真实检查：登录 → 列表见两个真实项目 → 逐个打开，节点数 41/65、标题一致、跑校验引擎结果与迁移前一致（对比 `lastValidation.passRate`）。
- [ ] 多标签页冲突、断网重连 flush、409 提示手测通过。
- [ ] `data/settings.json` 明文密钥已消除；DB 中 `api_key_enc` 为密文。
- [ ] 确认 `lib/server/atomic-write.ts` 无引用后删除；确认无 route 仍读写 `data/projects/*.json`。
- [ ] **Commit:** `chore: retire JSON file datastore after SQL migration verified`

---

## 验收标准

| 项目 | 验收条件 |
|------|---------|
| 唯一真源 | 所有读写经 `lib/db/*`；停用文件/localStorage 权威路径 |
| 无损迁移 | 两个真实项目 node 数 41/65、内容与校验结果与迁移前一致；脚本幂等 |
| 节点级保存 | 单节点编辑仅产生一条小体积 nodes PATCH |
| 乐观锁 | 陈旧 version 保存返回 409；多标签页收到 stale 提示 |
| 离线容忍 | 断网编辑不丢，恢复后自动 flush |
| 认证 | 未认证 /api/** 返回 401；浏览器跳 /login；handler 内二次校验 |
| 密钥加密 | apiKey 库内密文，localStorage 不再含密钥 |
| 运行时校验 | API 读/写/导入均 zod safeParse |
| 部署可迁移 | DEPLOY_MODE 门控生效；文档给出 Vercel/VPS 两条适配路径 |
| 类型/构建/单测 | tsc 零错误、build 成功、`node --test` 全绿 |
```