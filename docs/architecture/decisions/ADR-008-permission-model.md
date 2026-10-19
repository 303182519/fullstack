# ADR-008：权限模型（RBAC + 数据权限）

- 状态：已采纳（2026-10-16）
- 日期：2026-10-16（P1 实施后修订：D2/D3/D4 落地方式、§5 风险、§6 验证）
- 影响范围：`apps/admin-api/src/modules/`（menu/dept/role/user/tenant-package）、`apps/admin-api/src/shared/permission/`、`packages/database/prisma/schema.prisma`、`apps/admin-api/src/common/decorators/`、`apps/admin-api/src/common/guards/`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-005`（多租户方案）、`ADR-006`（schema 重设计）、`ADR-007`（认证策略）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`
- 契约快照：`docs/plans/contracts/phase-1.json`

---

## 1. 背景（事实依据）

- 上游 Nest-Admin-Soybean 实现了 RBAC 权限管理（证据：上游 README「RBAC 权限管理 - 基于角色的访问控制，细粒度权限控制」），支持菜单管理与数据权限（证据：上游 README「菜单管理 - 菜单树管理、路由配置、按钮权限」「角色管理 - 角色权限配置、数据权限范围」）。
- 上游的数据权限实现细节未在 README 中明确，但提到「数据权限 - 自动过滤数据范围」与 `@DataPermission` 装饰器（证据：上游 README「核心装饰器」章节）。
- 本仓库 GLOSSARY.md 已定义「数据权限分两档：全部数据、本部门及以下」（证据：GLOSSARY.md 「数据权限」条目）。
- 本仓库已采用多租户隔离方案（ADR-005）：共享表行级 `tenantId` + ALS 上下文传播；`$extends` 查询扩展自动注入为演进目标（当前 P0 为显式租户作用域，见 ADR-005 D3/D4）。
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
- 查询时，Service 层**显式**调用 `DataScopeService.scopeDeptWhere(scope)` 生成 `path LIKE '{currentUserDeptPath}%'` 条件，实现「本部门及以下」的过滤；未分配部门的主体收敛为「本租户内未分配部门的数据」（部门树不返回任何部门），不因缺部门而放大可见范围。

**取舍**：递归 CTE（MySQL 8 支持 `WITH RECURSIVE`）表达力更强但查询计划复杂、性能不可控；闭包表（closure table）查询最快但维护成本高（每插一个节点需写 O(depth) 行）。物化路径是读性能与维护成本的平衡点，且天然支持「以下所有层级」的语义。

### D3 权限校验分层：Guard 功能权限 + Service 显式数据权限

- **功能权限（Guard 层，声明式）**：全局 `PermissionGuard` 读取端点上 `@RequirePermission('system:user:add', ...)` 声明的权限编码（`Reflector.getAllAndOverride`），调用 `PermissionService.hasAnyPermission` 校验当前主体角色链路上的 `menu.perm_code` 是否命中（任一命中即通过；`isSuper` 不受约束；未标注的端点直接放行）。守卫注册在 `JwtAuthGuard` 之后（执行顺序=APP_GUARD 注册顺序），可安全读取 `request.user`。
- **数据权限（Service 层，显式调用）**：`DataScopeService.resolve()` 解析当前主体范围（任一角色 `ALL` 即 `ALL`，否则 `DEPT_AND_CHILD` + 主体部门 `path`），由受控查询**显式**调用 `scopeUserWhere` / `scopeDeptWhere` 生成 where 片段并入自身条件：
  - `ALL`：返回 `{}`，不额外限制；
  - `DEPT_AND_CHILD`：`{ dept: { path: { startsWith: '{deptPath}' } } }`；主体无部门时收敛为 `{ deptId: null }`（用户）/ `{ id: { in: [] } }`（部门树）。

**取舍（关键，含对原设想的修正）**：原计划的数据权限用 `@DataPermission` 装饰器在 ORM 层自动注入 WHERE，但 **Prisma 7 已移除 query middleware**，无法在 ORM 层透明改写任意查询的 where（仅剩驱动适配器/`$extends`，覆盖面与可测性均不满足）。故改为 Service 层显式调用：不做「装饰器+反射注入」这层间接，查询处即能看到过滤来源，可读、可测、可审（`data-scope.service.ts` 头部注释即此结论）。功能权限仍放 Guard 层符合 NestJS idiomatic（声明式、可组合）。**未创建 `@DataPermission` 装饰器**，避免留下无调用点的死代码。

