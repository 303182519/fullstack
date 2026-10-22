# ADR-001：以共享包 `@fedstack/database` 统一 Prisma 持久化层

- 状态：已采纳（2026-10-14），T1–T6 已实施并完成验证
- 日期：2026-10-14
- 影响范围：`packages/database`（新增）、`apps/api`、`apps/admin-api`、`turbo.json`、`pnpm-workspace.yaml`
- 相关规范：`AGENTS.md`、`.rules/database/AGENTS.md`、`.rules/backend/AGENTS.md`

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。

---

## 1. 背景（事实依据）

- 仓库为 pnpm 10 + turbo 的 **ESM** Monorepo；`apps/api` 与 `apps/admin-api` 均为 NestJS 12，`"type": "module"`（证据：各 `package.json`）。
- 两个服务访问**同一个 MySQL 库**（证据：本次需求确认）。
- 依赖版本统一由 catalog 管理，包内用 `"catalog:"` 引用（证据：`pnpm-workspace.yaml`）。
- `turbo.json` 已预留 `@fedstack/database#build`，输出为 `dist/**` 与 `generated/prisma/**`；`.gitignore` 已忽略 `packages/database/generated/prisma/`（证据：`turbo.json`、`.gitignore`）。
- Prisma 7 为 ESM-first，且**所有数据库都必须使用 driver adapter**；MySQL 走 `@prisma/adapter-mariadb`（证据：Prisma 官方 v7 MySQL quickstart 与仓库内 `prisma-orm-setup` 技能参考）。
- `prisma-client` 生成器输出 **TypeScript 源码**到显式 `output` 目录，不再写入 node_modules，需由使用方自行编译（证据：仓库内 `prisma-cli` 技能参考）。
- 实施期实测（2026-10-14）：
  - `prisma@latest` 指向预发布 `8.0.0-rc.22`，而 `@prisma/client@latest` 仍为 `7.10.0`；直接使用 `@latest` 会造成 CLI 与 client 大版本错配（证据：`npm view` dist-tags）。
  - **`prisma@7.10.0` 的 CLI 包缺少 npm provenance**，而 `@prisma/client@7.10.0`、`@prisma/adapter-mariadb@7.10.0` 有 provenance；`prisma@7.9.1` 三件套均具备 provenance（证据：`npm view <pkg>@<ver> dist.attestations`）。这与 registry 上的 `7.10.0-integration-fix-prisma-publish-token.1` tag 相互印证。
  - CLI 7.9.1 **不识别** `prisma7.config.ts`（该文件名自 7.10 起引入），仅识别 `prisma.config.ts`（证据：实测 `prisma migrate status` 报错信息与改名后成功加载）。
  - `PrismaMariaDb` 的构造签名为 `(config: mariadb.PoolConfig | string, options?)`，`connectionLimit` 只存在于 `PoolConfig` 对象形式中（证据：`@prisma/adapter-mariadb` 类型定义与 tsc 报错）。

## 2. 问题

Prisma 应由 `api` 与 `admin-api` 各自维护，还是收敛为 `packages/database` 单一共享包？

## 3. 决策（最终）

- **D1 单一 schema / 单一迁移历史**：`prisma/schema.prisma` 与 `prisma/migrations/` 只存在于该包；两个 app 不得各自维护 schema、不得各自执行迁移。
- **D2 版本锁定 Prisma 7.9.1**：`prisma`、`@prisma/client`、`@prisma/adapter-mariadb` 三者同版本锁定为 `7.9.1`。理由：7.10.0 的 CLI 缺 provenance，会触发本仓库既有的 `trustPolicy: no-downgrade` 供应链防线；7.9.1 三件套均具备 provenance，因此无需为其开白名单。禁用 `@latest`（CLI 的 latest 指向 8.0.0-rc 预发布）。Prisma 8 待 GA 后另开 ADR 升级。
- **D3 生成产物位置**：输出到 `packages/database/generated/prisma/`，由 `prisma generate` 产出 TS 源码后随包编译进 `dist/`，不提交仓库。
- **D4 职责边界**：包只提供「生成的 Client 导出 + 连接参数工厂」。**业务查询与仓储逻辑不进入该包**，按 `.rules/backend/AGENTS.md` 留在各 app 的 service 层。
- **D5 框架无关；Nest 集成由各 app 自建**：包不依赖 NestJS、不提供 `PrismaModule`/`PrismaService`。每个 app 在自身 `src/shared/database/` 下自建约 20 行的 `PrismaService`（`extends PrismaClient`）与 `PrismaModule`。这样包保持框架无关（CLI / worker / seed 同样可用），DI 形态由各 app 自行决定（含 Q1 定调）。
- **D6 环境契约**：连接参数由各服务的运行环境注入；包内**不读取任何环境变量、不加载 `.env`**，避免把某个服务的环境约定固化进共享层，也避免 `pnpm install --prod` 场景下因缺失依赖导致 CLI 配置加载失败。Prisma CLI 迁移所需 env 由调用方（本地 shell / CI / 运维）显式提供。`admin-api` 侧在 Joi schema 中把 `DATABASE_URL` 声明为必填。
- **D7 迁移执行时机**：`prisma migrate deploy` 作为**独立部署步骤**执行，禁止挂在 app 启动流程（避免多实例并发迁移与锁表）。
- **D8 连接池显式设置**：Prisma 7 的 driver adapter 只有在接收 `PoolConfig` 对象时才能设置连接池上限，直接传连接串会退回驱动默认值（`connectionLimit` 默认 10）。因此 `connectionLimit` 必须显式下发，并按 MySQL `max_connections` 在两个服务间分配。
- **D9 连接串解析集中在包内**：由包把 `DATABASE_URL` 解析为 mariadb 所需的离散连接参数（保留「单一环境变量」契约，同时让连接池可控）。解析失败、协议非 `mysql://`、缺少库名、以及连接串上出现查询参数时，**直接抛错**而不是静默忽略——避免运行时连接配置与 CLI 迁移所用连接出现不一致。
- **D10 CLI 配置文件名为 `prisma.config.ts`**：当前 CLI 为 7.9.1，不识别 7.10 才引入的 `prisma7.config.ts`；7.10+ 的 CLI 两种名称都能识别，因此该命名在后续升级时保持兼容。

