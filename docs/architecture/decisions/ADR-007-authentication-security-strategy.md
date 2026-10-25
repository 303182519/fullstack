# ADR-007：认证与安全策略

- 状态：已采纳（2026-10-16）
- 日期：2026-10-16
- 影响范围：`apps/admin-api/src/modules/auth/`、`apps/admin-api/src/shared/auth/`、`packages/database/prisma/schema.prisma`、`apps/admin-api/src/config/`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-005`（多租户方案）、`ADR-006`（schema 重设计）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。
>
> **2026-10-25 修订（D5）**：原 D1 中 refresh 旋转的实现存在 TOCTOU 竞态（「读旧哈希 → 签发 → 覆盖新哈希」非原子），并发刷新可双双成功，导致重放检测失效与客户端令牌被提前作废。新增 D5 决策：采用单 key Redis Lua CAS 作为旋转唯一提交点，并为 refresh token 引入 `jti` 保证每次签发必然不同。

---

## 1. 背景（事实依据）

- 迁移上游 Nest-Admin-Soybean（NestJS 10 + Prisma 5 + PostgreSQL）的认证模块，需适配现有架构（NestJS 12 + Prisma 7.9.1 + MySQL + Redis）。
- 上游使用 **BCrypt** 做密码哈希（证据：上游 README「密码加密 - BCrypt 加密存储」），但用户明确指定 **argon2** 作为本项目的密码哈希算法。
- 上游使用 **JWT 双 token** 模式（证据：上游 README「JWT 认证 - 无状态身份验证」），但具体有效期、存储方式、刷新机制在 README 中未明确。
- 上游有登录锁定与验证码机制（证据：上游 README「登录页面 - 支持账号密码登录、验证码验证」），但策略参数未文档化。
- 本仓库已有 `LoginAttemptService` 骨架（证据：`apps/admin-api/src/shared/caching/login-attempt.service.ts`），但无具体策略实现。
- 本仓库已有 `nestjs-cls` + `@nestjs-cls/transactional` 依赖（证据：`apps/admin-api/package.json`），支持 AsyncLocalStorage 上下文传播。

## 2. 问题

企业级多租户 SaaS 后台的认证系统需要在安全性、用户体验、可审计性之间取得平衡。具体需要决策：

1. JWT access/refresh token 的有效期、存储位置、刷新机制
2. 是否允许多端登录，以及如何支持管理员强制下线
3. 密码哈希算法参数与密码复杂度规则
4. 登录锁定策略（阈值、时长、维度）与验证码触发时机

## 3. 决策（最终）

### D1 Token 策略：双 token + 滑动过期

- **Access Token**：JWT，2 小时有效期，通过 `Authorization: Bearer <token>` Header 传递。短有效期降低泄露后的滥用窗口。
- **Refresh Token**：JWT，7 天有效期，存储于 **HttpOnly Cookie**（防 XSS 窃取）+ **Redis 服务端存储**（支持主动失效）。每次刷新时重新计算 7 天（滑动过期），保持长期会话活跃。
- **Redis 会话结构**：
  - `admin-api:session:{sessionId}` → JSON `{userId, tenantId, device, ip, expiresAt}`
  - `admin-api:user:{userId}:sessions` → Set `[sessionId1, sessionId2, ...]`
  - `admin-api:refresh:{refreshToken}` → JSON `{userId, sessionId, expiresAt}`

**取舍**：纯 Header 存储 refresh token（无 Cookie）更简单，但无法利用浏览器同源策略保护；纯内存会话（无 Redis）重启即丢失，无法支持强制下线。双 token + Redis 会话列表是安全性与运维可控性的平衡点。

### D2 多端登录：允许，可强制下线

- 同一账号允许在多个设备同时在线，每设备持有独立 `sessionId`。
- Redis 中维护 `user:{userId}:sessions` 集合，管理员可查看在线用户列表并强制下线指定会话（删除对应 session key）。
- 强制下线后，该设备的 access token 在剩余有效期内仍可使用（JWT 无状态），但 refresh token 立即失效，下次刷新即登出。

**取舍**：单端登录（新登录踢掉旧会话）实现更简单，但不符合现代多设备使用习惯，且管理员无法细粒度控制。选项 B（允许 + 可强制下线）兼顾用户体验与企业级审计需求。

### D3 密码策略：argon2id + 历史密码

- **哈希算法**：argon2id（Argon2 的混合模式，抗侧信道攻击 + 抗 GPU 破解），参数：`memoryCost=65536`（64MB）、`timeCost=3`、`parallelism=4`。
- **复杂度**：最小 8 位，必须包含大小写字母 + 数字，特殊字符可选。
- **密码历史**：保留最近 5 次密码哈希（JSON 数组存储于 `sys_user.password_history`），禁止重复使用。

**取舍**：BCrypt 是成熟方案，但 argon2id 是 2015 年密码哈希竞赛 winner，内存硬度特性使其在 GPU 暴力破解场景下显著优于 BCrypt。上游使用 BCrypt 属于历史遗留，本项目无兼容负担，直接采用更现代的标准。

### D4 登录锁定：按账号维度 + 验证码前置

- **失败计数**：Redis 计数器 `admin-api:login:fail:{tenantId}:{username}`，TTL 15 分钟，每次失败递增。
- **锁定阈值**：连续 5 次失败锁定账号 15 分钟（写入 `admin-api:login:lock:{tenantId}:{username}`）。
- **验证码**：连续 3 次失败后，登录接口强制要求图形验证码（svg-captcha），答案存 Redis `admin-api:captcha:{uuid}`，TTL 5 分钟。
- **IP 维度**：仅记录登录日志（`sys_login_log.ip`），不用于锁定判定——避免 NAT 场景下误伤大量用户。

**取舍**：按 IP 锁定可以防分布式暴力破解，但企业办公网、学校、小区宽带普遍使用 NAT，一个攻击者可能导致整个网段被锁。按账号锁定更精准，IP 仅作为审计线索。

### D5 Refresh Token 旋转的原子性：单 key Lua CAS + jti

- **问题**：D1 中 refresh 旋转的初始实现为「读 Redis 旧哈希 → JWT 签发新对 → 覆盖 Redis 新哈希」三步，读与写之间夹着 Redis GET 与两次 JWT 签名（毫秒级窗口）。两个并发刷新请求会在覆盖前都读到旧哈希，双双通过校验、双双覆盖——后写者获胜，先写者拿到的 refresh token 立即失效；更严重的是重放检测被绕过（攻击者与合法客户端同时提交同一 refresh token 也能成功）。这违反「refresh token 一次性」语义。
- **决策**：
  1. 以 **单 key Redis Lua CAS** 作为旋转的唯一提交点：`GET refreshKey == 旧哈希` 才 `SET 新哈希 EX ttl`，脚本返回 1 的请求为赢家，返回 0 抛「refresh token 无效」。
  2. 刷新流程重排为：**签发新令牌（纯本地计算）→ 滑动会话 TTL（预写）→ CAS（提交点）**。CAS 之前的步骤失败时旧 token 仍有效、客户端可重试；CAS 之后无状态变更。
  3. **refresh payload 引入 `jti`（UUID）**：原 payload 只有 `{sub, sid, typ}`，而 JWT `iat` 只精确到秒，同一秒内两次刷新会签发字节完全相同的 token，旋转退化为「写回同值」、旧 token 不会失效。加 `jti` 后每次签发必然唯一。
- **为什么不用分布式锁**：`RedisLockService.withLock` 的 `acquire` 返回 `null` 同时代表「并发未抢到」与「Redis 不通」，语义混淆，且多出锁 TTL 失败面；CAS 直接返回布尔，语义清晰。
- **为什么脚本只碰一个 key**：`session`、`refresh`、`user:sessions` 三个 key 落在不同 slot，多 key Lua 在 Redis Cluster 下会触发 `CROSSSLOT`（除非引入 hash tag，而项目限流模块已明确避免 hash tag 以支持自然散列）。因此脚本仅操作 `auth:refresh:sid=*`，会话主体与集合 TTL 的滑动放在 CAS 之前的独立命令中完成。
- **失败语义**：
  - 签发失败 / 会话 TTL 写入失败（CAS 之前）：抛 503，旧 token 仍有效，可重试。
  - CAS 失败（返回 0）：抛 401（refresh token 无效），表示该 token 已被轮换或为陈旧/重放。
  - CAS 执行成功但响应丢失（网络）：旧 token 已失效、新 token 未送达，需重新登录——无幂等键下的固有取舍。

**取舍**：牺牲了「CAS 前会话 TTL 已滑动但 CAS 失败」的极小不一致（会话记录 TTL 延长、refresh 未轮换），换取单 key CAS 的 Cluster 兼容性与清晰的提交点语义。该不一致可恢复（重试时 CAS 成功），不影响安全。

## 4. 备选方案与取舍

- **A. 纯 JWT 无 refresh（否决）**：access token 有效期被迫拉长（如 24h），泄露风险窗口过大；或强制用户频繁重新登录，体验差。
- **B. 单端登录（否决）**：踢下线策略导致用户切换设备时体验断裂，且管理员无法查看/控制在线会话。
- **C. BCrypt 密码哈希（否决）**：抗 GPU 破解能力弱于 argon2id，且用户已明确指定 argon2。
- **D. 按 IP 锁定（否决）**：NAT 误伤风险高，不符合企业级「最小误伤」原则。

## 5. 后果

**正面**

- 密码安全性达到当前业界最佳实践（argon2id + 历史密码）。
- 会话管理具备企业级可控性（多端登录 + 强制下线 + 滑动过期）。
- 登录安全策略精准（按账号锁定，验证码前置，IP 仅审计）。
- 与现有 `@fedstack/redis` 缓存基础设施无缝集成（复用 `CacheService` 与 `KeyPrefixer`）。

**负面 / 风险**

- Redis 成为会话可用性的单点依赖：Redis 故障时用户无法刷新 token（access token 在 2h 内仍可用）。缓解：Redis 降级时允许「只读模式」——允许已持有有效 access token 的用户继续访问，禁止新登录与刷新。
- 滑动过期导致长期不活跃会话仍可能保持有效（7 天无操作才过期）。缓解：管理员可强制下线，且后续可叠加「绝对过期」策略（如 30 天强制重新登录）。
- 密码历史 JSON 数组存在并发写冲突风险（同一用户同时改密两次）。缓解：使用 Prisma 原子更新（`$transaction` 内先读再写），或接受极低概率冲突（改密场景并发极低）。
- Refresh 旋转 CAS 成功但响应丢失时，客户端需重新登录（无幂等键）。缓解：access token 在有效期内仍可访问，用户感知为「下次刷新时重新登录」，非数据丢失。

## 6. 验证（待 P0 实施后补充）

| 校验           | 命令/方法                           | 预期结果                                                           |
| -------------- | ----------------------------------- | ------------------------------------------------------------------ |
| argon2id 哈希  | `argon2.hash()` / `argon2.verify()` | 哈希以 `$argon2id$` 开头，验证通过                                 |
| 密码历史       | 连续 5 次修改密码后尝试复用旧密码   | 返回「密码近期已使用」错误                                         |
| 登录锁定       | 连续 5 次错误密码登录               | 返回「账号已锁定，15 分钟后重试」                                  |
| 验证码         | 连续 3 次失败后不带验证码登录       | 返回「请输入验证码」                                               |
| 多端登录       | 同一账号两个设备登录                | 两设备均正常访问，Redis 中可见两条 session                         |
| 强制下线       | 管理员删除某 sessionId              | 该设备 refresh token 失效，access token 到期后登出                 |
| 滑动过期       | 每次刷新后检查 Redis TTL            | refresh token TTL 重置为 7 天                                      |
| 并发刷新原子性 | 同一 refresh token 并发提交两次     | 仅一次成功（CAS 返回 1），另一次返回 401「refresh token 无效」     |
| refresh 唯一性 | 同一秒内连续刷新两次                | 两次签发的 refresh token 字节不同（`jti` 不同），旧 token 立即失效 |