### D4 平台级 vs 租户级数据边界

| 数据类型                   | 归属       | 理由                                                                     |
| -------------------------- | ---------- | ------------------------------------------------------------------------ |
| 菜单（sys_menu）           | 平台级为主 | 系统功能由平台统一规划，租户只读使用；租户自定义菜单走「租户级菜单」扩展 |
| 字典（sys_dict_type/data） | 平台级为主 | 基础数据标准统一（如性别、状态码），避免租户间语义漂移                   |
| 参数配置（sys_config）     | 租户级     | 业务参数（如审批流程开关、通知模板）各租户独立                           |
| 通知公告（sys_notice）     | 租户级     | 各租户发布自己的公告，互不干扰                                           |
| 部门（sys_dept）           | 租户级     | 组织架构天然属于租户                                                     |
| 用户/角色（sys_user/role） | 租户级     | 账号体系按租户隔离                                                       |

**取舍**：全部平台级则租户无自定义空间，全部租户级则平台无法统一管理系统功能。按数据性质划分边界，兼顾标准化与灵活性。

**套餐（P1 落地）**：`sys_tenant_package` + `sys_tenant_package_menu`（平台级）+ `sys_tenant.package_id`（可空）构成「功能授权上限」。语义（`MenuService.resolveLicensedMenuIds`）：

- **未绑套餐（`package_id IS NULL`）**：视为平台**全部启用**菜单可用（默认放开，兼容存量租户与「标准全量」场景）；
- **已绑套餐**：收敛为该套餐绑定的平台菜单集合（`packageMenus.some({ packageId })`），**fail closed**——从套餐移除某菜单后，该菜单自动退出许可集合，即使租户角色仍残留旧绑定也不再被判定为有权限。

角色授权（`RoleService.authorizeMenus`）以此为校验边界：提交的菜单 ID 只要有一个不在许可集合内即整体拒绝（错误码 `30A05`），防止越权授予未开通功能。套餐的增改删与菜单绑定均限平台超管（`SuperAdminGuard`）。

## 4. 备选方案与取舍

- **A. 菜单只进两级，按钮前端控制（否决）**：API 级鉴权缺失，用户可直接调用隐藏按钮对应的接口。
- **B. 数据权限用递归 CTE（否决）**：MySQL 递归查询性能随深度线性下降，且 Prisma 对 CTE 支持有限，需写原生 SQL，破坏类型安全。
- **C. 数据权限用闭包表（否决）**：写放大严重（每插节点需写 O(depth) 闭包行），部门调整时事务复杂度高。
- **D. 功能权限放 Service 层手动校验（否决）**：遗漏风险高，且与 NestJS Guard 的声明式哲学相悖。
- **E. 菜单全部租户级（否决）**：平台无法统一规划系统功能，各租户菜单漂移导致运维困难。
- **F. 数据权限用 `@DataPermission` 装饰器在 ORM 层自动注入（否决）**：Prisma 7 已移除 query middleware，无透明改写任意查询 where 的能力；退而用 `$extends` 覆盖面有限且难测。改为 Service 层显式调用（见 D3）。
- **G. `@RequirePermission` 走反射自动推导（否决）**：从路由字符串反推权限码需维护一张映射表，且与「代码即文档」相悖。改为端点显式标注装饰器。

## 5. 后果

**正面**

- 功能权限粒度到按钮/API，满足企业级审计要求。
- 数据权限查询性能可控（物化路径索引覆盖，避免递归）。
- 权限模型与多租户方案正交：`tenantId` 过滤由显式租户作用域完成（`$extends` 自动注入为演进目标，见 ADR-005），`dataScope` 过滤由 `DataScopeService` 显式生成 where 片段，两者不互相干扰。
- 平台级/租户级边界清晰，为后续「租户套餐」功能（P1）奠定基础。

**负面 / 风险**

