# Nest-Admin-Soybean 迁移路线图

- 上游基线：`linlingqin77/Nest-Admin-Soybean@83a83f7`（NestJS 10 + Prisma 5 + PostgreSQL）
- 目标架构：pnpm monorepo + NestJS 12 + Prisma 7.9.1 + MySQL + Redis
- 迁移原则：**不是照抄，而是按现有架构重新设计实现**

---

## 1. 迁移原则

| 原则         | 说明                                                               |
| ------------ | ------------------------------------------------------------------ |
| 架构适配     | 所有模块必须适配现有 monorepo 结构、NestJS 12 ESM、Prisma 7、MySQL |
| 企业级标准   | 完整的多租户隔离、RBAC 权限、审计日志、登录安全、操作幂等          |
| 最小安全变更 | 每期只交付该期功能，不混入无关重构                                 |
| 契约先行     | 每期开始前输出 OpenAPI 契约快照，变更走扩展-收缩模式               |
| 测试覆盖     | 核心业务逻辑单元测试 + 关键路径集成测试                            |

---

## 2. 分期路线图总览

| 阶段 | 主题       | 核心交付物                                                                                   | 依赖 |
| ---- | ---------- | -------------------------------------------------------------------------------------------- | ---- |
| P0   | 认证基座   | 租户骨架、用户/角色基础、JWT 认证、登录安全                                                  | 无   |
| P1   | 权限与组织 | 菜单管理、部门管理、角色授权、数据权限                                                       | P0   |
| P2   | 系统管理   | 字典、参数、操作日志、登录日志、在线用户                                                     | P1   |
| P3   | 扩展能力   | P3a：文件/OSS（含封面归一化）、公告/站内信/实时推送；P3b：消息模板、邮件/短信通道、MFA、队列 | P2   |
| P4   | 观察项     | 定时任务、监控指标、代码生成                                                                 | P3   |

---

## 3. P0 认证基座（详细设计）

### 3.1 目标

建立可支撑企业级多租户 SaaS 的认证与租户隔离基座。

### 3.2 数据库 Schema

以下模型覆盖 P0 必须持久化的全部实体。命名遵循 ADR-006：model PascalCase + `@@map("sys_*")`，字段 camelCase + `@map`，BigInt 雪花主键。

```prisma
// ==========================================
// P0 核心表：租户 / 用户 / 角色 / 用户角色关联
// ==========================================

model SysTenant {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  // 基础信息
  tenantCode  String   @unique @map("tenant_code") @db.VarChar(50)   // 租户编码（登录用）
  tenantName  String   @map("tenant_name") @db.VarChar(100)          // 租户名称
  domain      String?  @map("domain") @db.VarChar(255)               // 租户域名
  logo        String?  @map("logo") @db.VarChar(500)                 // LOGO URL
  contactName String?  @map("contact_name") @db.VarChar(50)          // 联系人
  contactPhone String? @map("contact_phone") @db.VarChar(20)         // 联系电话

  // 状态与生命周期
  status      TenantStatus @default(ACTIVE) @map("status")
  expireTime  DateTime? @map("expire_time") @db.DateTime(3)          // 过期时间（NULL=永久）
  packageId   BigInt?  @map("package_id")                            // 关联套餐（P1 建表，P0 预留字段）

  // 配额（P0 只建字段，P3 再实现管理逻辑）
  userLimit   Int      @default(100) @map("user_limit")              // 用户数上限
  storageLimit BigInt  @default(1073741824) @map("storage_limit")    // 存储上限（字节）

  @@map("sys_tenant")
}

model SysUser {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  // 租户归属
  tenantId    BigInt   @map("tenant_id")

  // 登录凭证
  username    String   @map("username") @db.VarChar(100)
  password    String?  @map("password") @db.VarChar(255)             // argon2id 哈希，OAuth 用户可空
  email       String?  @map("email") @db.VarChar(255)
  phone       String?  @map("phone") @db.VarChar(20)

  // 基础资料
  nickname    String?  @map("nickname") @db.VarChar(50)
  avatar      String?  @map("avatar") @db.VarChar(500)
  gender      Gender?  @map("gender")
  remark      String?  @map("remark") @db.VarChar(500)

  // 状态
  status      UserStatus @default(ACTIVE) @map("status")
  isSuper     Boolean  @default(false) @map("is_super")              // 是否超级管理员（跨租户）

  // 密码策略
  passwordHistory Json? @map("password_history")                     // 最近 5 次密码哈希数组

  @@unique([tenantId, username], name: "uniq_tenant_username")
  @@unique([tenantId, email], name: "uniq_tenant_email")
  @@map("sys_user")
}

model SysRole {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId    BigInt   @map("tenant_id")

  roleName    String   @map("role_name") @db.VarChar(50)
  roleCode    String   @map("role_code") @db.VarChar(50)             // 如 "admin"、"dept_manager"
  description String?  @map("description") @db.VarChar(200)
  dataScope   DataScope @default(DEPT_AND_CHILD) @map("data_scope")  // 数据权限两档

  status      RoleStatus @default(ACTIVE) @map("status")
  isSystem    Boolean  @default(false) @map("is_system")             // 是否系统内置角色（不可删）

  @@unique([tenantId, roleCode], name: "uniq_tenant_role_code")
  @@map("sys_role")
}

model SysUserRole {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)

  userId      BigInt   @map("user_id")
  roleId      BigInt   @map("role_id")

  @@unique([userId, roleId], name: "uniq_user_role")
  @@map("sys_user_role")
}

// ==========================================
// P0 枚举
// ==========================================

enum TenantStatus {
  ACTIVE   @map("active")
  DISABLED @map("disabled")
  EXPIRED  @map("expired")
}

enum UserStatus {
  ACTIVE   @map("active")
  DISABLED @map("disabled")
  LOCKED   @map("locked")    // 登录锁定
}

enum Gender {
  MALE   @map("male")
  FEMALE @map("female")
  UNKNOWN @map("unknown")
}

enum RoleStatus {
  ACTIVE   @map("active")
  DISABLED @map("disabled")
}

enum DataScope {
  ALL             @map("all")               // 全部数据
  DEPT_AND_CHILD  @map("dept_and_child")    // 本部门及以下
}
```

