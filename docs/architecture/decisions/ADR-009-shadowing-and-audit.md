# ADR-009：字典/参数遮蔽语义与审计底座

- 状态：已采纳（2026-10-18）
- 日期：2026-10-18（P2 实施）
- 影响范围：`apps/admin-api/src/modules/`（dict/config/monitor）、`apps/admin-api/src/shared/audit/`、`apps/admin-api/src/shared/scope/`、`packages/auth-core`（功能权限码注册表，2026-10-19 自 `apps/admin-api/src/common/constants/permissions.ts` 迁入，见 ADR-010）、`packages/database/prisma/schema.prisma`、`packages/database/src/seed.ts`
- 相关规范：前置文档 `ADR-005`（多租户）、`ADR-006`（schema 重设计）、`ADR-007`（认证与会话）、`ADR-008`（权限模型）；迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

> **2026-10-22 规范章节号迁移注记（ADR-014）**：根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，本 ADR 正文中的 `AGENTS.md §13` / `§14` / `§15` 不再对应（数据库边界现位于 `docs/rules/stack/database.md` §2；Redis 边界现位于 `docs/rules/cross-cutting/failure-and-resilience.md` §2；凭据与不信任客户端纪律现位于 `docs/rules/cross-cutting/security-and-authorization.md`）。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。
- 契约快照：`docs/plans/contracts/phase-2.json`

---

## 1. 背景（事实依据）

- 上游 Nest-Admin-Soybean 提供字典管理、参数设置、操作日志、登录日志、在线用户（证据：上游 README 功能列表与 P2 调研基线 commit `83a83f7`）。
- 本仓库多租户隔离采用共享表行级 `tenantId`（ADR-005）；MySQL 为权威数据源（AGENTS.md §13），Redis 不作为权威数据源（§14）。
- ADR-006 确立 schema 纪律：PascalCase model + `sys_*` 表名、雪花 BigInt 主键（代码生成）、统一审计列。
- 平台级数据（`tenant_id IS NULL`）在 MySQL 唯一索引中**不参与唯一性判定**（NULL ≠ NULL），DB 无法兜底平台级唯一。
- Prisma 7 无 middleware；权限底座见 ADR-008（功能权限 Guard + 数据权限 Service 显式调用）。

## 2. 问题

P2 需要回答四类问题：

1. 字典/参数这类「平台定标准、租户可定制」的数据，租户级定义与平台级定义如何共存？
2. 平台级（tenantId=NULL）唯一性 DB 管不住，怎么防止重复定义？
3. 管理端写操作的审计（谁、何时、做了什么、结果）如何在不大面积侵入业务代码、不拖慢响应的前提下落地？
4. 在线用户列表/强制下线如何在不给会话写路径增加新不变量的前提下实现跨用户查询？

## 3. 决策（最终）

### D1 操作作用域注入：一套端点按主体解析（ScopeResolverService）

- 租户管理员（非 isSuper）：恒定本租户，请求中任何 `tenantId` 参数一律忽略（不信任客户端，AGENTS.md §15）；
- 平台超管（isSuper）：默认平台级（`tenantId=null`）；显式带 `?tenantId=` 时**代管**该租户（雪花数字串校验，非法报 `00A01`）；
- 消费端（字典下拉、参数取值）：按调用者自身租户解析；平台超管视为平台级。

实现：`shared/scope/scope-resolver.service.ts`（@Global），业务 Service 显式调用 `resolve()` / `resolveConsumer()`。

**取舍**：不做「每租户一套端点」（路由爆炸、鉴权重复），也不做「Middleware 自动改写」（Prisma 7 无 middleware，且与 ADR-008 D3「显式可审」原则一致）。

### D2 遮蔽语义（shadow）：整体遮蔽，不合并

- 租户对某个 `dictType` / `configKey` 存在**未删除**的定义（与 `status` 无关）→ 该键在消费端**整体**取租户级数据，平台级数据不参与合并；
- 租户无自有定义 → 直接取平台级数据；
- 管理列表返回双层级合并视图，平台行带 `shadowed` 标记供平台侧对照。

**取舍**：按条目合并（租户覆盖部分条目）语义更灵活，但「同键一半平台一半租户」在排障时极难解释；整体遮蔽边界清晰——**租户一旦接管某键，就是它的全部**。禁用（status=DISABLED）的自有定义仍遮蔽：租户显式停用某键 ≠ 交还给平台。

### D3 平台级唯一性：服务层兜底 + 复活语义 + P2002 收口

- 创建前服务层查重（作用域内、未删除）→ 命中报 `80A02` / `90A02`；
- 同键**软删行复活**（update `deletedAt=null`），避免唯一索引（含软删行）挡住重建；
- 租户级并发由 DB 唯一索引 `(tenantId, dict_type, dict_value)` / `(tenantId, config_key)` 兜底，捕获 `P2002` 转 conflict；
- **平台级极端并发窗口**（两个超管同时创建同键平台定义）仍可能重复——触发面仅平台超管，量级极低，已接受并在代码注释声明。MySQL 唯一索引对 NULL 不生效是物理限制，不为它引入「影子行 / 触发器」类补偿机制。

### D4 缓存：cache-aside + 写时失效，只缓存「值」不缓存「判定」

