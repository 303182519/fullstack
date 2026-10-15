# Nest-Admin-Soybean 后端能力迁移大纲

> 参考项目：<https://github.com/linlingqin77/Nest-Admin-Soybean>
> 本文档是**能力迁移路线图**，不是照抄清单。每个条目都按本仓库架构（pnpm monorepo / NestJS 12 ESM / Prisma + MySQL / @fedstack/redis / @fedstack/database / @fedstack/health）重新设计，源项目代码仅作语义参考。

## 架构差异红线（迁移时必须遵守）

| 维度     | 源项目            | 本仓库                                | 迁移要求                                           |
| ------ | -------------- | ---------------------------------- | ---------------------------------------------- |
| 数据库    | PostgreSQL     | MySQL（@fedstack/database 单 schema） | 所有模型改写为 MySQL 方言，迁移走 Prisma migrate            |
| 包结构    | 单体 server/     | monorepo packages + apps/admin-api | 基础设施下沉 packages/\*，业务留 apps/admin-api          |
| 测试     | Jest           | vitest                             | 测试用例重写，标题小写开头                                  |
| 缓存     | 自研 cache 模块    | @fedstack/redis（keyPrefix 必填）      | 业务 key 用 CacheKeys 常量，禁止裸写 key                 |
| 健康检查   | terminus 基础版   | @fedstack/health 双探针（ADR-004）      | 就绪检查项经 `HealthModule.forRootAsync` 装配          |
| NestJS | 10.x           | 12.x ESM                           | DI 类禁止 `import type`；异步模块 useFactory 用 `any[]` |
| 认证     | JWT + Passport | 待定（见 M1 决策点）                       | 需 ADR 决策后再动                                    |

## 已有底座（不迁移，直接复用）

- 配置体系（config.module / env.validation）、统一响应、异常过滤器、request-id、context
- @fedstack/redis：连接工厂、CacheService、Hash/ZSet、**分布式锁**、withRedis
- LoginAttemptService（登录失败锁定）——M1 时接入
- @fedstack/health：存活/就绪双探针、Redis 三态检查

***

## 迁移清单（按依赖顺序执行）

### M1 认证与账户体系【最高优先】

- [ ] **1.1 用户模型与 Prisma schema**：SysUser 基础表（账号、密码哈希、状态、部门/岗位关联预留）；MySQL 方言，先出 ADR + migration
- [ ] **1.2 密码安全**：BCrypt 哈希、密码强度策略、初始密码/改密接口
- [ ] **1.3 登录认证**：账号密码登录 → JWT access + refresh token；接入现有 LoginAttemptService（失败锁定）；登录日志落库
- [ ] **1.4 Token 会话管理**：refresh token 存 Redis（@fedstack/redis Hash），支持踢人下线、多端会话枚举
- [ ] **1.5 AuthGuard + @Public() 装饰器**：全局守卫、当前用户上下文（复用 common/context）
- [ ] **1.6 图形验证码**：登录验证码（svg-captcha 类），存 Redis 短 TTL
- 决策点：是否引入 Passport，还是手写 Guard（倾向手写，减少依赖）；需 ADR

### M2 RBAC 权限体系【核心，依赖 M1】

- [ ] **2.1 角色管理**：SysRole、用户-角色关联、角色状态
- [ ] **2.2 菜单/权限管理**：SysMenu（目录/菜单/按钮三级）、角色-菜单关联、权限标识（如 `system:user:add`）
- [ ] **2.3 @RequirePermission() + PermissionGuard**：权限校验守卫；权限集缓存 Redis（角色变更时失效）
- [ ] **2.4 数据权限**：角色数据范围（全部/本部门/本部门及以下/本人），@DataPermission 查询过滤
- [ ] **2.5 用户管理 CRUD**：用户增删改查、角色分配、密码重置、状态管理（并发安全：唯一约束 + 乐观锁）
- 决策点：菜单树结构与前端 admin 路由协议，需与前端对齐

### M3 组织与系统管理【依赖 M2】

- [ ] **3.1 部门管理**：组织架构树（父子结构 + ancestors 路径），部门人员管理
- [ ] **3.2 岗位管理**：岗位配置、用户-岗位关联
- [ ] **3.3 字典管理**：字典类型 + 字典数据，字典缓存（@fedstack/redis，变更失效）
- [ ] **3.4 参数配置**：系统参数动态配置（DB 为权威源，Redis 缓存）
- [ ] **3.5 通知公告**：公告发布、状态流转（草稿/发布/关闭）

### M4 审计与日志【依赖 M1，可与 M3 并行】