### 3.3 认证与安全策略

| 策略项        | 方案             | 说明                                        |
| ------------- | ---------------- | ------------------------------------------- |
| 密码哈希      | argon2id         | memoryCost=65536, timeCost=3, parallelism=4 |
| 密码复杂度    | 最小 8 位        | 必须含大小写字母 + 数字，特殊字符可选       |
| 密码历史      | 最近 5 次        | 禁止重复使用历史密码                        |
| Access Token  | JWT, 2h          | Header: `Authorization: Bearer <token>`     |
| Refresh Token | JWT, 7d          | HttpOnly Cookie + Redis 存储，滑动过期      |
| 多端登录      | 允许             | 每设备独立会话，管理员可强制下线            |
| 登录锁定      | 5 次失败锁 15min | Redis 计数，按账号维度                      |
| 图形验证码    | 3 次失败后强制   | svg-captcha，答案存 Redis                   |
| IP 记录       | 仅日志           | 不锁定，避免 NAT 误伤                       |

### 3.4 Redis 键设计

```
# 会话管理
admin-api:session:{sessionId}           -> JSON {userId, tenantId, device, ip, expiresAt}
admin-api:user:{userId}:sessions        -> Set [sessionId1, sessionId2, ...]
admin-api:refresh:{refreshToken}        -> JSON {userId, sessionId, expiresAt}

# 登录安全
admin-api:login:fail:{tenantId}:{username}   -> counter (TTL 15min)
admin-api:login:lock:{tenantId}:{username}   -> "1" (TTL 15min)
admin-api:captcha:{uuid}                     -> "text" (TTL 5min)

# 密码历史（Redis 备份，MySQL 为主）
admin-api:pwd:history:{userId}          -> List [hash1, hash2, ...]
```

### 3.5 API 契约（P0 范围）

| 端点                | 方法           | 说明                         |
| ------------------- | -------------- | ---------------------------- |
| `/api/auth/login`   | POST           | 账号密码登录（支持租户编码） |
| `/api/auth/captcha` | GET            | 获取图形验证码               |
| `/api/auth/refresh` | POST           | 刷新 access token            |
| `/api/auth/logout`  | POST           | 登出（清除当前会话）         |
| `/api/auth/profile` | GET            | 获取当前用户信息             |
| `/api/users`        | GET/POST       | 用户列表 / 创建用户          |
| `/api/users/:id`    | GET/PUT/DELETE | 用户详情 / 更新 / 删除       |
| `/api/roles`        | GET/POST       | 角色列表 / 创建角色          |
| `/api/roles/:id`    | GET/PUT/DELETE | 角色详情 / 更新 / 删除       |
| `/api/tenants`      | GET            | 租户列表（平台级）           |
| `/api/tenants/:id`  | GET/PUT        | 租户详情 / 更新              |

契约快照：`docs/plans/contracts/phase-0.json`

### 3.6 代码结构

```
apps/admin-api/src/
├── modules/
│   ├── auth/                    # 认证模块
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── local.strategy.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── local-auth.guard.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── auth-profile.dto.ts
│   ├── user/                    # 用户模块
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.module.ts
│   │   └── dto/
│   ├── role/                    # 角色模块
│   │   ├── role.controller.ts
│   │   ├── role.service.ts
│   │   ├── role.module.ts
│   │   └── dto/
│   └── tenant/                  # 租户模块（P0 只读骨架）
│       ├── tenant.controller.ts
│       ├── tenant.service.ts
│       ├── tenant.module.ts
│       └── dto/
├── shared/
│   ├── database/                # 已有：PrismaModule/PrismaService
│   ├── caching/                 # 已有：CachingModule/LoginAttemptService
│   ├── logger/                  # 已有：Pino 日志
│   └── auth/                    # 新增：认证共享工具
│       ├── password.service.ts      # argon2id 哈希/校验
│       ├── session.service.ts       # Redis 会话管理
│       └── captcha.service.ts       # 验证码生成/校验
└── common/
    ├── decorators/
    │   ├── current-user.decorator.ts
    │   └── public.decorator.ts
    └── guards/
        └── tenant.guard.ts          # 租户上下文解析（P0 基础版）
```

### 3.7 P0 验收标准