- 消费端读：`CacheService.get` → miss → 查库（先判自有定义，再取行）→ `set`（默认 TTL）；
- 写路径（创建/更新/删除/复活）：删除对应 `DICT_OPTIONS` / `CONFIG_VALUE` 键（写时失效）；
- **遮蔽判定（自有定义点查）不缓存**：缓存它会让「平台级写入」需要失效所有租户的判定副本，失效不精确即读到脏判定；一次索引点查成本可接受；
- CacheService.del 在 Redis 故障时降级 no-op，靠 TTL 与下次回源自愈（@fedstack/redis 语义）。

key：`dict:options:tenant={id|platform}:type={dictType}`、`config:value:tenant={id|platform}:key={configKey}`（见 `cache.constants.ts`）。

### D5 审计底座：@OperLog 声明式埋点 + 显式登录埋点

- **操作日志**：`@OperLog({ module, action })` 装饰器 + 全局拦截器（AuditModule 注册 APP_INTERCEPTOR）。业务处理**完成之后**（成功或抛错均记）fire-and-forget 落库，不增加响应时延；落库失败仅 warn 吞掉，绝不阻塞业务。
  - `params`：query/body 合并后过 `maskSensitive`（password/captchatext 等敏感键递归掩码，防日志放大泄露面）；
  - `result`：序列化超 2KB 存 `{ __truncated__, preview }`，保证 Json 列始终合法；
  - 主体缺失（装配失误）宁可不记也不写脏数据，warn 提示。
- **登录日志**：不走拦截器，由 `AuthService.login()` 在每个成败分支**显式埋点**（`logAttempt`，fire-and-forget）。原因：登录的失败原因（租户不可用/锁定/验证码/凭据/禁用）只有业务分支知道，拦截器只能拿到 HTTP 状态码；`msg` 用**枚举 token**（`LOGIN_MSG`）而非自由文案，保证可按失败原因聚合统计。
- **logout 不记操作日志**：登出属会话生命周期（有会话模型自身的变更），且无业务语义上的「对数据的操作」；登录侧已有登录日志覆盖。

### D6 在线用户：SCAN 键空间，不建全局注册表

- 列表：SCAN 会话键（`{ns}auth:session:id=*`）→ 内存过滤（租户/username/device）→ 分页；Redis 故障降级空列表（与 listSessions 同口径）；
- 踢单会话：先读会话校验租户归属（跨租户 404，不泄露存在性），再走 `SessionService.removeSession` 正规删除路径（会话主体 + refresh 摘要 + 集合成员三处一致清理）；
- 按用户全下线：非超管先验证目标用户存在且同租户；超管直接执行。

**取舍**：维护一个「在线会话注册表」（ZSET/Set）查询更快，但要在 create/rotate/remove 三条写路径上保持一致，多一条不变量就多一类脏数据（注册表与真实会话漂移）；后台管理的会话量级（数百～数千）下 SCAN 完全够用，且陈旧键由 TTL 自然消亡。

### D7 P0 权限码收敛 + 播种

- P0 遗留的 user/role CRUD 端点补挂 `@RequirePermission`（ADR-008 D1 收敛承诺）；
- 播种（`packages/database` Prisma seed，`prisma db seed`）：
  - 35 节点菜单树（系统管理 + 系统监控，permCode 与 `PERMISSIONS` 注册表人工同步）；
  - 每个存量租户创建内置角色 `admin`（`isSystem=true`、dataScope=ALL）并**全量绑定**全部菜单按钮——保证权限码收敛启用后，存量租户管理员不被锁死；
  - 幂等：BUTTON 按 permCode 查找、其余按 routeName，重复执行无副作用。

### D8 日志表形态与容量

- 操作/登录日志是**只增表**：无 `updated_at` / `deleted_at`（没有「修改日志」的业务）；
- 索引：`(tenant_id, created_at)` 保租户时间窗查询，另补 `created_at`（平台巡检）与 `user_id`（个人行为）；
- 本期**不做**清理/归档任务（P4 观察项），量级以月增长评估；`username` 做快照列（用户改名/删除后日志仍可读）。

## 4. 后果与风险

| 风险 | 缓解 |
| ---- | ---- |
| 平台级同键并发创建重复（D3 已接受窗口） | 仅平台超管可触发；后续若需要，可在平台行加影子租户或应用内分布式锁 |
| 租户删除自有定义后「回落平台级」产生语义跳变 | 管理列表 shadowed 标记已明示两级；前端确认弹窗提示 |
| 操作日志落库积压（fire-and-forget 无背压） | 单条 insert 量级极低；P4 若引入队列再评估 |
| SCAN 全键空间在会话量级暴涨时变慢 | 当前量级（数百～数千）可接受；P4 评估注册表方案 |
| seed 菜单树与 PERMISSIONS 注册表漂移 | seed.ts 头部注释强制人工同步声明；P4 观察项考虑编译期校验 |

## 5. 验证

- 单测：遮蔽合并（dict/config）、cache-aside 与写时失效、拦截器掩码/截断/FAILURE 记录、登录日志截断与 best-effort、在线用户租户过滤与越权 404、作用域解析（共 56 条新增断言，全套 230 通过）；
- 契约：`docs/plans/contracts/phase-2.json`（37 路径）；
- 迁移：`init_p2_system`；seed 两次执行输出一致（幂等）；
- 启动验证：dict/config/monitor 三模块路由全部映射成功，Redis/MySQL 连接正常。