- [ ] **4.1 操作日志**：@OperLog() 装饰器 + 拦截器，异步落库（标题、方法、参数脱敏、耗时、结果）；查询/导出接口
- [ ] **4.2 登录日志**：登录成功/失败记录、登录统计（M1 已埋点，此处补查询页接口）
- [ ] **4.3 日志脱敏**：密码、token、手机号等敏感字段统一脱敏（接入现有 logger）

### M5 并发与可靠性装饰器【依赖 M1 后任何时点】

- [ ] **5.1 @Idempotent() 幂等装饰器**：基于 @fedstack/redis，防重复提交（创建/支付类接口必备）
- [ ] **5.2 @Lock() 分布式锁装饰器**：封装 @fedstack/redis 分布式锁，key 支持模板参数
- [ ] **5.3 限流**：接口级限流（Redis 滑动窗口），登录/短信等敏感接口先行

### M6 系统监控【依赖 M2 权限】

- [ ] **6.1 在线用户**：从 M1 token 会话枚举在线用户、强制下线
- [ ] **6.2 缓存监控**：Redis info、key 查询/删除（严格权限，禁止 pattern `keys *` 线上滥用）
- [ ] **6.3 服务监控**：CPU/内存/磁盘/运行时信息接口
- [ ] **6.4 Prometheus 指标**：/metrics 端点、HTTP 请求直方图（与 @fedstack/health 并存，探针路径不进 /api 前缀）
- [ ] **6.5 定时任务**：@nestjs/schedule 任务注册、任务配置/执行日志落库、启停控制（多实例部署需 Redis 锁防重）

### M7 文件存储【独立】

- [ ] **7.1 上传抽象层**：StorageService 接口（本仓库放 packages/storage 或 admin-api shared，先出 ADR）
- [ ] **7.2 本地存储实现** + 文件表落库（文件名、大小、MIME、存储路径、上传人）
- [ ] **7.3 云存储适配**：阿里云 OSS / MinIO（按实际需要启用，配置驱动）
- [ ] **7.4 文件管理**：预览、下载、删除（权限 + 引用校验）

### M8 消息中心【依赖 M1、M6.5】

- [ ] **8.1 站内信**：模板、发送、已读/未读、我的消息列表
- [ ] **8.2 邮件**：账号配置、模板、发送日志（nodemailer 类，发送异步化 + 失败重试）
- [ ] **8.3 短信（按需）**：渠道配置抽象、发送日志；接阿里云/腾讯云时再做适配

### M9 API 文档与开发体验【贯穿全程，M2 后补齐】

- [ ] **9.1 Swagger/OpenAPI**：/docs 端点、DTO 装饰器规范、生产环境可关
- [ ] **9.2 统一错误码**：业务错误码枚举与响应契约（前后端对齐文档）

### M10 多租户【最后，独立 ADR 评审】

> 源项目的核心卖点，但侵入性最强。是否引入、何时引入需单独评审，**不作为默认迁移项**。

- [ ] **10.1 决策评审**：业务是否需要多租户？隔离模型（字段隔离 vs 独立库）？出 ADR
- [ ] **10.2 TenantContext**：AsyncLocalStorage 租户上下文 + HTTP 中间件
- [ ] **10.3 Prisma 租户中间件**：自动注入 tenantId 过滤、写入赋值、跨租户校验
- [ ] **10.4 租户管理**：租户 CRUD、套餐、功能开关、配额
- [ ] **10.5 缓存隔离**：@fedstack/redis keyPrefix 已按 app 隔离，租户维度追加 key 段

***

## 明确不迁移项

| 源项目能力                  | 不迁移原因                              |
| ---------------------- | ---------------------------------- |
| 请求加密（AES+RSA 混合）       | 有 HTTPS 前提下收益低、复杂度高；如确有敏感场景再单独立项评审 |
| 代码生成器                  | 源项目自身标注"开发中"，成熟度不足                 |
| 演示模式                   | 可用 M2 RBAC 只读角色实现，无需专门机制           |
| PM2 部署脚本 / Nest 云部署    | 本仓库已明确不使用，部署方案另行决策                 |
| PostgreSQL 专属 SQL / 函数 | 数据库方言不同，一律重写                       |

## 执行约定

1. 每个 M 条目开工前：查源项目对应模块语义 → 按本仓库架构出设计（涉架构边界的先写 ADR）→ 实现 → 按 AGENTS.md 第 22 条按风险等级校验
2. 高风险条目（M1/M2/M10、分布式锁、迁移脚本）：单测 + 集成测试 + 并发评审
3. 每个 M 完成后更新本文件勾选状态，并记录偏差决策