- [ ] 数据库迁移成功，4 张核心表创建
- [ ] 注册/登录/登出/刷新 token 全流程通过
- [ ] 登录锁定与验证码机制生效
- [ ] 密码 argon2id 哈希存储，历史密码不可复用
- [ ] 多端登录会话独立，强制下线生效
- [ ] 租户隔离基础生效（用户只能看到本租户数据）
- [ ] OpenAPI 契约快照输出
- [ ] 单元测试覆盖率 > 70%（auth/user/role 模块）

---

## 4. P1 权限与组织

### 4.1 范围

菜单管理、部门管理、角色授权、租户套餐、数据权限两档。

### 4.2 新增表

```prisma
model SysMenu {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId    BigInt?  @map("tenant_id")   // NULL = 平台级菜单

  parentId    BigInt?  @map("parent_id")   // 父菜单，NULL=根
  menuType    MenuType @map("menu_type")   // DIRECTORY / MENU / BUTTON
  menuName    String   @map("menu_name") @db.VarChar(50)
  routeName   String?  @map("route_name") @db.VarChar(100)
  routePath   String?  @map("route_path") @db.VarChar(200)
  component   String?  @map("component") @db.VarChar(200)
  permCode    String?  @map("perm_code") @db.VarChar(100)   // 权限编码，如 "system:user:add"
  icon        String?  @map("icon") @db.VarChar(100)
  sort        Int      @default(0) @map("sort")
  visible     Boolean  @default(true) @map("visible")
  status      MenuStatus @default(ACTIVE) @map("status")

  @@map("sys_menu")
}

model SysDept {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId    BigInt   @map("tenant_id")

  parentId    BigInt?  @map("parent_id")
  deptName    String   @map("dept_name") @db.VarChar(50)
  leader      String?  @map("leader") @db.VarChar(50)
  phone       String?  @map("phone") @db.VarChar(20)
  path        String   @map("path") @db.VarChar(500)   // 物化路径，如 "/1/3/5/"
  sort        Int      @default(0) @map("sort")
  status      DeptStatus @default(ACTIVE) @map("status")

  @@map("sys_dept")
}

model SysRoleMenu {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  roleId    BigInt @map("role_id")
  menuId    BigInt @map("menu_id")

  @@unique([roleId, menuId], name: "uniq_role_menu")
  @@map("sys_role_menu")
}

model SysTenantPackage {
  id          BigInt   @id
  createdAt   DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt   DateTime? @map("deleted_at") @db.DateTime(3)

  packageName String   @map("package_name") @db.VarChar(50)
  packageCode String   @unique @map("package_code") @db.VarChar(50)
  description String?  @map("description") @db.VarChar(200)
  status      PackageStatus @default(ACTIVE) @map("status")

  @@map("sys_tenant_package")
}

model SysTenantPackageMenu {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  packageId BigInt @map("package_id")
  menuId    BigInt @map("menu_id")

  @@unique([packageId, menuId], name: "uniq_package_menu")
  @@map("sys_tenant_package_menu")
}
```

### 4.3 核心机制

- **菜单三级**：目录 → 菜单 → 按钮，按钮级控制 API 访问
- **数据权限**：Service 层**显式**调用 `DataScopeService` 生成 `dept.path LIKE '{currentDeptPath}%'` 或 `{}`（全部数据）。
  说明：Prisma 7 已移除 query middleware，原设想的 `@DataPermission` 装饰器自动注入无法落地，改为显式调用（见 ADR-008 D3 与 `data-scope.service.ts`）。
- **租户套餐**：套餐绑定菜单集合，租户关联套餐，决定租户可用功能范围

契约快照：`docs/plans/contracts/phase-1.json`

---

## 5. P2 系统管理

### 5.1 范围

字典管理、参数配置、操作日志、登录日志、在线用户管理。

### 5.2 新增表

```prisma
model SysDictType {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)
  tenantId  BigInt?  @map("tenant_id")
  dictName  String   @map("dict_name") @db.VarChar(100)
  dictType  String   @map("dict_type") @db.VarChar(100)
  status    DictStatus @default(ACTIVE) @map("status")
  remark    String?  @map("remark") @db.VarChar(500)

  @@unique([tenantId, dictType], name: "uniq_tenant_dict_type")
  @@map("sys_dict_type")
}

model SysDictData {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)
  dictType  String   @map("dict_type") @db.VarChar(100)
  dictLabel String   @map("dict_label") @db.VarChar(100)
  dictValue String   @map("dict_value") @db.VarChar(100)
  sort      Int      @default(0) @map("sort")
  status    DictStatus @default(ACTIVE) @map("status")

  @@map("sys_dict_data")
}

model SysConfig {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)
  tenantId  BigInt?  @map("tenant_id")
  configName String  @map("config_name") @db.VarChar(100)
  configKey  String  @map("config_key") @db.VarChar(100)
  configValue String @map("config_value") @db.VarChar(500)
  configType String  @default("string") @map("config_type") @db.VarChar(20)

  @@unique([tenantId, configKey], name: "uniq_tenant_config_key")
  @@map("sys_config")
}

model SysOperLog {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  tenantId  BigInt?  @map("tenant_id")
  userId    BigInt?  @map("user_id")
  username  String?  @map("username") @db.VarChar(100)
  module    String?  @map("module") @db.VarChar(50)
  action    String?  @map("action") @db.VarChar(50)
  method    String?  @map("method") @db.VarChar(10)
  url       String?  @map("url") @db.VarChar(500)
  ip        String?  @map("ip") @db.VarChar(50)
  params    Json?    @map("params")
  result    Json?    @map("result")
  status    OperLogStatus @default(SUCCESS) @map("status")
  errorMsg  String?  @map("error_msg") @db.VarChar(2000)
  costTime  Int?     @map("cost_time")   // 毫秒

  @@index([tenantId, createdAt])
  @@map("sys_oper_log")
}

model SysLoginLog {
  id        BigInt @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)
  tenantId  BigInt?  @map("tenant_id")
  userId    BigInt?  @map("user_id")
  username  String?  @map("username") @db.VarChar(100)
  ip        String?  @map("ip") @db.VarChar(50)
  userAgent String?  @map("user_agent") @db.VarChar(500)
  status    LoginLogStatus @map("status")
  msg       String?  @map("msg") @db.VarChar(200)

  @@index([tenantId, createdAt])
  @@map("sys_login_log")
}
```

