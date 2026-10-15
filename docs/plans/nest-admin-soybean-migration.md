# Nest-Admin-Soybean → fullstack 后端迁移路线图

- 版本：v1（2026-10-15 访谈敲定）
- 上游对照基线：`linlingqin77/Nest-Admin-Soybean` main @ `83a83f7`（2026-10-15 调研）
- 定位：本文件是逐步迁移的**唯一路线索引**。每期开工前通读 §2 总原则；每个模块按 §7 工作流执行；完成后回填 §4 状态列。
- 配套决策：ADR-005（多租户行级隔离）、ADR-006（schema 重设计规范）、ADR-001/003/004（既有底座）

---

## 1. 事实依据（2026-10-15 调研结论）

### 1.1 上游概况

- 前后端一体的多租户 SaaS 后台：前端 Vue 3 + Naive UI（**不迁**）；后端 NestJS 10 + Prisma 5 + PostgreSQL + Redis，pnpm monorepo（后端在 `apps/server`）。
- 鉴权：bcryptjs 密码 + JWT + Passport，会话存 Redis（JWT+Redis 双重会话）；守卫链：限流 → JWT → 租户 → 角色 → 权限；`@Perms`/`@Roles` 装饰器 RBAC。
- 上游自身缺陷（迁移时不得作为参考）：`app.module.ts` 引用的 `upload` 模块目录缺失、`backup` 模块未注册、README 目录描述过时、`init.sql`（25 表）与 Prisma schema（48 model）不同步。

### 1.2 本仓库现状

- `apps/admin-api`（NestJS 12 ESM，端口 3001）：已有 Context/AppConfig/Common/Logger/Prisma/RedisCache/Caching/Health 模块、LoginAttemptService（登录锁定）、雪花生成器（`shared/utils/snowflake.ts` + `ParseSnowflakePipe`）、全局前缀 + URI 版本 + Swagger。
- `packages/*`：@fedstack/database（Prisma 7.9.1 单 schema，ADR-001）、@fedstack/redis（缓存底座，ADR-003）、@fedstack/health（双探针，ADR-004）。
- Prisma：仅测试用 `User` model（确认可删，无代码引用）、无迁移历史。
- `apps/api`：空壳，保持业务 API 定位，**不在本路线图范围**。

## 2. 总原则（迁移纪律）

1. **概念对齐、实现重写**：上游代码只作行为规格参考（接口语义、业务规则、边界条件），禁止复制文件照抄。
2. **遵守本仓库分层**：Controller 薄、业务规则在 Service、DTO 与 Prisma model 严格分离（AGENTS.md §11/§12）。
3. **表结构一步到位**：租户级表自首个 migration 带 `tenant_id`（ADR-005/006），功能可分期。
4. **方言显式转换**：PostgreSQL → MySQL 按 ADR-006 D5 规则建模，不做机械替换。
5. **Prisma 7 差异**：上游 middleware → 本仓库 `$extends`；上游 Prisma 5 写法不可照抄。
6. **依赖引入走评审**：catalog 管理、`minimumReleaseAge=1440` 约束、按 AGENTS.md §20 评估后再进。
7. **沉淀触发器**：仅当「框架无关 + 至少两处复用」时才抽 packages 并配 ADR；不提前抽象。
8. **上游缺陷不迁**：§1.1 列出的上游自身问题不带入本仓库。
9. **每期开工核查**：`git status` 干净（AGENTS.md §18）；对照上游基线 commit；AGENTS.md §4 生产思维清单逐条过。
10. **安全底线**：后端为最终鉴权防线；日志不打凭证；探针路径不进 `/api` 前缀（延续现状）。

## 3. 目标架构形态（终态）

- 全部后台管理能力落在 `apps/admin-api/src/modules/<域>/`；横切能力按 ADR-005（租户）与既有 `shared/`（caching、snowflake、health 装配）扩展。
- `apps/api` 不承接后台管理模块；未来若需要身份体系，触发「沉淀触发器」另议。

## 4. 全模块映射表（迁移索引）

状态图例：⬜ 未开始 ｜ 🔶 进行中 ｜ ✅ 完成（含验证）｜ 🚫 不做

