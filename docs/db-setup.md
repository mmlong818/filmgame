# 数据库本地开发指南

filmgame-2 用 Postgres（Drizzle ORM + `pg`）作为唯一数据真源。本文档说明本地起步、无 Docker 时的替代方案，以及两条部署适配路径。

## 快速起步

```bash
cp .env.local.example .env.local   # 首次克隆后，按下文「环境变量说明」填真实值
pnpm install

pnpm db:up        # docker compose up -d：启动本地 Postgres 容器（postgres:17-alpine）
pnpm db:migrate    # drizzle-kit migrate：应用 drizzle/*.sql 迁移，建表
pnpm db:seed       # 插入 1 个示例项目，供全新克隆非空、可直接打开看效果
pnpm dev
```

打开 `http://localhost:3000`，登录后应能在项目列表看到示例项目「[示例] 深夜实验室」。

其他常用脚本：

| 脚本 | 作用 |
|------|------|
| `pnpm db:up` | 启动本地 Postgres 容器 |
| `pnpm db:down` | 停止并移除容器（命名 volume `filmgame_pgdata` 不受影响，数据保留） |
| `pnpm db:generate` | 改动 `lib/db/schema.ts` 后，生成新的迁移 SQL 到 `drizzle/` |
| `pnpm db:migrate` | 应用 `drizzle/*.sql` 迁移到 `DATABASE_URL` 指向的数据库 |
| `pnpm db:studio` | 打开 drizzle-kit studio，可视化查看/编辑表数据 |
| `pnpm db:seed` | 插入示例项目；幂等，库中已有同 id 项目则跳过，可重复运行 |
| `pnpm db:migrate-json` | 一次性把 `data/projects/*.json`、`data/archive/*.json` 存量数据导入库（仅在从旧的 JSON 文件数据源迁移时需要，全新环境不需要） |

## 无 Docker：用托管 Postgres（Neon）

不想在本机跑 Docker 时，可以用 [Neon](https://neon.tech) 的免费托管 Postgres 替代本地容器：

1. 在 Neon 控制台新建一个 project，建一个 `dev` 分支（Neon 的 branch 是数据库级的 copy-on-write 分支，和本地跑 `db:up` 起到同等作用）。
2. 复制该分支的连接串，填入 `.env.local` 的 `DATABASE_URL`。Neon 默认给的连接串已经是 `sslmode=require` 的直连地址，`pg.Pool` 可直接使用，不需要额外配置。
3. 跳过 `pnpm db:up`（不需要本地容器），直接执行 `pnpm db:migrate && pnpm db:seed && pnpm dev`。
4. 需要重置环境时，在 Neon 上删除/重建 `dev` 分支即可，比 `docker compose down -v` 更快。

## 部署适配

代码层（`lib/db/index.ts` 用标准 `pg.Pool` + `drizzle-orm/node-postgres`）保持方言无关，两种部署形态都能跑，只是连接方式和迁移时机不同：

### 路径 A：Vercel（serverless）

- **连接串用 pooled 连接**：Vercel 的 serverless function 每次调用可能是新实例，普通 Postgres 连接数很快会打满。用 Neon 的 *pooled* 连接串（带 `-pooler` 后缀的 host，基于 PgBouncer），或换用 `@neondatabase/serverless` 的 HTTP/WebSocket 驱动替换 `pg.Pool`（如果连接数仍然吃紧，作为后续优化项）。
- **迁移不在请求路径里跑**：`drizzle-kit migrate` 放到 CI/CD 流程里，在部署前对生产库跑一次，而不是让应用启动时自动迁移——避免多个 serverless 实例并发跑迁移互相打架。
- `DEPLOY_MODE=deploy`：关闭仅限本地的能力（如 `claude_cli` provider）。

### 路径 B：VPS + Docker

- 数据库和应用都用 Docker 跑（`docker-compose.yml` 的 `db` service 即可直接用于生产，视负载决定是否加只读副本）。
- 连接方式沿用当前的 `pg.Pool`（`lib/db/index.ts`），因为是长驻进程、连接数可控，不需要 serverless 连接池那一套。
- 迁移随部署脚本跑一次 `pnpm db:migrate`，在应用容器启动前执行。
- **备份**：命名 volume `filmgame_pgdata` 是唯一数据落点，用 `pg_dump`/`pg_basebackup` 定期备份该 volume 内容（或对 volume 做快照），而不是依赖容器本身的持久性。

## 为什么 v1 不做 SQLite

计划里评估过「Postgres + SQLite 双方言」的方案，最终决定 v1 只支持 Postgres（见 `docs/plans/2026-07-16-sql-datastore.md` 决策表第 9 条），原因：

- Schema 大量依赖 JSONB 列（`worldAnchor`/`characters`/`chapters`/`nodes.data` 等），这是 Postgres 的原生类型；SQLite 没有原生 JSONB，只能退化成 TEXT + 应用层 JSON.parse，等于放弃了 Postgres 这层的查询/索引能力。
- 双方言意味着两套迁移历史、两套 CI 测试矩阵，长期维护成本远高于「本地也用 Postgres」。
- SQLite 的 Node 驱动（如 `better-sqlite3`）依赖原生二进制编译，与项目「谨慎引入依赖」的原则冲突，也会拖慢 CI 和跨平台安装。
- 代码层已经保持方言无关（`drizzle-orm/node-postgres` 是唯一直接依赖 Postgres 特性的地方），如果未来真的需要单文件本地库，加 SQLite 支持的改动面是可控的——只是 v1 不做。

## 环境变量说明

`.env.local`（不提交到 git，从 `.env.local.example` 拷贝后填真实值）：

| 变量 | 作用 | 获取/生成方式 |
|------|------|---------------|
| `DATABASE_URL` | Postgres 连接串 | 本地 Docker 默认 `postgres://filmgame:filmgame@localhost:5432/filmgame`；托管数据库用 Neon 等提供的连接串 |
| `APP_PASSWORD` | 自用单密码登录的密码明文（仅比对用，不落库） | 自己设置一个强密码 |
| `AUTH_SECRET` | 会话 cookie 签名密钥（32 字节 hex） | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | BYOK API Key 落库前的 AES 加密主密钥（32 字节 hex） | 生成方式同上；**必须**与 `AUTH_SECRET` 用不同的随机值，且不要复用到别的用途 |
| `DEPLOY_MODE` | `local`（默认）允许 `claude_cli` 等仅限本机可用的 provider；`deploy` 禁用，用于生产部署 | 本地开发填 `local`，部署到 Vercel/VPS 生产环境填 `deploy` |

此外 `.env.local.example` 里还有 `LANGSMITH_API_KEY`/`LANGSMITH_TRACING_V2`/`LANGSMITH_PROJECT`（AI 调用链可观测性，可选）、`ANTHROPIC_API_KEY`（Anthropic API 直连模式用，非 CLI 模式时需要），这两组变量与数据库无关，按需配置。