### 5.3 实施收口（2026-10-18）

P2 已实施完毕，实际交付以本节为准；§5.2 为实施前设计草案，有偏差处以本节为准。

**模块清单**（`apps/admin-api/src/`）：

- `modules/dict/`：字典类型/字典数据 CRUD + 遮蔽合并列表 + `GET /api/dict-data/options/{type}` 消费端点
- `modules/config/`：参数 CRUD + 遮蔽合并列表 + `GET /api/configs/value/{key}` 按 key 取值
- `modules/monitor/`：操作日志/登录日志分页查询 + 在线用户列表（`GET /api/online-users`）、踢单（`DELETE /api/online-users/{sessionId}`）、按用户全设备下线（`POST /api/online-users/force-logout`）
- `shared/audit/`：`@OperLog` 装饰器 + 全局拦截器（敏感字段掩码、result 截断 2KB、响应后异步落库）、登录日志埋点服务（登录成败均记录，msg 存枚举 token）
- `shared/scope/`：`ScopeResolverService` 作用域注入——租户管理员恒定本租户；平台超管默认平台级，可带 `?tenantId=` 代管
- `packages/database/prisma/seed.ts`：35 节点菜单树 + 每存量租户内置 `admin` 角色（`isSystem=true`）全量绑定菜单，幂等 upsert

**与设计稿 §5.2 的偏差**：

| 项          | 设计稿                                   | 实际实现                                                                  | 依据                                                     |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| SysDictData | 无租户维度                               | 加 `tenantId`（null=平台级），唯一键 `(tenantId, dictType, dictValue)`    | 租户自定义字典数据需要隔离（本期决策第 3 项）            |
| SysConfig   | `configType` 字段                        | 移除，新增 `isSystem`（内置参数禁删、key 不可改）                         | 类型信息无消费场景；防误删内置参数                       |
| SysOperLog  | `url` / `costTime`，tenantId/userId 可空 | `path` / `costMs`；tenantId/userId/username 必填（username 为主体名快照） | 审计写路径只发生在已认证主体；快照保证用户删除后日志可读 |
| SysLoginLog | `userAgent`                              | `device`（会话设备标识）；`msg` 收敛为枚举 token                          | 与会话/强制下线语义对齐；展示文案由前端映射              |
| 在线用户    | 设计稿未列端点                           | 三端点（列表/踢单/全设备下线），会话遍历用 SCAN 键空间                    | 本期决策第 7 项                                          |

**关键机制**：

- 字典/参数数据值走 cache-aside + 写时失效；**遮蔽判定不缓存**（防平台级写入失效不精确，见 ADR-009 D4）。
- 平台级唯一性：MySQL 唯一索引对 NULL 不生效，由服务层查重 + 软删行复活 + `P2002` 兜底（见 ADR-009 D3）。
- 遮蔽语义：租户存在未删除定义（与 status 无关）即整体遮蔽平台级，不合并；管理列表对平台行带 `shadowed` 标记（见 ADR-009 D2）。
- P0 user/role 端点补齐 `@RequirePermission`；存量 P0/P1 全部写端点挂 `@OperLog`（auth login/logout 有意不挂）。

完整决策记录：`docs/architecture/decisions/ADR-009-shadowing-and-audit.md`

契约快照：`docs/plans/contracts/phase-2.json`

---

## 6. P3 扩展能力（详细设计，2026-10-19 定稿）

P3 分两批交付，决策依据见 `ADR-012`（文件存储与配额）、`ADR-013`（消息中心 / 实时推送 / 队列），并修订了 `ADR-003`（Redis 连接分层）。

| 批次 | 范围                                                     |
| ---- | -------------------------------------------------------- |
| P3a  | 文件/OSS（含图片封面归一化）、通知公告、站内信、实时推送 |
| P3b  | 消息中心模板、邮件/短信通道、MFA、队列引入与审计落库改造 |

**明确不做**（上游缺陷或本项目无消费方）：`SysClient`（上游为 RuoYi 风格 OAuth 客户端注册表，本仓库无鉴权消费方）；文件夹 / 分享 / 回收站 / 版本 / 秒传 / 分片；多存储配置管理页面（`sys_oss_config` 式配置入库）。

### 6.1 新增表（P3a）