| 上游模块                         | 能力                     | 处置                         | 期次                            | 落地位置（admin-api/src/）  | 状态 |
| -------------------------------- | ------------------------ | ---------------------------- | ------------------------------- | --------------------------- | ---- |
| main（auth）                     | 登录/登出/验证码/getInfo | 迁移                         | P0                              | `modules/auth`              | ⬜   |
| register                         | 自助注册                 | 不做                         | -                               | 管理后台账号由管理员创建    | 🚫   |
| system/user                      | 用户管理                 | 迁移                         | P0 基础 / P1 扩展               | `modules/user`              | ⬜   |
| system/role                      | 角色管理                 | 迁移                         | P0 基础 / P1 授权 / P2 数据权限 | `modules/role`              | ⬜   |
| system/menu                      | 菜单/按钮权限/动态路由   | 迁移                         | P1                              | `modules/menu`              | ⬜   |
| system/dept                      | 部门树                   | 迁移                         | P1                              | `modules/dept`              | ⬜   |
| system/post                      | 岗位                     | 不做                         | -                               | RuoYi 遗产，业务用不上      | 🚫   |
| system/dict                      | 字典                     | 迁移                         | P2                              | `modules/dict`              | ⬜   |
| system/config                    | 参数配置                 | 迁移                         | P2                              | `modules/config`            | ⬜   |
| system/notice                    | 通知公告                 | 迁移                         | P3                              | `modules/notice`            | ⬜   |
| system/client                    | 多端接入                 | 迁移                         | P3                              | `modules/client`            | ⬜   |
| system/tenant                    | 租户管理                 | 迁移                         | P1（表 P0 已建）                | `modules/tenant`            | ⬜   |
| system/tenant-package            | 租户套餐                 | 迁移                         | P1                              | `modules/tenant-package`    | ⬜   |
| tenant/quota · audit · dashboard | 配额/审计/仪表盘         | 观察                         | P4                              | 届时评审                    | ⬜   |
| system/tool                      | 代码生成器               | 观察                         | P4                              | 低优先级                    | ⬜   |
| system/file-manager              | 文件管理                 | 迁移                         | P3                              | `modules/file`              | ⬜   |
| resource/oss + oss-config        | 对象存储                 | 迁移（抽象重设计）           | P3                              | `modules/oss`               | ⬜   |
| system/sms                       | 短信                     | 迁移                         | P3                              | `modules/sms`               | ⬜   |
| system/mail                      | 邮件                     | 迁移                         | P3                              | `modules/mail`              | ⬜   |
| system/notify                    | 站内信                   | 迁移                         | P3                              | `modules/notify`            | ⬜   |
| system/docs                      | 文档展示                 | 不做                         | -                               | 与后台管理无关              | 🚫   |
| monitor/health                   | 健康检查                 | 已有替代                     | -                               | @fedstack/health（ADR-004） | ✅   |
| monitor/online                   | 在线用户                 | 迁移                         | P2                              | `modules/monitor/online`    | ⬜   |
| monitor/operlog                  | 操作日志                 | 迁移                         | P2                              | `modules/monitor/oper-log`  | ⬜   |
| monitor/loginlog                 | 登录日志                 | 迁移                         | P2                              | `modules/monitor/login-log` | ⬜   |
| monitor/job                      | 定时任务                 | 迁移                         | P4                              | `modules/monitor/job`       | ⬜   |
| monitor/cache                    | 缓存监控                 | 观察                         | P4                              | 届时评审                    | ⬜   |
| monitor/metrics                  | Prometheus 指标          | 观察                         | P4                              | 届时评审                    | ⬜   |
| monitor/server                   | 服务监控                 | 观察                         | P4                              | 届时评审                    | ⬜   |
| common/redis                     | Redis 基础设施           | 已有替代                     | -                               | @fedstack/redis（ADR-003）  | ✅   |
| common/bull                      | 队列                     | 观察                         | P4                              | 有 job 编排需求再议         | ⬜   |
| core（守卫/拦截器/过滤器）       | 横切骨架                 | 分期落地                     | P0/P1                           | `shared/`、`common/`        | ⬜   |
| tenant 横切                      | 租户上下文/自动注入      | 迁移（`$extends` 重写）      | P0                              | `shared/tenant`             | ⬜   |
| security/login                   | 会话/黑名单/锁定         | 迁移（锁定已有）             | P0                              | `shared/auth`               | ⬜   |
| security/mfa                     | TOTP 双因素              | 迁移                         | P3                              | `shared/auth`               | ⬜   |
| security/crypto                  | 请求体 AES+RSA 加解密    | 不做                         | -                               | HTTPS 已覆盖，复杂度不值    | 🚫   |
| observability/audit · tracing    | 审计/链路追踪            | 观察（审计由 operlog 承担）  | P4                              | 届时评审                    | ⬜   |
| resilience/cockatiel             | 熔断                     | 不做                         | -                               | 当前无外部强依赖场景        | 🚫   |
| infrastructure（dataloader 等）  | 数据层增强               | 不整体迁移                   | -                               | 按需局部引入                | 🚫   |
| backup                           | 备份                     | 不做                         | -                               | 上游未注册的死代码          | 🚫   |
| upload                           | 上传                     | 不做（由 file-manager 覆盖） | P3                              | 上游目录缺失（缺陷）        | 🚫   |

