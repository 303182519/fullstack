# ADR-006：Prisma Schema 重设计（PostgreSQL → MySQL + Prisma 7）

- 状态：已采纳（2026-10-15）
- 日期：2026-10-15
- 影响范围：`packages/database/`（schema、迁移、生成物）、`apps/admin-api/src/shared/utils/snowflake.ts`、`apps/admin-api/src/common/pipes/`、`apps/admin-api/src/config/`
- 相关规范：`AGENTS.md`、`.rules/database/AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-001`（共享持久化层）、`ADR-005`（多租户隔离）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

---

## 1. 背景（事实依据）

- 上游为 **PostgreSQL** 环境（NestJS 10 + Prisma 5），本仓库目标为 **MySQL + Prisma 7.9.1**（证据：迁移路线图首部基线说明与 §9「MySQL 与 PostgreSQL 差异」风险项）。
- 上游调研（2026-10-15，基线 commit `83a83f7`，均已核实）得出类型映射需求：PostgreSQL `jsonb` → MySQL `Json`；PostgreSQL 数组 → 关联表或 `Json`；`uuid` 主键 → BigInt 雪花。
- 改造前本仓库 schema 仅有 `User` 占位模型，`packages/database/prisma/` **无 `migrations/`**，全仓库**无代码引用**该模型（均已核实）→ 无迁移历史与引用负担，**可推倒重设计**。
- Prisma 7 生成器为 `prisma-client`（非已弃用的 `prisma-client-js`），生成物输出路径可自定义（证据：`schema.prisma` 的 `generator client { provider = "prisma-client"; output = "../generated/prisma" }`）。
- 本仓库已有雪花 ID 设施：`shared/utils/snowflake.ts`（`Snowflake` / `initSnowflake` / `generateSnowflakeId`）与 `ParseSnowflakePipe`；`workerId` / `datacenterId` 走应用配置 `WORKER_ID` / `DATACENTER_ID`（证据：`main.ts` 调用 `initSnowflake(...)`、`config/config.default.ts`）。
- 持久化层已收敛为单 schema 真相源，两个后端 app 共用（证据：ADR-001）。

## 2. 问题

如何把面向 PostgreSQL / Prisma 5 的数据模型迁移到 MySQL + Prisma 7，并同时建立**企业级命名、主键、审计与迁移纪律**？既有 `User` model 应当增量改造还是推倒重来？

## 3. 决策（最终）

### D1 推倒重设计，而非增量改造

- 删除既有 `User` 占位模型，按上游实体重新设计（依据：无迁移历史、无代码引用、命名与主键体系均不同）。

**取舍**：保留并加字段看似改动更小，但主键类型、命名规范、审计列、软删除语义全变，最终仍等价重写，且留下历史命名噪音。

### D2 命名规范

- model `PascalCase` + `@@map("sys_*")`（表名 snake_case，统一 `sys_` 前缀）。
- 字段 `camelCase` + `@map` snake_case。
- 枚举以 `UPPER` 命名 + `@map` 小写（客户端值为 UPPER，落库为小写；证据：`schema.prisma` P0 四表五枚举）。

**取舍**：不加 `@@map` 则表名即 model 名，与 MySQL 惯例不符；不 `@map` 则列名为 camelCase，与 DBA / 运维惯例冲突。

### D3 主键：BigInt 雪花（不写 `@default`）

- 所有表主键 `BigInt @id`，值由**业务代码**经 `generateSnowflakeId()` 生成（不在 DB 侧自增 / `@default`），保持分布式唯一、时间有序、防枚举。
- `workerId` / `datacenterId` 走配置，**多实例必须唯一分配**。
- 跨层传输：BigInt 不进入 JSON / JWT，统一以 **string** 承载；入参经 `ParseSnowflakePipe` 校验（证据：`auth.types.ts`「所有 BigInt 主键统一以 string 承载」）。

### D4 审计列统一

- 每表统一 `created_at` / `updated_at` / `deleted_at`（`@db.DateTime(3)`，毫秒）。
- `updated_at` 用 `@updatedAt`；`deleted_at` 为软删除标记（null = 未删除，非 null = 已删除）。
- 关联表（如 `SysUserRole`）**不带** `updated_at` / `deleted_at`（重绑定时删旧插新；证据：`schema.prisma` SysUserRole 注释）。