```prisma
// ==========================================
// P3a 扩展能力（一）：文件 / 站内信 / 通知公告
// ==========================================

/// 文件。租户级二进制资产元数据；对象本体存于存储后端（本地磁盘 / S3 兼容对象存储）。
/// 图片类保留原图，并在**同一行**派生封面列（cover*）——不新建行、不新建表。
/// 存储配额用量按本表未删除行的 size + coverSize 聚合（ADR-012 D5）。
model SysFile {
  id        BigInt    @id
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId   BigInt @map("tenant_id")
  uploaderId BigInt @map("uploader_id")

  storage      FileStorage @map("storage") // 产生该对象时使用的驱动
  bucket       String?     @map("bucket") @db.VarChar(100)
  objectKey    String      @map("object_key") @db.VarChar(500) // 存储后端内唯一键
  originalName String      @map("original_name") @db.VarChar(255)
  mimeType     String      @map("mime_type") @db.VarChar(100)
  size         Int         @map("size") // 原图字节数
  module       String?     @map("module") @db.VarChar(50) // 业务归属标记，如 "avatar" / "notice"

  // 派生封面（仅图片类产生；归一化失败时留空，消费端必须容忍）
  coverKey    String? @map("cover_key") @db.VarChar(500)
  coverFormat String? @map("cover_format") @db.VarChar(10)
  coverWidth  Int?    @map("cover_width")
  coverHeight Int?    @map("cover_height")
  coverSize   Int?    @map("cover_size")

  @@index([tenantId, createdAt])
  @@index([tenantId, deletedAt])
  @@index([uploaderId])
  @@map("sys_file")
}

/// 站内信。定向到单个用户；readAt 非空即已读（不设 read 布尔列，避免双真相源）。
/// 实时推送为 best-effort，本表是权威真相源（ADR-013 D2/D5）。
model SysUserMessage {
  id        BigInt    @id
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3) // 用户侧删除

  tenantId BigInt @map("tenant_id")
  userId   BigInt @map("user_id")

  title      String  @map("title") @db.VarChar(200)
  content    String  @map("content") @db.Text
  category   String? @map("category") @db.VarChar(50) // 来源分类，如 "system"
  sourceType String? @map("source_type") @db.VarChar(50) // 来源对象类型
  sourceId   String? @map("source_id") @db.VarChar(80) // 来源对象主键（雪花串）

  readAt DateTime? @map("read_at") @db.DateTime(3)

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("sys_user_message")
}

/// 通知公告。广播型：无逐用户已读记录（ADR-013 D2）。
/// tenantId 为空表示平台级公告；消费端把平台级与租户级公告**并列合并**展示（非遮蔽，ADR-013 D3）。
model SysNotice {
  id        BigInt    @id
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId BigInt? @map("tenant_id") // null = 平台级公告

  title   String       @map("title") @db.VarChar(200)
  content String       @map("content") @db.Text
  type    NoticeType   @default(NOTICE) @map("type") // 通知 / 公告
  status  NoticeStatus @default(DRAFT) @map("status")

  publisherId   BigInt? @map("publisher_id")
  publisherName String? @map("publisher_name") @db.VarChar(100) // 主体名快照

  @@index([tenantId, status, createdAt])
  @@map("sys_notice")
}

enum FileStorage {
  LOCAL @map("local")
  S3    @map("s3")
}

enum NoticeType {
  NOTICE   @map("notice") // 通知
  BULLETIN @map("bulletin") // 公告
}

enum NoticeStatus {
  DRAFT     @map("draft")
  PUBLISHED @map("published")
  CLOSED    @map("closed")
}
```

### 6.2 新增表（P3b）

```prisma
// ==========================================
// P3b 扩展能力（二）：消息模板 / 投递记录 / 用户 MFA
// ==========================================

/// 消息模板。tenantId 为空表示平台级标准模板；租户对同 (templateKey, channel)
/// 建立自有模板后**整体遮蔽**平台级（复用 ADR-009 D2 判定与缓存纪律）。
model SysMessageTemplate {
  id        BigInt    @id
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt DateTime? @map("deleted_at") @db.DateTime(3)

  tenantId BigInt? @map("tenant_id") // null = 平台级模板

  templateKey String         @map("template_key") @db.VarChar(100) // 模板键，如 "mfa.bind"
  channel     MessageChannel @map("channel")
  title       String?        @map("title") @db.VarChar(200)
  content     String         @map("content") @db.Text // 变量占位模板
  status      TemplateStatus @default(ACTIVE) @map("status")
  remark      String?        @map("remark") @db.VarChar(500)

  @@unique([tenantId, templateKey, channel], name: "uniq_tenant_message_template")
  @@index([templateKey])
  @@map("sys_message_template")
}

/// 消息投递记录。只增表：无 updated_at / deleted_at（同审计日志口径，ADR-009）。
model SysMessageSendLog {
  id        BigInt   @id
  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(3)

  tenantId    BigInt            @map("tenant_id")
  channel     MessageChannel    @map("channel")
  templateKey String?           @map("template_key") @db.VarChar(100)
  receiver    String            @map("receiver") @db.VarChar(255) // 邮箱 / 手机号 / 用户 ID
  title       String?           @map("title") @db.VarChar(200)
  content     String?           @map("content") @db.Text
  provider    String?           @map("provider") @db.VarChar(50) // 服务商标识
  status      MessageSendStatus @map("status")
  errorMsg    String?           @map("error_msg") @db.VarChar(2000)

  @@index([tenantId, createdAt])
  @@index([channel, createdAt])
  @@map("sys_message_send_log")
}

/// 用户 MFA 配置。secret 为 AES-256-GCM 密文（密钥走 env，ADR-013 D8）；
/// 恢复码存 SHA-256 摘要数组（含 usedAt），**不存明文**。
model SysUserMfa {
  id        BigInt    @id
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.DateTime(3)

  tenantId BigInt @map("tenant_id")
  userId   BigInt @map("user_id")

  secretCipher  String    @map("secret_cipher") @db.VarChar(500)
  recoveryCodes Json?     @map("recovery_codes") // [{ hash, usedAt }]
  enabled       Boolean   @default(false) @map("enabled") // 二次校验通过后才置 true
  confirmedAt   DateTime? @map("confirmed_at") @db.DateTime(3)

  @@unique([userId], name: "uniq_user_mfa")
  @@index([tenantId])
  @@map("sys_user_mfa")
}

enum MessageChannel {
  INNER @map("inner") // 站内信
  EMAIL @map("email")
  SMS   @map("sms")
}

enum MessageSendStatus {
  SUCCESS @map("success")
  FAILURE @map("failure")
}

enum TemplateStatus {
  ACTIVE   @map("active")
  DISABLED @map("disabled")
}
```

