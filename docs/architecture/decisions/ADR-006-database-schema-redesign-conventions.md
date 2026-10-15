# ADR-006：数据库 schema 推倒重设计与建模规范

- 状态：已采纳（2026-10-15），随 P0 首个 migration 实施
- 日期：2026-10-15
- 影响范围：`packages/database/prisma/schema.prisma`、未来全部 migration
- 相关决策：ADR-001（D1 单一 schema、D7 迁移独立部署步骤）、ADR-005（tenant_id）
- 相关规范：`.rules/database/AGENTS.md`、`AGENTS.md` §13

---

## 1. 背景（事实依据）

- 现有 schema 仅一个测试用 `User` model，2026-10-15 确认可删除。
- `packages/database/prisma/` 下不存在 `migrations/` 目录（2026-10-15 核实），推倒重设计无历史包袱。
- 上游 Nest-Admin-Soybean 的 Prisma schema 共 48 个 model，为 PostgreSQL 方言（jsonb、数组、uuid 主键）并含 RuoYi 历史妥协产物；其 `init.sql`（25 表）与 Prisma schema（48 model）数量不一致，上游自身不同步。
- 现有 `User` model 已确立本仓库建模雏形：BigInt 雪花主键（代码层生成，不 autoincrement）、`created_at/updated_at/deleted_at` 统一审计字段、`@map` snake_case。
- 雪花生成器已有实现：`apps/admin-api/src/shared/utils/snowflake.ts`（main.ts 初始化，workerId/datacenterId 由配置注入），配套 `ParseSnowflakePipe`（入参侧）。

## 2. 问题

schema 从上游照抄后改方言，还是按本仓库规范从零重设计。

## 3. 决策（最终）

- **D1 推倒重来**：删除 `User` model，从零建模，P0 起按期新增。
- **D2 命名规范**：Prisma model 用 PascalCase 单数（`SysUser`）+ `@@map("sys_user")`；字段 camelCase + `@map` snake_case；保留 `sys_` 前缀便于与上游源码对照；非后台管理域的未来业务表可用其他前缀（如 `biz_`）。
- **D3 主键**：全部 BigInt 雪花 ID，应用层生成（复用 `snowflake.ts` 方案），不使用自增与 uuid 字符串主键。
- **D4 审计字段统一**：`created_at` / `updated_at` / `deleted_at`（软删除，null=未删除）；`created_by` / `updated_by` 按表需要添加。
- **D5 方言转换规则**：PG `jsonb` → MySQL `Json`；PG 数组字段 → 关联表或 `Json`；`uuid` → 雪花 BigInt；`timestamptz` → `DateTime(3)`。转换在建模时显式决策，不做机械替换。
- **D6 租户列一步到位**：租户级表自首个 migration 起即带 `tenant_id`（ADR-005 D1），功能分期不影响列设计。
- **D7 不迁上游历史妥协**：迁移路线图「不做清单」对应的表不建模（post 岗位等）；上游因自身缺陷打的补丁逻辑一律不迁。
- **D8 迁移纪律沿用 ADR-001**：单一迁移历史、`migrate deploy` 作为独立部署步骤、服务进程禁止触发迁移、扩展-收缩模式。

## 4. 备选方案与取舍

- **A. 字段级对齐上游 RuoYi 结构（否决）**：会把上游命名与类型债带入本仓库血统，长期维护成本更高。
- **B. 抄上游 48 个 model 改方言（否决）**：包含上游迁移期新增的矛盾模型与未注册模块的孤儿表。

## 5. 后果

**正面**

- schema 与本仓库规范、命名、主键策略一致，无外来方言债。
- `sys_` 前缀保留上游对照锚点，迁移业务逻辑时仍可快速定位参考实现。

**负面 / 风险**

- 前几期与上游 diff 成本略高：字段名差异需在 DTO/Service 层显式映射消化。
- BigInt 跨 JSON 序列化有精度丢失风险（超出 JS Number 安全整数范围），必须统一 bigint→字符串的序列化策略（列入 P0 实施项）。

## 6. 实施记录

待 P0 实施。完成后回填。

## 7. 验证计划

- 每个 migration：`prisma validate` + `prisma migrate dev`（本地 MySQL）+ `migrate deploy`（目标环境）。
- `turbo run typecheck` 通过（生成类型与代码一致）。

## 8. 遗留问题与已知风险

- bigint 序列化统一方案待 P0 落地（响应拦截器或 DTO transformer 择一）。
- `apps/api` 与 `admin-api` 共库（ADR-001 背景），新增表对两个 app 的可见性边界在 P0 评审时明确。