### D5 类型映射（PostgreSQL → MySQL）

| 上游（PostgreSQL） | 本项目（MySQL + Prisma 7） | 说明                                                |
| ------------------ | -------------------------- | --------------------------------------------------- |
| `jsonb`            | `Json`                     | 如 `sys_user.password_history`                      |
| 数组               | 关联表 / `Json`            | 单值集合优先关联表（如 user↔role）；弱结构用 `Json` |
| `uuid`             | `BigInt` 雪花              | 见 D3                                               |
| `timestamp`        | `DateTime(3)`              | 毫秒精度                                            |

### D6 唯一约束与软删除的冲突处理：墓碑化

- 唯一索引带租户前缀（见 ADR-005 D6）。
- 软删除行不得因保留原唯一列值而阻塞同名重建 → 删除时改写唯一列：`原名__deleted__<id>`（按列宽裁剪），可空唯一列（`email`）直接置 null。
- 落地证据：`modules/role/role.service.ts` 的 `tombstoneCode`、`modules/user/user.service.ts` 的对应处理。

### D7 迁移纪律

- 单 schema 真相源在 `@fedstack/database`；迁移历史**线性**，**只能由本包生成与执行**，服务进程禁止触发迁移（证据：`schema.prisma` 头部注释）。
- 数据源 `url` 不在 schema 声明，由 `prisma.config.ts` 从环境变量注入（Prisma 7 约定）。
- 已落地迁移：`20261016014727_init_p0_auth`（证据：`packages/database/prisma/migrations/`）。

### D8 生成物与构建

- `prisma-client` 生成器，输出 `generated/prisma`（已被根 `.gitignore` 忽略），再由包编译进 `dist`，客户端经包入口导出（见 ADR-001）。

## 4. 备选方案与取舍

- **A. 保留 `User` model 增量改造（否决）**：命名 / 主键 / 审计全变，等于重写。
- **B. 沿用 `uuid` 主键（否决）**：与既有雪花设施重复，且雪花具备时间有序、防枚举优势。
- **C. 用 `prisma db push` 免迁移（否决）**：生产需要可审计、可回滚的迁移历史。
- **D. 继续使用 PostgreSQL（否决）**：基础设施已定 MySQL。
- **E. 各 app 自带 schema（否决）**：违背 ADR-001 单真相源纪律。

## 5. 后果

**正面**

- 命名与审计统一，schema 即文档。
- 迁移可审计、可回滚；生成物与构建路径明确。
- 雪花主键分布式唯一、时间有序；跨租户唯一约束在 DB 层兜底。

**负面 / 风险**

- 雪花 `workerId` / `datacenterId` 需运维分配且多实例唯一；时钟回拨会抛错（`Snowflake` 已实现检测，证据：`snowflake.ts` `Clock moved backwards`）。
- `@updatedAt` 由 Prisma 客户端维护：绕过 Prisma 的原生 SQL 更新不会刷新 `updated_at`。
- `Json` 列（如 `password_history`）在 MySQL 无索引能力，不能作查询条件。
- 软删除 + 唯一索引依赖墓碑化逻辑：任何直写 DB 的路径（脚本 / 人工）若不做墓碑化会撞唯一键。
- 枚举落库为小写、客户端为 UPPER，读写两侧存在映射，需保持一致。

## 6. 验证

| 校验              | 命令 / 方法                                                | 预期结果                                                              |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| 迁移生成与应用    | `pnpm --filter @fedstack/database exec prisma migrate dev` | 4 张核心表创建，无破坏性告警（已实测：`20261016014727_init_p0_auth`） |
| 类型检查          | `pnpm typecheck`                                           | 通过（客户端 BigInt 类型正确传播）                                    |
| 表名 / 列名       | `SHOW TABLES` / `SHOW COLUMNS`                             | 表名 `sys_*`，列名 snake_case                                         |
| 雪花主键生成      | 创建用户 / 角色                                            | 主键为 64 位雪花值，非自增                                            |
| 传输为 string     | `GET /api/users/:id`                                       | 响应中 id 为字符串，无 BigInt 序列化异常                              |
| 非法雪花入参      | `GET /api/users/abc`                                       | 400「雪花ID格式错误，必须数字字符串」                                 |
| 软删除 + 唯一索引 | 删除角色后以同 `roleCode` 重建                             | 成功（墓碑化生效）                                                    |