### 6.3 文件与存储（P3a）

完整决策见 `ADR-012`。

- **存储抽象**：`StorageDriver` 接口（`put` / `getStream` / `delete` / `getSignedUrl`），两实现 `LocalStorageDriver` / `S3StorageDriver`；驱动由 `STORAGE_DRIVER`（`local` | `s3`）选择；落点 `apps/admin-api/src/shared/storage/`，**不抽共享包**（唯一消费方）。
- **凭据纪律**：密钥 / 端点 / bucket 全部走 env（joi 校验），**不建配置表、不入库、不进日志**。
- **上传约束**（服务端强制、全部 env）：`UPLOAD_MAX_BYTES=5242880`（图片）/ `UPLOAD_MAX_BYTES_OTHER=20971520`（其它白名单类型）；`UPLOAD_ALLOWED_IMAGE_TYPES` / `UPLOAD_ALLOWED_FILE_TYPES` 白名单；缓冲式上传（multer `memoryStorage`），超限在缓冲阶段中断；**上传端点必须配限流**（复用既有 throttler + Redis）。
- **归一化**：所有图片经 `sharp` 归一化；`UPLOAD_COVER_MAX_WIDTH=1600`（不放大小图）、`UPLOAD_COVER_FORMAT=webp`（默认，可选 `jpeg` / `png`）；**保留原图**，封面写同一行 `cover_*` 列；归一化失败降级为「仅原图」。
- **配额**：`SysTenant.storageLimit` 为上限；用量 = 未删除 `SysFile` 行的 `SUM(size + coverSize)`（**不落冗余计数列**）；并发小幅超限窗口已接受（同 ADR-009 D3 口径）。
- **删除**：软删元数据 + 物理删对象（best-effort）→ 孤儿对象补偿任务**依赖 P3b 队列**（记待办）；配额随软删自动释放。
- **下载双通路**：默认代理（`GET /api/files/{id}/content`）；仅显式 `?direct=true` 才签发预签名 URL（TTL `STORAGE_SIGNED_URL_TTL=300`，需登录 + 权限，审计只记「签发」）；**不建 `download_count` 字段**。

| 端点                      | 方法         | 说明                            | 鉴权                           |
| ------------------------- | ------------ | ------------------------------- | ------------------------------ |
| `/api/files`              | POST         | 上传（multipart）               | `system:file:add` + 限流       |
| `/api/files`              | GET          | 列表（分页）                    | `system:file:query`            |
| `/api/files/{id}`         | GET / DELETE | 详情 / 删除                     | `system:file:query` / `remove` |
| `/api/files/{id}/content` | GET          | 代理下载（`?direct=true` 直连） | `system:file:download`         |

### 6.4 站内信与通知公告（P3a）

- **站内信** `SysUserMessage`：定向到单用户，`readAt` 表达已读（不设布尔列）；来源 = 内部投递 API + 自助读；P3a **无模板**。
- **公告** `SysNotice`：广播型、**无逐用户已读记录**；`tenantId` 可空（平台级）。
- **公告两级并列合并，不是遮蔽**：消费端同时展示平台级与租户级公告（见 `ADR-013` D3，术语口径已写入 `GLOSSARY.md`）。
- 权限：公告管理挂 `system:notice:*`（平台级公告走 `SuperAdminGuard`）；站内信自助仅需认证 + 租户作用域。管理写端点挂 `@OperLog`，高频读不挂。

| 端点                              | 方法               | 说明                       |
| --------------------------------- | ------------------ | -------------------------- |
| `/api/notices`                    | GET / POST         | 公告列表（两级合并）/ 创建 |
| `/api/notices/{id}`               | GET / PUT / DELETE | 详情 / 更新 / 删除         |
| `/api/user-messages`              | GET                | 自助列表（分页）           |
| `/api/user-messages/unread-count` | GET                | 未读数                     |
| `/api/user-messages/{id}/read`    | PUT                | 标记已读                   |
| `/api/user-messages/read-all`     | PUT                | 全部已读                   |
| `/api/user-messages/{id}`         | DELETE             | 删除（软删）               |

