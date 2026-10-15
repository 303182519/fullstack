# ADR-005：多租户采用共享表行级隔离（tenantId）

- 状态：已采纳（2026-10-15），随迁移 P0 起实施
- 日期：2026-10-15
- 影响范围：`packages/database`（schema 约定）、`apps/admin-api`（租户上下文、守卫、Prisma 扩展）、未来全部业务表
- 相关决策：ADR-001（单一 schema / 单一迁移历史）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`
- 相关规范：`AGENTS.md` §15/§16、`.rules/database/AGENTS.md`

---

## 1. 背景（事实依据）

- 2026-10-15 迁移访谈确认：本系统引入多租户能力。
- 上游 Nest-Admin-Soybean（对照基线 commit `83a83f7`，2026-10-15）即为多租户 SaaS：请求级租户上下文、Prisma 层自动注入 `tenantId`、`@IgnoreTenant()` 作为逃生舱、守卫链中设 TenantGuard。
- 本仓库为 MySQL 单库，Prisma 7.9.1 + `@prisma/adapter-mariadb`（ADR-001 D2/D8）。
- **Prisma 7 已移除 `$use` 中间件**：上游 Prisma 5 的 middleware 自动注入写法不能照抄，需改用 `$extends` 客户端扩展实现等价能力。
- schema 将推倒重设计且无迁移历史包袱（ADR-006 D1），`tenant_id` 列可在首批建表时一步到位。

## 2. 问题

租户隔离落在哪一层：共享表行级（tenantId 列）、每租户独立 schema（MySQL 中 schema 即 database）、还是每租户独立数据库。

## 3. 决策（最终）

- **D1 行级隔离**：所有租户级业务表统一携带非空 `tenant_id`（BigInt 雪花），逻辑引用 `sys_tenant`。表结构在建模期一步到位（ADR-006 D6），功能可分期上线。
- **D2 平台级白名单**：`sys_tenant`、`sys_tenant_package` 及明确的全局共享表（如平台级字典/参数）不带 `tenant_id`。白名单在 schema 注释与迁移路线图两处维护；新增平台级表须同步更新。
- **D3 自动注入兜底 + 显式传参为主**：admin-api 通过 Prisma `$extends` 实现租户过滤/注入（查询自动追加租户过滤、写入兜底注入与校验）；业务代码仍须显式传 tenantId，注入层是防泄漏底线而非唯一手段。
- **D4 租户上下文**：请求级租户上下文由 AsyncLocalStorage 承载，守卫在解析鉴权后写入；探针与公开端点无上下文，不得触碰租户级数据。
- **D5 越界防护三层**：守卫写入上下文 → `$extends` 注入过滤 → 每期集成测试覆盖跨租户读写越界用例（读他租户行不可见、写被拒绝或被改写归属）。
- **D6 索引纪律**：租户级表的二级索引以 `tenant_id` 为前导列。
- **D7 逃生舱受控**：等价 `@IgnoreTenant()` 的能力仅允许用于平台级表访问，使用处必须代码评审确认；禁止以「图省事」跳过租户过滤。

## 4. 备选方案与取舍

- **A. schema-per-tenant（否决）**：MySQL 中 schema 即 database，连接池、迁移、Prisma 多库支持全部复杂化；当前规模无此需求。
- **B. database-per-tenant（否决）**：运维成本最高，需要连接路由层；仅当出现强合规的物理隔离需求时另开 ADR。
- **C. 行级隔离但全靠手动 where（否决）**：隔离正确性依赖人工纪律，一处遗漏即数据泄漏；自动注入是安全底线（AGENTS.md §15/§16）。

## 5. 后果

**正面**

- 单库单连接池，运维与 ADR-001 约束完全兼容。
- 与上游概念模型一致，迁移上游业务逻辑时对照成本最低。
- 所有表结构演进仍走常规扩展-收缩模式。

**负面 / 风险**

- 租户级表永久携带 `tenant_id`，日后若改判为 database-per-tenant 需大规模迁移。
- `$extends` 注入层是安全关键路径，其正确性必须有测试守护；Prisma 升级时需回归该层。
- 平台级白名单靠纪律维护，存在误带 `tenant_id`（设计冗余）或漏带（越界风险）两类问题，靠 schema 评审拦截。

## 6. 实施记录

待 P0 实施（租户上下文骨架 + 首批含 tenant_id 的表）。实施完成后回填本节。

## 7. 验证计划

- 集成测试：跨租户读写越界（不可见/不可写）、无租户上下文访问受保护端点被拒。
- schema 评审：白名单外不得出现无 `tenant_id` 的业务表。
- `$extends` 层单元测试：过滤注入行为与逃生舱行为。

## 8. 遗留问题与已知风险

- P4 观察项（quota/audit/dashboard）落地时需复评平台级白名单与索引纪律。
- `apps/api` 后续若接入身份体系，租户上下文组件的归属需另议（迁移路线图「沉淀触发器」）。
