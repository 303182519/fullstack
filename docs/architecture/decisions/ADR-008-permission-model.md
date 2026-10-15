# ADR-008：权限模型（RBAC + 数据权限）

- 状态：已采纳（2026-10-16）
- 日期：2026-10-16
- 影响范围：`apps/admin-api/src/modules/`（menu/dept/role/user）、`packages/database/prisma/schema.prisma`、`apps/admin-api/src/common/decorators/`、`apps/admin-api/src/common/guards/`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-005`（多租户方案）、`ADR-006`（schema 重设计）、`ADR-007`（认证策略）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

---

## 1. 背景（事实依据）

- 上游 Nest-Admin-Soybean 实现了 RBAC 权限管理（证据：上游 README「RBAC 权限管理 - 基于角色的访问控制，细粒度权限控制」），支持菜单管理与数据权限（证据：上游 README「菜单管理 - 菜单树管理、路由配置、按钮权限」「角色管理 - 角色权限配置、数据权限范围」）。
- 上游的数据权限实现细节未在 README 中明确，但提到「数据权限 - 自动过滤数据范围」与 `@DataPermission` 装饰器（证据：上游 README「核心装饰器」章节）。
- 本仓库 GLOSSARY.md 已定义「数据权限分两档：全部数据、本部门及以下」（证据：GLOSSARY.md 「数据权限」条目）。
- 本仓库已有多租户方案（ADR-005）：共享表行级 `tenantId`，ALS 上下文 + `$extends` 自动注入。
- 本仓库已有 `@nestjs-cls/transactional` 依赖，支持在事务上下文中访问 CLS 存储的租户与用户信息。

## 2. 问题

企业级多租户后台需要同时解决两个维度的权限控制：
1. **功能权限**：用户能访问哪些菜单、哪些按钮（API 端点）？
2. **数据权限**：用户在已授权的功能内，能看到哪些数据行？

上游的 RBAC + 数据权限方案需要适配到本项目的 Prisma 7 + MySQL + 多租户架构中，且不能照搬上游的实现细节（Prisma 5 middleware 在 Prisma 7 中不存在）。

## 3. 决策（最终）

### D1 菜单权限三级进库：目录 → 菜单 → 按钮

- `sys_menu.menu_type` 区分三级：`DIRECTORY`（目录，纯分组）、`MENU`（页面，有路由）、`BUTTON`（操作点，对应具体 API）。
- 按钮级权限通过 `perm_code` 字段控制到 API 粒度（如 `system:user:add`）。
- 菜单支持平台级（`tenant_id IS NULL`）与租户级（`tenant_id = {id}`）——平台级菜单为所有租户共享的系统功能（如「租户管理」），租户级菜单为租户自定义功能（如「我的报表」）。

**取舍**：只进「目录 + 菜单」两级、按钮走前端控制，实现更简单但无法做 API 级鉴权；纯前端按钮控制存在「直接调 API 绕过界面」的安全漏洞。三级进库 + 按钮级 perm_code 是企业级最小粒度。

### D2 数据权限两档：物化路径实现

- `sys_role.data_scope` 字段：`ALL`（全部数据）或 `DEPT_AND_CHILD`（本部门及以下）。
- 部门表 `sys_dept` 增加 `path` 字段，存储物化路径（如 `/1/3/5/`），表示该部门在树中的完整祖先链。
- 查询时，`@DataPermission({ deptAlias: 'd' })` 装饰器自动注入 `d.path LIKE '{currentUserDeptPath}%'` 条件，实现「本部门及以下」的过滤。

**取舍**：递归 CTE（MySQL 8 支持 `WITH RECURSIVE`）表达力更强但查询计划复杂、性能不可控；闭包表（closure table）查询最快但维护成本高（每插一个节点需写 O(depth) 行）。物化路径是读性能与维护成本的平衡点，且天然支持「以下所有层级」的语义。

### D3 权限校验分层：Guard 功能权限 + 装饰器数据权限

- **功能权限**：全局 `PermissionGuard` 读取当前请求的 `perm_code`（从路由元数据或 `menu.perm_code` 推导），校验用户角色是否包含该权限编码。
- **数据权限**：`@DataPermission` 装饰器在 Service 层方法调用前，根据当前用户的 `dataScope` 自动注入 WHERE 条件：
  - `ALL`：不注入额外条件
  - `DEPT_AND_CHILD`：注入 `dept.path LIKE '{deptPath}%'`

**取舍**：Guard 统一做功能权限符合 NestJS  idiomatic（声明式、可组合）；数据权限放 Service 层是因为过滤条件与具体查询逻辑耦合（不同查询可能需要 join 不同表），Guard 层无法优雅处理。

### D4 平台级 vs 租户级数据边界

| 数据类型 | 归属 | 理由 |
|---------|------|------|
| 菜单（sys_menu） | 平台级为主 | 系统功能由平台统一规划，租户只读使用；租户自定义菜单走「租户级菜单」扩展 |
| 字典（sys_dict_type/data） | 平台级为主 | 基础数据标准统一（如性别、状态码），避免租户间语义漂移 |
| 参数配置（sys_config） | 租户级 | 业务参数（如审批流程开关、通知模板）各租户独立 |
| 通知公告（sys_notice） | 租户级 | 各租户发布自己的公告，互不干扰 |
| 部门（sys_dept） | 租户级 | 组织架构天然属于租户 |
| 用户/角色（sys_user/role） | 租户级 | 账号体系按租户隔离 |

**取舍**：全部平台级则租户无自定义空间，全部租户级则平台无法统一管理系统功能。按数据性质划分边界，兼顾标准化与灵活性。

## 4. 备选方案与取舍

- **A. 菜单只进两级，按钮前端控制（否决）**：API 级鉴权缺失，用户可直接调用隐藏按钮对应的接口。
- **B. 数据权限用递归 CTE（否决）**：MySQL 递归查询性能随深度线性下降，且 Prisma 对 CTE 支持有限，需写原生 SQL，破坏类型安全。
- **C. 数据权限用闭包表（否决）**：写放大严重（每插节点需写 O(depth) 闭包行），部门调整时事务复杂度高。
- **D. 功能权限放 Service 层手动校验（否决）**：遗漏风险高，且与 NestJS Guard 的声明式哲学相悖。
- **E. 菜单全部租户级（否决）**：平台无法统一规划系统功能，各租户菜单漂移导致运维困难。

## 5. 后果

**正面**

- 功能权限粒度到按钮/API，满足企业级审计要求。
- 数据权限查询性能可控（物化路径索引覆盖，避免递归）。
- 权限模型与多租户方案正交：`tenantId` 过滤由 ALS + `$extends` 自动完成，`dataScope` 过滤由 `@DataPermission` 显式声明，两者不互相干扰。
- 平台级/租户级边界清晰，为后续「租户套餐」功能（P1）奠定基础。

**负面 / 风险**

- 物化路径在部门树调整（移动节点）时需级联更新子树路径，写操作复杂度增加。缓解：部门移动是低频操作，且可在事务内批量更新。
- `perm_code` 与路由的映射关系需要维护（如 `POST /api/users` 对应 `system:user:add`）。缓解：通过装饰器 `@RequirePermission('system:user:add')` 显式声明，代码即文档。
- 三级菜单 + 平台级/租户级双维度，菜单管理界面复杂度增加。缓解：P1 先实现平台级菜单管理，租户级菜单作为后续扩展。

## 6. 验证（待 P1 实施后补充）

| 校验 | 命令/方法 | 预期结果 |
|------|----------|----------|
| 菜单三级 | 查询 `sys_menu` 按 `menu_type` 分组 | 存在 DIRECTORY / MENU / BUTTON 三类记录 |
| 按钮级权限 | 无 `system:user:add` 权限的用户调用 POST /api/users | 返回 403 Forbidden |
| 数据权限 ALL | 角色 `data_scope = ALL` 查询用户列表 | 可见本租户全部用户 |
| 数据权限 DEPT | 角色 `data_scope = DEPT_AND_CHILD` 查询用户列表 | 仅可见本部门及子部门用户 |
| 物化路径 | 查询 `sys_dept.path` | 格式为 `/ ancestorId/.../selfId/` |
| 平台级菜单 | 查询 `sys_menu WHERE tenant_id IS NULL` | 返回系统级菜单（如「系统管理」） |
| 租户级参数 | 查询 `sys_config WHERE tenant_id = {id}` | 仅返回该租户的配置 |