### 6.5 实时推送（P3a）

- **SSE**：`GET /api/realtime/stream`（`text/event-stream`）；前端用 `fetch` 消费，令牌走 `Authorization` 头（**绝不进 URL / query**）。
- **跨实例**：Redis pub/sub；`@fedstack/redis` 新增 `PubSubService`（发布复用共享 client、订阅独占连接），已并入 `ADR-003`（§7 / D9）。
- 频道：`{ns}rt:user:{userId}`（定向）、`{ns}rt:notice:{tenantId|platform}`（公告广播）；实例按本地连接动态订阅 / 退订。
- **best-effort**：DB 为权威真相源，Redis 故障时推送静默降级，不影响落库与拉取对齐。

### 6.6 消息中心与通道（P3b）

- `MessageCenter` + `MessageProvider` 接口；站内信 provider 在 P3a 已落，邮件 / 短信 provider 与模板化在 P3b 落地。
- 模板 `SysMessageTemplate`：平台级 + 租户级覆盖，**复用 ADR-009 D2 遮蔽语义**与缓存纪律。
- 投递记录 `SysMessageSendLog`：只增表（同审计日志口径）。
- 服务商配置（SMTP / 短信 AK）走 env，**不建表**。

### 6.7 MFA（P3b）

- 仅 **TOTP + 一次性恢复码**；二步登录用 **pending token**（Redis、短 TTL、一次性消费），未启用 MFA 的用户登录流程零变化（`ADR-013` D8）。
- 策略走参数配置（遮蔽语义，默认「可选」），**不建策略表**。
- secret 用 **AES-256-GCM**（`node:crypto`，密钥 env `MFA_SECRET_ENC_KEY`）；恢复码存 SHA-256 摘要 + `usedAt`（不存明文）。
- 自助端点（绑定 / 校验 / 解绑 / 重置恢复码）**仅需认证**。
- 依赖 `otpauth`；**不引 `qrcode`**（后端只回 otpauth URI，二维码由前端生成）。

### 6.8 队列与审计改造（P3b）

- 引入 `bullmq` + `@nestjs/bullmq`（Redis 承载）；用途：邮件 / 短信投递、**审计日志落库**（结清 `ADR-009` §4「fire-and-forget 无背压」待评估项）、文件物理删除补偿（`ADR-012` D6 待办）。
- 队列**只承载可丢弃 / 可重放的任务**，权威数据仍在 MySQL（`AGENTS.md` §13 / §14）。
- P4 定时任务复用同一队列底座，不引入第二套。

### 6.9 权限码与契约

- 新增权限码注册进 `@fedstack/auth-core`，并由 `packages/database/src/seed.ts` **import 同一注册表**同步菜单按钮（不得二次硬编码，见 `ADR-010`）。
- 计划新增：`SYSTEM.FILE.{QUERY,ADD,REMOVE,DOWNLOAD}`、`SYSTEM.NOTICE.{QUERY,ADD,EDIT,REMOVE}`、`SYSTEM.MESSAGE_TEMPLATE.{QUERY,ADD,EDIT,REMOVE}`（P3b）、`MONITOR.MESSAGE_LOG.QUERY`（P3b）。实际编码以注册表为准。
- 契约快照：`docs/plans/contracts/phase-3a.json` / `phase-3b.json`。

### 6.10 依赖清单

| 依赖                               | 批次 | 用途         | 备注                          |
| ---------------------------------- | ---- | ------------ | ----------------------------- |
| `@aws-sdk/client-s3`               | P3a  | S3 兼容驱动  | 通用端点（MinIO / COS / OSS） |
| `@aws-sdk/s3-request-presigner`    | P3a  | 直连下载签名 | 保留演进路径                  |
| `sharp`                            | P3a  | 图片归一化   | 原生依赖（同 argon2 类别）    |
| `@types/multer`                    | P3a  | 上传类型     | 仅类型                        |
| `nodemailer` + `@types/nodemailer` | P3b  | 邮件通道     |                               |
| `otpauth`                          | P3b  | TOTP         |                               |
| `bullmq` + `@nestjs/bullmq`        | P3b  | 队列         | P4 定时任务复用               |

- 全部先入 `pnpm-workspace.yaml` catalog，包内以 `"catalog:"` 引用。
- **不引**：`qrcode`、短信服务商 SDK（服务商待定，先用 `MessageProvider` 接口占位）。
- **零新依赖**：SSE（Nest `@Sse` + `rxjs`）、AES-256-GCM（`node:crypto`）。

### 6.11 验收标准

- [ ] 存储双驱动可用；密钥不入库、不进日志
- [ ] 上传类型 / 大小约束在服务端生效，超限在缓冲阶段中断，上传端点有限流
- [ ] 图片归一化（1600 / webp / 不放大小图），保留原图，封面写同一行
- [ ] 配额超限拒绝上传；删除后配额自动释放
- [ ] 代理 / 直连双通路可用，直连签发记审计，令牌不进 URL
- [ ] 站内信定向 + 公告广播（两级**并列合并**，非遮蔽）语义正确
- [ ] SSE 跨实例可达；Redis 故障静默降级且不影响落库
- [ ] 消息模板遮蔽、邮件 / 短信通道、MFA 二步登录（均 P3b）通过
- [ ] 审计日志自 P3b 起走队列投递
- [ ] 权限码与 seed 菜单一致；`phase-3a.json` / `phase-3b.json` 契约快照输出
- [ ] 类型检查 / 构建 / 测试通过；改动文件 lint 0 问题