## 5. 分期计划

### P0 认证与用户基座（最小可登录闭环）

**目标**：admin-api 具备「验证码 → 登录（限流+锁定）→ JWT+Redis 会话 → getInfo → 登出（黑名单）」完整链路，租户隔离骨架就位。

**模块**：

- auth：登录、登出、图形验证码、getInfo
- user：基础 CRUD（分页列表/详情/新建/编辑/软删除）
- role：只读基础（登录返回角色信息）
- 横切：租户上下文骨架（AsyncLocalStorage + `$extends` 注入，ADR-005）、JwtAuthGuard、TenantGuard、TokenService（Redis 会话 + 登出黑名单）、接入既有 LoginAttemptService、全局 Throttler 限流

**数据库**（首个 migration，ADR-006）：`SysTenant`、`SysUser`、`SysRole`、`SysUserRole`；种子数据：默认租户、超级管理员角色、初始 admin 账号。

**新增依赖**：`@nestjs/jwt`、`@nestjs/passport`、`passport`、`passport-jwt`、`@nestjs/throttler`、`svg-captcha`、`bcryptjs`（+ `@types/bcryptjs`）。

**验收标准**（高风险级，AGENTS.md §22）：

- lint（新增文件 0 问题）、typecheck、build、服务层核心规则单测
- 集成测试：登录成功/失败、密码错误锁定、会话过期、登出后 token 失效、验证码校验、跨租户越界
- E2E：完整登录链路
- 安全评审：限流阈值、Token 黑名单、日志脱敏
- migration 在本地 MySQL `migrate dev` + 目标环境 `migrate deploy` 验证
- 产出接口契约快照 `docs/plans/contracts/phase-0.json`（Swagger 导出）
- 回填 §4 状态列

### P1 RBAC 与组织

**目标**：功能权限全链路（菜单树 → 角色授权 → 动态路由 → 按钮权限校验）+ 组织与租户管理。

**模块**：menu（目录/菜单/按钮三型、getRouters）、dept（树）、role 扩展（菜单授权）、tenant（CRUD）、tenant-package（套餐分配）、RolesGuard + PermissionGuard（`@Roles`/`@Perms`）。

**数据库**：`SysMenu`、`SysDept`、`SysRoleMenu`、`SysRoleDept`、`SysTenantPackage`（`SysUser` 增 `deptId`）。

**新增依赖**：无（复用 P0）。

**验收标准**（中高风险）：权限矩阵集成测试（角色×菜单×按钮组合）、部门树环检测、租户与套餐分配边界、契约快照 `phase-1.json`。

### P2 配置与审计

**模块**：dict（type/data）、config、数据权限两档落地（DataScope：全部/本部门及以下）、oper-log（写操作拦截器）、login-log、online（在线用户，Redis 会话扫描）。

