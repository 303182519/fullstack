# ADR-005：多租户隔离方案（共享表行级 tenantId）

- 状态：已采纳（2026-10-15）
- 日期：2026-10-15
- 影响范围：`packages/database/prisma/schema.prisma`、`apps/admin-api/src/common/context/`、`apps/admin-api/src/common/guards/`、`apps/admin-api/src/modules/`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`、`.rules/database/AGENTS.md`；关联文档：`ADR-001`（共享持久化层）、`ADR-006`（schema 重设计）、`ADR-007`（认证策略）、`ADR-008`（权限模型）、`GLOSSARY.md`、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。

---

## 1. 背景（事实依据）

- 迁移目标上游 `linlingqin77/Nest-Admin-Soybean@83a83f7` 是**多租户 SaaS 后台**（证据：迁移路线图首部基线说明与 §1「目标架构」：上游 NestJS 10 + Prisma 5 + PostgreSQL，目标 NestJS 12 + Prisma 7.9.1 + MySQL + Redis）。
- 上游基于 **Prisma 5**，其多租户数据过滤依赖 Prisma middleware（`$use`）；**Prisma 7 已移除 middleware**（证据：本仓库依赖 `@prisma/client@7.9.1`，无 `$use` 机制）→ 上游写法**不可照抄**。
- 本仓库持久化层已收敛为共享包 `@fedstack/database`（单 schema 真相源，见 ADR-001），数据源为 **MySQL**（证据：`packages/database/prisma/schema.prisma` 的 `datasource db { provider = "mysql" }`）。
- 本仓库已有 `nestjs-cls` + `@nestjs-cls/transactional` 依赖（证据：`apps/admin-api/package.json`），并以 `RequestContextService` 作为请求上下文（AsyncLocalStorage/CLS）的**唯一门面**（证据：`apps/admin-api/src/common/context/request-context.service.ts` 类注释「全应用访问请求上下文的唯一入口」）。
- 领域术语已在 `GLOSSARY.md` 定义：租户 / 平台 / 租户上下文 / 平台级数据 / 租户级数据（证据：`GLOSSARY.md`「多租户」「数据组织」章节）。
- 认证主体已携带租户事实：`AuthPrincipal.tenantId`、会话记录 `SessionRecord.tenantId`、access JWT 载荷 `tid`（证据：`apps/admin-api/src/shared/auth/auth.types.ts`）。

## 2. 问题

同一系统实例服务多个互不可见的组织，数据隔离是**系统级约束**而非业务功能。任何一个查询路径遗漏租户过滤，都会造成**跨租户数据泄露**（生产事故级）。需要决策：

1. 隔离模型：独立库 / 独立 schema / 共享表行级？
2. 租户上下文如何解析与传播？
3. 租户过滤由谁执行：应用层显式 / 框架自动 / 数据库策略？

## 3. 决策（最终）

### D1 隔离模型：共享表 + 行级 tenantId

- 单库单 schema，多租户**共享物理表**；租户归属由 `tenant_id` 列表达，租户级查询一律以 `tenant_id` 过滤。
- 平台级数据以 `tenant_id IS NULL` 表达（如系统菜单；见 ADR-008 D4）。

**取舍**：独立库 / 独立 schema 隔离最强，但运维与迁移成本随租户数**线性增长**（每租户一套迁移、连接池、备份），不可持续；共享表 + 行级隔离是 SaaS 主流（成本与读性能最优），代价是隔离强度依赖应用层纪律。

### D2 租户上下文：由服务端认证结果确定，经 ALS 传播

- 租户上下文**不来自客户端可篡改的入参**（如请求头 / 请求体的 tenantId），而来自**服务端认证结果**：登录时校验租户（`tenantCode`）+ 账号，租户事实随 JWT 与会话签发（证据：ADR-007 D1 与 `AccessTokenPayload.tid`）。
- 请求生命周期内租户上下文写入 AsyncLocalStorage（nestjs-cls），仅经 `RequestContextService` 读写（不散落 CLS 字符串 key）。
- **无租户上下文的请求不得触碰租户级数据**（调用 `requireUser()` 无主体即抛错，证据：`request-context.service.ts`）。

**取舍**：从请求头解析租户（如 `X-Tenant-Id`）看似灵活，但把隔离边界交给客户端可控输入，属安全反模式（违反 `AGENTS.md` §15「前端校验不能作为安全防线」）。

### D3 执行方式（当前）：显式租户作用域

- 租户级 Service 通过统一私有方法 `currentTenantId(): bigint`（= `BigInt(requestContext.requireUser().tenantId)`）取租户，并**显式**作为查询 / 写入条件（证据：`modules/user/user.service.ts`、`modules/role/role.service.ts` 的 `currentTenantId()`）。
- **P0 不引入** `$extends` 自动注入：显式作用域是当前**唯一防线**。

**取舍**：早引入自动注入可减少遗漏，但 P0 表少、调用路径清晰，自动注入的豁免边界（跨租户运维查询、平台级查询、关联查询、按主键直达）尚未稳定；过早抽象会引入难排查的隐式行为。分阶段落地（见 D4）更可控。

### D4 目标演进：`$extends` 查询扩展自动注入（纵深防御）

- Prisma 7 以 `$extends`（client / query extension）替代 Prisma 5 的 middleware：计划对租户级模型自动注入 `where.tenantId`，使应用层显式过滤从「唯一防线」转为「第一道防线 + 自动兜底」。
- 落地前须先定义**豁免规则**（平台级查询、`isSuper` 跨租户、按主键直达、种子 / 迁移脚本），避免误伤。

**取舍**：DB 层行级安全策略（如 PostgreSQL RLS）隔离最强，但 **MySQL 无等价 RLS**，DB 层无法兜底，只能靠应用层。

### D5 平台级 / 租户级数据边界

- 平台级（`tenant_id` 可空）：系统菜单、字典定义等由平台统一维护的数据。
- 租户级（`tenant_id` 必填）：用户、角色、部门、参数配置、通知公告等。
- 边界表以 **ADR-008 D4** 为准，本文不重复定义。

### D6 唯一性约束按租户作用域

- 唯一索引一律带 `tenant_id` 前缀（`uniq_tenant_username`、`uniq_tenant_email`、`uniq_tenant_role_code`），允许跨租户重名（证据：`packages/database/prisma/schema.prisma`）。
- 软删除与唯一索引冲突采用**墓碑化**：软删除时改写唯一列（如 `原名__deleted__<id>`，按列宽裁剪；可空唯一列直接置 null）。落地见 ADR-006 D6。

### D7 超级管理员跨租户

- `isSuper` 主体为平台运维，可跨租户操作；平台级端点（`/api/tenants`）由 `SuperAdminGuard` 约束（证据：`modules/tenant/tenant.controller.ts`）。
- 超级身份由**服务端**判定并签发（进 JWT / 会话），不信任客户端声明。

## 4. 备选方案与取舍

- **A. 每租户独立库 / 独立 schema（否决）**：迁移、备份、连接池成本随租户数线性增长，与小团队运维能力不匹配。
- **B. 仅靠代码评审保证 tenantId 过滤（否决）**：无法自动化，遗漏即泄露。
- **C. 照抄上游 Prisma 5 middleware 写法（否决）**：Prisma 7 无 middleware，机制不存在。
- **D. 从客户端入参解析租户（否决）**：把安全防线交给不可信输入。
- **E. PostgreSQL RLS 兜底（不适用）**：基础设施已定 MySQL，无等价行级安全策略。

## 5. 后果

**正面**

- 单库单 schema：迁移、备份、连接池运维成本与租户数**无关**。
- 隔离与 RBAC 正交：租户过滤（`tenantId`）与数据权限（`dataScope`）互不干扰（见 ADR-008 D3）。
- 跨租户唯一冲突在 DB 层兜底（唯一索引），不完全依赖应用层。

**负面 / 风险**

- **无 DB 层兜底**（MySQL 无 RLS）：应用层遗漏即泄露。缓解：统一 `currentTenantId()` 入口 + 跨租户隔离集成测试 + 代码评审。
- 显式作用域分散在各 Service：缓解：收敛为统一私有方法，禁止各写各的过滤口径。
- `$extends` 自动注入**尚未落地**（P0 有意推迟）：缓解：记入待办，作为纵深防御第二道防线。
- 大表需 `tenant_id`（或含租户的复合）索引，否则全表扫描。
- Redis 降级场景：守卫凭 access 令牌重建主体（`tid` 来自令牌），租户事实依赖 JWT 签名完整性——签名校验不可省。

## 6. 验证

| 校验                       | 命令 / 方法                                      | 预期结果                                                           |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| P0 表结构                  | `packages/database/prisma/schema.prisma` 迁移    | 4 张核心表创建，租户级表均含 `tenant_id`（已实测：`init_p0_auth`） |
| 跨租户重名                 | 两个租户下同 username 建用户                     | 均成功（唯一索引带租户前缀生效）                                   |
| 租户内重名                 | 同租户下重复 username 建用户                     | 返回冲突错误（P2002 → `20A02`）                                    |
| 无租户上下文访问租户级数据 | 非请求上下文直接调 `requireUser()`               | 抛错，不返回租户级数据                                             |
| 软删除后重建同名           | 删除用户后以同名重建                             | 成功（墓碑化释放唯一索引）                                         |
| 平台级端点鉴权             | 非 `isSuper` 主体调 `GET /api/tenants`           | 403 Forbidden                                                      |
| `$extends` 自动注入        | （P1/P2 落地后）省略显式 `tenantId` 查询租户级表 | 结果仍被隐式限定在当前租户（待补）                                 |