---

## 7. P4 观察项

### 7.1 范围

定时任务（@nestjs/schedule + Bull）、监控指标（Prometheus）、代码生成。

### 7.2 新增表（概要）

```prisma
model SysJob { ... }            // 定时任务配置
model SysJobLog { ... }         // 任务执行日志
model SysGenTable { ... }       // 代码生成表配置
model SysGenColumn { ... }      // 代码生成列配置
```

---

## 8. 技术决策汇总

| 决策项     | 方案                                                 | 理由                                                 |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 密码哈希   | argon2id                                             | 抗 GPU 破解，内存硬度，现代标准                      |
| Token 策略 | 2h access + 7d refresh                               | 安全与体验平衡，Redis 滑动过期                       |
| 多端登录   | 允许，可强制下线                                     | 企业级审计需求                                       |
| 登录锁定   | 5 次/15min，账号维度                                 | 防暴力破解，避免 NAT 误伤                            |
| 数据权限   | 部门物化路径                                         | 避免递归查询，性能可控                               |
| 菜单权限   | 三级进库，按钮级                                     | 细粒度控制到 API                                     |
| 代码组织   | 业务模块留 admin-api                                 | 不过度抽象，保持 NestJS idiomatic                    |
| 存储抽象   | `StorageDriver` 双驱动（本地 / S3 兼容），配置走 env | 凭据不入库；切换存储只改环境变量（ADR-012）          |
| 存储配额   | 未删除文件行聚合（不落计数列）                       | 单一真相源，无计数漂移（ADR-012 D5）                 |
| 实时推送   | SSE + Redis pub/sub                                  | 令牌不进 URL，复用既有 HTTP 鉴权链路（ADR-013 D5）   |
| 消息队列   | BullMQ（Redis 承载，P3b 引入）                       | 外部 IO 可重试；只承载可丢弃任务（ADR-013 D7）       |
| 双因素认证 | TOTP + AES-256-GCM                                   | 零新加密依赖；pending token 隔离第二步（ADR-013 D8） |
| 契约管理   | OpenAPI 快照 + 扩展-收缩                             | 前后端协同安全                                       |

---

## 9. 风险与缓解

| 风险                          | 影响           | 缓解措施                                                    |
| ----------------------------- | -------------- | ----------------------------------------------------------- |
| Prisma 7 与 Prisma 5 行为差异 | 迁移逻辑错误   | 逐表对比验证，不照搬上游查询逻辑                            |
| MySQL 与 PostgreSQL 差异      | SQL 兼容问题   | 使用 Prisma 标准 API，避免原生 SQL                          |
| 多租户过滤遗漏                | 数据泄露       | ALS + `$extends` 自动注入，集成测试覆盖                     |
| 会话存储 Redis 故障           | 用户登出       | 降级为内存缓存 + 告警，Redis 恢复后自动同步                 |
| 契约变更破坏前端              | 前后端联调失败 | 严格扩展-收缩，每期契约快照评审                             |
| 缓冲式上传造成内存压力        | 服务不可用     | 分类上限 + 类型白名单 + 上传端点限流（ADR-012 D3）          |
| 对象删除失败残留孤儿对象      | 存储成本泄漏   | 软删留痕 + 补偿任务（P3b 队列），期间人工巡检（ADR-012 D6） |
| SSE 长连接被反向代理缓冲      | 推送静默失效   | 部署时关闭代理缓冲并加心跳保活（ADR-013 §5）                |

---

## 10. 下一步行动

1. **已完成（P0–P2）**：认证基座、权限与组织、系统管理三期均已交付，迁移 `init_p0_auth` / `init_p1_permission` / `init_p2_system` 已落库；`packages/auth-core` 已沉淀功能权限码注册表（`ADR-010`）；契约快照 `phase-0.json` / `phase-1.json` / `phase-2.json` 已输出。
2. **P3 规划已定稿（2026-10-19）**：P3a / P3b 范围、表结构、端点与依赖见本文 §6；决策记录 `ADR-012`（文件存储与配额）、`ADR-013`（消息中心 / 实时推送 / 队列），并修订 `ADR-003`（§7 `PubSubService` 连接分层）。
3. **P3a 开发（下一步）**：按 §6.1 执行 Prisma 迁移（新增 `SysFile` / `SysUserMessage` / `SysNotice`），实现 `shared/storage`（`StorageDriver` 双驱动）、`modules/file`、`modules/notice`、`modules/message`（站内信）、`modules/realtime`，并在 `@fedstack/redis` 增补 `PubSubService`。
4. **P3a 验收**：按 §6.11 校验清单执行，输出 `docs/plans/contracts/phase-3a.json`，进入 P3b。
5. **P3b 开发与验收**：按 §6.2 迁移（`SysMessageTemplate` / `SysMessageSendLog` / `SysUserMfa`），实现模板遮蔽、邮件 / 短信 provider、BullMQ 队列（含审计落库改造与文件删除补偿）、MFA 二步登录，输出 `docs/plans/contracts/phase-3b.json`。