- 物化路径在部门树调整（移动节点）时需级联更新子树路径，写操作复杂度增加。缓解：部门移动是低频操作，且可在事务内批量更新。
- `perm_code` 与路由的映射关系需要维护（如 `POST /api/users` 对应 `system:user:add`）。缓解：权限码集中登记在共享包 `@fedstack/auth-core`（`as const` 注册表 + `PermissionCode` 字面量联合；2026-10-19 由 `apps/admin-api/src/common/constants/permissions.ts` 迁入，见 ADR-010），装饰器写作 `@RequirePermission(PERMISSIONS.SYSTEM.USER.ADD)`——未登记/拼错即编译错误；P2 播种脚本与前端均 import 同一份常量，不产生二次硬编码。代码即文档。
- 三级菜单 + 平台级/租户级双维度，菜单管理界面复杂度增加。缓解：P1 先实现平台级菜单管理，租户级菜单作为后续扩展。
- **权限解析不做缓存（P1 有意取舍）**：受控端点每次请求做一次索引查询（`sys_user_role` / `sys_role_menu` 均建索引）。缓存能省这次查询，但授权变更后旧缓存未及时失效会造成**越权或误拒**（安全敏感）；后台管理端流量低，单次索引查询开销可忽略，故选择「不缓存」以规避一致性风险。P1 未引入任何权限缓存，因而**不存在缓存失效残风险**；后续如流量上升，再引入带显式失效（授权/绑定时主动清除）的缓存，届时应重新评审本 ADR。
- **套餐变更的语义缺口**：移除套餐内菜单不会级联删除既有租户的角色绑定，但该菜单即时退出许可集合（fail closed），表现为「权限自动失效」而非报错。缓解：此为有意设计，避免级联写入放大；如业务要求显式提示，可在 P2 增补审计事件。
- **数据权限主体的写路径**：非超管主体的 list/detail/create/update/remove 与部门树均并入 scope；`create/update` 的部门可分配性以 `scopeDeptWhere` 约束（错误码 `20A07`）。残风险：`DataScope.DEPT_AND_CHILD` 为默认档，P0 存量用户 `deptId` 全为 null，首次启用时 scope 收敛为 `{ deptId: null }`，对存量数据无损但会「看不到」已有部门数据，需在播种/初始化时为管理员用户分配部门。

## 6. 验证（P1 实施后）

**自动化校验（本轮已实际执行，全部通过）**

| 校验         | 命令                                                                          | 结果                                                                             |
| ------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 类型检查     | `pnpm --filter admin-api exec tsc --noEmit`                                   | 0 错误                                                                           |
| 构建         | `pnpm --filter admin-api build`                                               | 成功                                                                             |
| 单元测试     | `pnpm --filter admin-api test`                                                | 全绿（含 dept/menu/package/permission/data-scope 新增用例与 user/role 既有用例） |
| Lint（新增） | `pnpm --filter admin-api exec eslint <新增/改动文件>`                         | 0 问题                                                                           |
| 契约快照     | 启动 admin-api 抓取 `GET /swagger-json` → `docs/plans/contracts/phase-1.json` | 已生成，含 dept/menu/packages/roles 授权等新增端点                               |

**行为验收（需真实数据库/Redis 环境，P1 生产代码与单测已覆盖逻辑，端到端待接入环境后补跑）**

| 校验          | 方法                                                  | 预期结果                                   |
| ------------- | ----------------------------------------------------- | ------------------------------------------ |
| 按钮级权限    | 无 `system:user:add` 权限的主体调用 `POST /api/users` | 403 Forbidden                              |
| 数据权限 ALL  | 角色 `data_scope = ALL` 查询用户列表                  | 可见本租户全部用户                         |
| 数据权限 DEPT | 角色 `data_scope = DEPT_AND_CHILD` 查询用户列表       | 仅可见本部门及子部门用户                   |
| 物化路径      | 查询 `sys_dept.path`                                  | 格式为 `/ancestorId/.../selfId/`           |
| 套餐收敛      | 租户绑定套餐后调用 `GET /api/menus/available`         | 仅返回套餐许可菜单；移除套餐菜单后即时失效 |
| 未许可授权    | 对租户角色授予未在套餐内的菜单                        | `30A05`                                    |
| 平台级菜单    | 查询 `sys_menu WHERE tenant_id IS NULL`               | 返回平台级菜单（如「系统管理」）           |

> 说明：菜单/角色授权/套餐的**数据播种**不在 P1（P1 只交付表结构与端点），故上表行为验收需在 P2 播种后执行。
