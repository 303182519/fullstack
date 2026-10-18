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

| 阶段 | 主题       | 核心交付物                                  | 依赖 |
| ---- | ---------- | ------------------------------------------- | ---- |
| P0   | 认证基座   | 租户骨架、用户/角色基础、JWT 认证、登录安全 | 无   |
| P1   | 权限与组织 | 菜单管理、部门管理、角色授权、数据权限      | P0   |
| P2   | 系统管理   | 字典、参数、操作日志、登录日志、在线用户    | P1   |
| P3   | 扩展能力   | 文件/OSS、消息中心、MFA、客户端管理         | P2   |
| P4   | 观察项     | 定时任务、监控指标、代码生成                | P3   |

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

| 项          | 设计稿                                     | 实际实现                                                                        | 依据                                               |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| SysDictData | 无租户维度                                 | 加 `tenantId`（null=平台级），唯一键 `(tenantId, dictType, dictValue)`          | 租户自定义字典数据需要隔离（本期决策第 3 项）       |
| SysConfig   | `configType` 字段                          | 移除，新增 `isSystem`（内置参数禁删、key 不可改）                               | 类型信息无消费场景；防误删内置参数                 |
| SysOperLog  | `url` / `costTime`，tenantId/userId 可空   | `path` / `costMs`；tenantId/userId/username 必填（username 为主体名快照）        | 审计写路径只发生在已认证主体；快照保证用户删除后日志可读 |
| SysLoginLog | `userAgent`                                | `device`（会话设备标识）；`msg` 收敛为枚举 token                                | 与会话/强制下线语义对齐；展示文案由前端映射        |
| 在线用户    | 设计稿未列端点                             | 三端点（列表/踢单/全设备下线），会话遍历用 SCAN 键空间                          | 本期决策第 7 项                                    |

**关键机制**：

- 字典/参数数据值走 cache-aside + 写时失效；**遮蔽判定不缓存**（防平台级写入失效不精确，见 ADR-009 D4）。
- 平台级唯一性：MySQL 唯一索引对 NULL 不生效，由服务层查重 + 软删行复活 + `P2002` 兜底（见 ADR-009 D3）。
- 遮蔽语义：租户存在未删除定义（与 status 无关）即整体遮蔽平台级，不合并；管理列表对平台行带 `shadowed` 标记（见 ADR-009 D2）。
- P0 user/role 端点补齐 `@RequirePermission`；存量 P0/P1 全部写端点挂 `@OperLog`（auth login/logout 有意不挂）。

完整决策记录：`docs/architecture/decisions/ADR-009-shadowing-and-audit.md`

契约快照：`docs/plans/contracts/phase-2.json`


---

## 6. P3 扩展能力

### 6.1 范围

文件/OSS、消息中心（短信/邮件/站内信）、MFA、客户端管理。

### 6.2 新增表（概要）

```prisma
model SysFile { ... }           // 文件元数据
model SysOssConfig { ... }      // OSS 配置
model SysSmsTemplate { ... }    // 短信模板
model SysSmsLog { ... }         // 短信发送日志
model SysMailTemplate { ... }   // 邮件模板
model SysMailLog { ... }        // 邮件发送日志
model SysNotice { ... }         // 站内信/通知公告
model SysUserNotice { ... }     // 用户已读记录
model SysUserMfa { ... }        // MFA 配置
model SysClient { ... }         // OAuth 客户端管理
```

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

| 决策项     | 方案                     | 理由                              |
| ---------- | ------------------------ | --------------------------------- |
| 密码哈希   | argon2id                 | 抗 GPU 破解，内存硬度，现代标准   |
| Token 策略 | 2h access + 7d refresh   | 安全与体验平衡，Redis 滑动过期    |
| 多端登录   | 允许，可强制下线         | 企业级审计需求                    |
| 登录锁定   | 5 次/15min，账号维度     | 防暴力破解，避免 NAT 误伤         |
| 数据权限   | 部门物化路径             | 避免递归查询，性能可控            |
| 菜单权限   | 三级进库，按钮级         | 细粒度控制到 API                  |
| 代码组织   | 业务模块留 admin-api     | 不过度抽象，保持 NestJS idiomatic |
| 契约管理   | OpenAPI 快照 + 扩展-收缩 | 前后端协同安全                    |

---

## 9. 风险与缓解

| 风险                          | 影响           | 缓解措施                                    |
| ----------------------------- | -------------- | ------------------------------------------- |
| Prisma 7 与 Prisma 5 行为差异 | 迁移逻辑错误   | 逐表对比验证，不照搬上游查询逻辑            |
| MySQL 与 PostgreSQL 差异      | SQL 兼容问题   | 使用 Prisma 标准 API，避免原生 SQL          |
| 多租户过滤遗漏                | 数据泄露       | ALS + `$extends` 自动注入，集成测试覆盖     |
| 会话存储 Redis 故障           | 用户登出       | 降级为内存缓存 + 告警，Redis 恢复后自动同步 |
| 契约变更破坏前端              | 前后端联调失败 | 严格扩展-收缩，每期契约快照评审             |

---

## 10. 下一步行动

1. **立即执行**：创建 `packages/auth-core` 共享包（JWT 策略、argon2 工具、权限装饰器骨架）
2. **P0 开发**：按 3.2 Schema 执行 Prisma 迁移，实现 auth/user/role/tenant 模块
3. **P0 验收**：完成后输出 `docs/plans/contracts/phase-0.json`，进入 P1