**数据库**：`SysDictType`、`SysDictData`、`SysConfig`、`SysOperLog`、`SysLoginLog`。

**新增依赖**：无（如需日志导出，`exceljs` 届时评审）。

**验收标准**（中风险）：数据权限越界用例、日志不含敏感字段断言、契约快照 `phase-2.json`。

### P3 文件与消息

**模块**：file-manager（文件夹/上传/分享）、OSS（存储抽象接口 + 本地实现先行，S3 兼容实现观察）、sms/mail/notify（渠道/模板/发送/日志）、notice、MFA（TOTP）、client（多端接入）。

**数据库**：文件域（File/FileFolder/FileShare 按本仓库规范重设计）、`SysOssConfig`、`SysSms*`、`SysMail*`、`SysNotify*`、`SysNotice`、用户 MFA 字段。

**新增依赖**：`nodemailer`、`qrcode`、TOTP 库（otplib/otpauth 择一评审）、OSS SDK 与短信渠道 SDK 按选定实现评审。

**验收标准**（中高风险）：上传安全（类型白名单/大小限制/路径穿越/越权）、模板渲染防注入、外发频控、契约快照 `phase-3.json`。

### P4 运维与增强（多为观察项，逐项评审后开工）

job（`@nestjs/schedule` 起步）、cache 监控、metrics（prom-client）、代码生成器、quota/audit/dashboard、双 token（refresh）机制、argon2 密码哈希升级、bull 队列。

**验收标准**：按届时单项评审；涉及基础设施的配 ADR。

## 6. 不做清单（汇总）

| 项                         | 理由                              |
| -------------------------- | --------------------------------- |
| register 自助注册          | 管理后台账号由管理员创建          |
| system/post 岗位           | RuoYi 遗产，业务用不上            |
| security/crypto 请求加解密 | HTTPS 已覆盖，复杂度与收益不匹配  |
| 社交登录                   | 上游仅 DTO 雏形，无实际价值       |
| system/docs                | 与后台管理无关                    |
| resilience 熔断            | 当前无外部强依赖场景              |
| backup / upload            | 上游自身缺陷（未注册 / 目录缺失） |
| billing 计费               | 无此商业模式                      |

## 7. 单模块标准工作流

1. `git status` 确认工作区干净（AGENTS.md §18）。
2. 读上游对应模块源码（以基线 `83a83f7` 为准），提炼**行为规格**：接口语义、业务规则、边界与异常分支；不照抄实现。
3. schema 增量：按 ADR-006 建模 → `prisma validate` → `prisma migrate dev`。
4. 重写代码：DTO（校验与契约）→ Service（业务规则与并发考量）→ Controller（薄）；守卫/装饰器挂接。
5. 测试按风险分级（§5 各期验收标准）；lint 新增文件 0 问题；`turbo run typecheck` + `pnpm build`。
6. Swagger 标注 + 契约快照 `docs/plans/contracts/phase-X.json`。
7. 回填 §4 状态列与实际决策备注；出现架构沉淀 → 写 ADR。

## 8. 风险与实施注意

- **Prisma 7 无 middleware**：租户注入用 `$extends` 重新实现，上游 Prisma 5 代码仅作行为参考；该层是安全关键路径，必须有专项测试（ADR-005 D5）。
- **BigInt 序列化**：雪花 ID 超出 JS 安全整数范围，需统一 bigint→字符串的序列化策略（P0 落地；入参侧可复用既有 `ParseSnowflakePipe`）。
- **新包安装滞后**：`minimumReleaseAge=1440` 意味着新发布依赖 1 天后才可安装，依赖引入计划需留缓冲。
- **terminus/Prisma 文案耦合**：@fedstack/health 依赖 Prisma 7.9.1 错误文案匹配（ADR-004），升级 Prisma 时须重跑其集成测试。
- **契约一致性**：admin-api 已有全局前缀 + URI 版本 + Swagger，新模块路由必须对齐既有约定，以契约快照为准。
- **决策冲突**：上游行为与本仓库决策冲突时，以本路线图与 ADR 为准，并在 §4 备注实际决策。