## 4. 备选方案与取舍

- **A. 各 app 各建一套 Prisma（否决）**：同一数据库上的迁移历史是线性且有状态的（`_prisma_migrations`），两套迁移必然互相冲突；模型也会漂移。仅当拆成两个独立数据库时才成立。
- **B. 共享包，但把业务仓储一并放进去（否决）**：会让两个 app 的业务逻辑耦合进同一个包，违反 Controller → Service → 领域 → 持久化 的分层。
- **C. 共享包，但依赖 postinstall 自动 generate（否决）**：monorepo / CI 下不可靠且属隐式副作用；改为经 turbo 任务图显式生成。
- **D. 直接向 adapter 传连接串（否决）**：`connectionLimit` 无法设置，连接池只能吃驱动的默认值，无法按服务分配。
- **E. 给 `prisma@7.10.0` 开 trustPolicy 白名单（否决）**：等于对供应链风险告警做静默豁免；降级到有 provenance 的 7.9.1 可在不破坏既有安全策略的前提下达成目标。

## 5. 后果

**正面**

- 迁移历史与数据模型单一真相源，杜绝冲突与漂移。
- 依赖方向干净：`packages/database` 为底层基础设施包，被两个 app 依赖，构成无环 DAG。
- 生成的 Client 与类型只维护一份；连接配置按服务各自注入。

**负面 / 风险**

- 引入跨 app 构建耦合：消费方的 `typecheck` / `test` 依赖上游产物（见 §6 T3）。
- 该包成为部署强耦合点：schema 变更需两个服务协同上线，必须遵循扩展-收缩模式（`.rules/database/AGENTS.md` §5）。
- 运行时连接由包内解析连接串得到，连接串上的查询参数不被采用（已改为显式报错）。
- 目前链路上的 Prisma 版本落后于最新稳定版（7.9.1 而非 7.10.0），需在 CLI 恢复 provenance 后评估跟进。

## 6. 实施记录（T1–T6）

**T1 catalog**：`pnpm-workspace.yaml` 新增 `prisma`、`@prisma/client`、`@prisma/adapter-mariadb`（均 `7.9.1`，精确锁定并附原因注释）。`mariadb` 驱动是 `@prisma/adapter-mariadb` 的直接依赖（3.4.5），无需单独声明。

**T2 新建 `packages/database`**

- `package.json`：`@fedstack/database`、ESM、`exports` 指向 `dist/src/index.js`；脚本 `build`（`prisma generate && tsc`）、`typecheck`、`db:generate`、`db:migrate:dev`、`db:migrate:deploy`、`db:status`、`db:studio`、`clean`。
- `tsconfig.json`：extends 根 `tsconfig.base.json`，`rootDir: "."`，`outDir: dist`，`include` 覆盖 `src` 与 `generated`。
- `prisma.config.ts`：schema / migrations 路径与 `datasource.url = process.env.DATABASE_URL`（详见 D10、D6）。
- `prisma/schema.prisma`：`datasource` 仅声明 `provider = "mysql"`；`generator client` 使用 `prisma-client` 并输出到 `../generated/prisma`。
- `src/client.ts`：`DatabaseConnectionOptions` 与 `createPrismaClientOptions()`（解析连接串 → mariadb `PoolConfig` → 构造 adapter）。
- `src/index.ts`：导出 `PrismaClient`、`Prisma`、`createPrismaClientOptions` 及相关类型。

**T3 turbo 任务图**：`@fedstack/database#build` 沿用既有预留（outputs 已含 `dist/**`、`generated/prisma/**`）；将 `typecheck` 的 `dependsOn` 由 `^typecheck` 改为 `^build`，并给 `test` 增加 `dependsOn: ["^build"]`，保证消费方在上游产物就绪后再校验/测试。

**T4 两个 app 接入**

- 两个 app 的 `package.json` 增加 `"@fedstack/database": "workspace:*"`。
- 各自新增 `src/shared/database/prisma.service.ts`（`extends PrismaClient`，构造函数从 `ConfigService` 取 `DATABASE_URL` 与 `DB_CONNECTION_LIMIT`，缺失时抛错；实现 `OnModuleDestroy` → `$disconnect`）与 `src/shared/database/prisma.module.ts`（显式导入，不设全局模块）。
- 两个 app 的 `app.module.ts` 引入 `PrismaModule`。
- `apps/admin-api/src/config/env.validation.ts` 新增 `DATABASE_URL`（必填）与 `DB_CONNECTION_LIMIT`（默认 10）。

**T5 根 `.env.example`**：补充 `DATABASE_URL`、`DB_CONNECTION_LIMIT` 及连接池与迁移的相关说明（该文件此前被 `turbo.json` 的 `globalDependencies` 引用但不存在）。

**T6 验证**：见 §7。

## 7. 验证记录（实际执行）

| 校验               | 命令                                                                 | 结果                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依赖安装           | `pnpm install --no-frozen-lockfile`                                  | 通过，锁定 7.9.1，未触发 trustPolicy 告警                                                                                                                                                                             |
| 客户端生成         | `pnpm --filter @fedstack/database db:generate`                       | 通过，`Generated Prisma Client (7.9.1) to .\generated\prisma`                                                                                                                                                         |
| CLI 配置加载       | 设置 `DATABASE_URL` 后执行 `prisma migrate status`                   | 通过，输出 `Loaded Prisma config from prisma.config.ts` 且 datasource 解析正确（后续 P1000 为预期，凭证为占位值）                                                                                                     |
| 包构建             | `pnpm --filter @fedstack/database build`                             | 通过（`prisma generate` + `tsc`）                                                                                                                                                                                     |
| 类型检查（干净态） | 删除 `dist` 与 `generated` 后 `turbo run typecheck --force`          | 4/4 通过，0 缓存                                                                                                                                                                                                      |
| 构建               | `pnpm build`                                                         | 3/3 通过                                                                                                                                                                                                              |
| Lint（本次新增包） | `eslint packages/database`                                           | 通过（0 问题）                                                                                                                                                                                                        |
| Lint（本 ADR）     | `eslint docs/architecture/decisions/ADR-001-*.md --fix`              | 通过（0 问题）                                                                                                                                                                                                        |
| Lint（两个 app）   | `turbo run lint --filter=@fedstack/api --filter=@fedstack/admin-api` | 失败，但**新增文件均无问题**：报错全部落在既有文件（`api` 52 个 `style/semi`；`admin-api` 509 个 `style/semi` 等），本 ADR 已核实 `env.validation.ts` 的两处报错（第 7 行缩进、第 35 行 `})` 缺分号）在 HEAD 中即存在 |
| 测试               | `pnpm test`                                                          | `api` 通过；`admin-api` 失败——失败原因是既有的**空文件** `test/unit/config/env.validation.spec.ts`（`git cat-file -s` 为 0），与本次变更无关                                                                          |

## 8. 遗留问题与已知风险

- **仓库 lint 基线本来就是坏的**：根级 `eslint .` 存在 68 个错误，全部落在**既有文件**（`.rules/*.md`、`AGENTS.md`、`eslint.config.js`、`packages/eslint-config/*.js`、`pnpm-workspace.yaml` 的 catalog 排序）；`apps/api` 亦存在既有的 `style/semi` 失败。根因是共享配置设定了 `stylistic.semi: true`（要求分号），而仓库内大量既有代码为无分号风格，两者互相矛盾。**本次未做仓库级格式化或配置修改**，需先明确样式真相源。
- **`pnpm test` 失败**：`apps/admin-api/test/unit/config/env.validation.spec.ts` 在 HEAD 中即为空文件，vitest 报 `No test suite found`。既有问题，未在本次修复。
- **Q2 迁移执行载体未定**：CI job / 独立脚本 / 容器 entrypoint 的选型，以及并发迁移的防护方式。
- **Q3 连接池取值未定**：`DB_CONNECTION_LIMIT` 默认 10，两个服务合计 20；需结合生产 MySQL `max_connections` 与运维连接余量确认。
- **Q4 ADR 模板缺失**：`AGENTS.md` 引用的 `docs/architecture/decisions/ADR-000-template.md` 当前不存在。
- **连接串查询参数不支持**：如 `?sslaccept=strict` 这类参数会导致启动直接报错，需要 SSL 时应扩展包的连接选项。
