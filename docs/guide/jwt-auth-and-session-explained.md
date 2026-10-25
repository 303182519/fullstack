# JWT 鉴权与会话（Redis）· 原理与实现详解

> 本文面向第一次接触 JWT 鉴权的同学，讲清楚三件事：
> **JWT 本身怎么验、本项目为什么是双令牌、Redis 在其中承担什么角色。**
>
> 对应代码：`apps/admin-api/src/common/guards/jwt-auth.guard.ts`、
> `apps/admin-api/src/modules/auth/`、`apps/admin-api/src/shared/auth/`。
> 设计依据：ADR-007（D1 / D2 / D5）。

---

## 1. 先建立一个心智模型

一句话概括本项目：

> **access token 是「自证有效」的短票据，refresh token 是「靠服务端记账才能续期」的长票据；
> 两者都用 `sid` 指向 Redis 里的同一个会话。**

```text
                     ┌──────────────── 浏览器 ────────────────┐
                     │                                        │
                     │  access token (2h)  → 内存 / 响应体     │
                     │  refresh token (7d) → HttpOnly Cookie   │
                     └───────────┬────────────────────────────┘
                                 │
      每个业务请求：Authorization: Bearer <accessToken>
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  JwtAuthGuard          │
                    │  ① 验签 + 查过期        │
                    │  ② 校验 typ=access      │
                    │  ③ 用 sid 查 Redis 会话 │───► Redis: auth:session:id=<sid>
                    └────────────────────────┘
                                 │
                      会话在 → 放行；不在 → 401 会话已下线
```

关键认知：**access token 不是"完全无状态"的**。它不把令牌本身存进 Redis，但它把"这张令牌还有没有效"的开关交给了 `sid` 指向的会话记录。

---

## 2. JWT 原理

### 2.1 JWT 长什么样

JWT = **JSON Web Token**，三个 Base64URL 段用 `.` 连接：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiIxMjMiLCJzaWQiOiJhYmMi... . 5f2K9...
└──────────── header ─────────────┘   └──────────── payload ────────────┘   └─ signature ─┘
```

- **header**：算法与类型，本项目是 `{"alg":"HS256","typ":"JWT"}`。
- **payload**：业务声明（claims）。本项目 access 令牌放 `sub`（用户）、`sid`（会话）、`tid`（租户）、`un`（用户名）、`sup`（超管）、`typ`（令牌类型），外加标准字段 `iat` / `exp`。
- **signature**：`HMAC-SHA256(base64(header) + "." + base64(payload), secret)`。

### 2.2 一个必须纠正的常见误解

**Base64URL 是编码，不是加密。** 任何人都能把前两段解出来看到 payload 原文（浏览器 devtools、jwt.io 都能做）。所以：

- 令牌里**绝不能放密码、密钥、敏感个人信息**；
- 本项目放的是 userId / tenantId / username / isSuper —— 都是非机密、用于降级重建主体的身份事实（见 `auth.types.ts` 注释）。

JWT 真正提供的是**防篡改**：改一个字节，签名就对不上。签名密钥只存在于服务端（`JWT_SECRET`），攻击者拿不到就无法伪造。

### 2.3 "无状态"到底省掉了什么

传统 Session 方案里，每个请求都要拿 `sessionId` 查服务端存储才能知道"你是谁"。JWT 把身份直接写进令牌并签名，**理论上**服务端不用查任何存储，只验签就能放行——这就是"无状态"的价值：少一次 IO、水平扩容无粘性。

但无状态有个致命短板：**令牌一旦签发，在 `exp` 之前无法作废**。改密码、封号、强制下线都拦不住一张已经发出的 JWT。这正是 Redis 会话记录要补的洞（§6）。

### 2.4 有效期为什么必须短

`exp` 是令牌自己的死亡时间。由于无法撤销，**`exp` 就是最坏情况下的风险窗口**：

| 令牌 | 本项目有效期 | 泄露后的风险窗口 | 补偿手段 |
| --- | --- | --- | --- |
| access token | 2 小时（`JWT_ACCESS_EXPIRES_IN`，默认 7200 秒） | 最长 2 小时 | 短 TTL + 会话记录实时撤销 |
| refresh token | 7 天（`JWT_REFRESH_EXPIRES_IN`，默认 604800 秒） | 最长 7 天，且能不断续期 | 一次性轮换 + 服务端摘要比对 |

配置来源：`config/config.default.ts`、`env.validation.ts`；两者均为秒。

---

## 3. 双令牌模型

### 3.1 为什么不用一个令牌

| 方案 | 问题 |
| --- | --- |
| 只发长效 access（如 24h） | 泄露后可被滥用一整天，且无法撤销 |
| 只发短效 access（如 15min） | 用户频繁被踢回登录页，体验不可接受 |
| **短 access + 长 refresh** | access 泄露窗口小；refresh 长期存活但每次使用都会轮换，可检测重放 |

### 3.2 两种令牌的差异

| 维度 | access token | refresh token |
| --- | --- | --- |
| `typ` 声明 | `'access'` | `'refresh'` |
| payload | `sub, sid, tid, un, sup, typ` | `sub, sid, jti, typ` |
| 有效期 | 2 小时 | 7 天（每次刷新重置，滑动过期） |
| 传输位置 | `Authorization: Bearer <token>` 请求头 | `admin_refresh_token` **HttpOnly Cookie** |
| 前端能否读到 | 能（响应体返回） | **不能**（HttpOnly，JS 读不到） |
| 能调业务接口吗 | 能 | 不能（`typ` 校验会拒） |
| 能否撤销 | 下一次请求即失效（依赖会话记录） | 删除 Redis 摘要后立即失效 |
| 是否存 Redis | 不存（只存它指向的会话） | 存**摘要**，用于比对与轮换 |

`typ` 字段是**类型隔离**：拿 refresh token 去调业务接口会被 `claims.typ !== 'access'` 拦下（`jwt-auth.guard.ts` L97-L103），避免长效令牌越权当访问凭证用。

### 3.3 refresh 为什么放 HttpOnly Cookie

- **防 XSS 窃取**：JS 读不到，即使页面被注入脚本也拿不走；
- **浏览器自动携带**：前端不用手动管理；
- Cookie 参数（`auth.controller.ts` L176-L184）：

```text
name:     admin_refresh_token
httpOnly: true            ← JS 不可读
secure:   IsProduction    ← 生产环境仅 HTTPS 传输
sameSite: lax             ← 跨站请求默认不携带，降低 CSRF 面
path:     /
maxAge:   7 天（与会话 TTL 一致）
```

access token 则放在响应体里由前端持有（内存或短期存储），因为需要主动塞进请求头。

---

## 4. 签发：登录链路

全部逻辑在 `AuthService.login()`，Controller 只做参数绑定与 Cookie 写入。

```text
POST /auth/login { tenantCode, username, password, captcha? }
   │
   ├─ ① 解析租户（存在 / 未删除 / ACTIVE / 未过期）
   ├─ ② 账号锁定判定（Redis 计数，命中直接拒，省掉 argon2 计算）
   ├─ ③ 验证码前置（失败 ≥3 次后强制）
   ├─ ④ 查用户 + argon2id 校验密码
   │
   ├─ ⑤ 启用 MFA？→ 只发 pendingToken（typ='mfa-pending'，5 分钟，一次性）
   │
   └─ ⑥ 正常登录：
          createSession()        → Redis 写 session + user:sessions
          issueTokens()          → 本地签 access + refresh（无 IO）
          saveRefreshHash()      → Redis 写 sha256(refreshToken)
          返回 { accessToken, tokenType, expiresIn }
          refresh 由 Controller 写入 HttpOnly Cookie
```

逐点说明：

1. **先建会话再签令牌**。`sessionId` 要作为 `sid` 写进两种令牌，所以必须先有会话 ID。
2. **签发是纯本地计算**。`jwtService.signAsync` 不碰 Redis，因此签发失败不会污染会话状态。
3. **最后才写 refresh 摘要**。写入失败会抛 503（登录失败），但此时会话已被创建——这是一个"孤儿会话"：没有 refresh 摘要，客户端也没拿到任何令牌，只能等 TTL 自然过期，无法被利用。
4. **返回值里没有 refresh token**。Controller 直接写 Cookie，refresh 原文不出现在响应体中。

有点反直觉但很重要：**先建会话，后签令牌**，与刷新流程"先签令牌，后 CAS 提交"的顺序恰好相反——因为登录没有并发竞争的旧令牌需要比对，而刷新有。

---

## 5. 使用：每个请求如何校验

`JwtAuthGuard` 注册为全局守卫，在 `app.module.ts` 中按此顺序执行：

```text
ThrottlerGuard（限流） → JwtAuthGuard（认证） → PermissionGuard（权限码）
```

守卫默认"拒绝优先"：没标 `@Public()` 的路由一律要求登录。

### 5.1 校验五步

```ts
// 1. 取 Authorization: Bearer <token>
// 2. verifyAsync：验签 + 校验 exp（不区分"过期"与"签名错"的对外文案）
// 3. claims.typ !== 'access' → 401
// 4. 用 claims.sid 查 Redis 会话
// 5. 主体写入 request.user + CLS
```

第 4 步有三种结果，决定了整个系统的降级策略：

| Redis 查询结果 | 行为 | HTTP |
| --- | --- | --- |
| `ok` | 用**会话记录**中的身份重建 `AuthPrincipal` | 放行 |
| `missing` | 会话已被登出 / 强制下线 / 自然过期 | 401（`SESSION_REVOKED`） |
| `unavailable` | Redis 故障 → 仅凭令牌 payload 重建主体，**降级放行** | 放行 + warn 日志 |

两个设计要点：

- **以服务端会话为准**，不是以令牌 payload 为准。`sup`、`tid` 等字段以 Redis 里那份快照为权威，令牌只提供 `sid` 这个索引。这避免了"令牌签发后身份被修改，旧令牌仍按旧身份放行"。
- **`unavailable` 的降级放行**是有意的取舍（ADR-007 D1 缓解措施）：access 有效期短且签名可信，宁可让已经登录的用户在 Redis 故障期间继续只读访问，也不能让整个系统 500。注意这只影响**读**；登录、刷新、登出这些正确性敏感写入一律 fail-fast（§9）。

### 5.2 公开端点

`@Public()` 标记的端点（登录、验证码、刷新、MFA 验证）跳过整个守卫。这些端点自己承担校验责任，例如 `POST /auth/refresh` 在 Controller 层直接读 Cookie 并调用 `AuthService.refresh()`。

---

## 6. Redis 会话模型

### 6.1 三类 key

实现位于 `SessionService`，key 定义在 `CacheKeys`，落盘前都会经 `KeyPrefixer` 加上 app 命名空间（`admin-api:`）。

| Redis key | 结构 | TTL | 作用 |
| --- | --- | --- | --- |
| `auth:session:id=<sid>` | JSON `SessionRecord` | refresh 有效期 | **会话权威记录**：该 sid 是否存在、身份快照、设备/IP/时间 |
| `auth:refresh:sid=<sid>` | `sha256(refreshToken)` 十六进制 | refresh 有效期 | **当前唯一有效的 refresh 摘要**，刷新时比对与轮换 |
| `auth:user:sessions:userId=<uid>` | Set `<sid>...` | refresh 有效期 | 某用户的全部在线会话，用于在线列表与"踢掉全部设备" |

`SessionRecord` 不存令牌、不存密码，只有：

```json
{
  "sessionId": "...",
  "userId": "雪花ID字符串",
  "tenantId": "雪花ID字符串",
  "username": "...",
  "isSuper": false,
  "device": "User-Agent 前 200 字符",
  "ip": "登录来源 IP（仅审计）",
  "createdAt": "ISO 8601",
  "expiresAt": "ISO 8601，每次刷新向后滑动"
}
```

所有 BigInt 雪花 ID 一律用 string 承载：JWT payload 和 JSON 都不支持 BigInt。

### 6.2 为什么是三个 key 而不是一个

职责不同，失效语义也不同：

- `session` 决定"这个设备的登录态还在不在"——**删它 = 立即下线**；
- `refresh` 决定"这张 refresh 令牌是不是最新签发的那张"——**删它/改它 = 刷新失效**；
- `user:sessions` 是索引，用于"列出此人在哪些设备登录"和"一键全部踢下线"。

三者成对维护：`removeSession` 一次删前两个，`removeAllSessions` 按索引批量删。

### 6.3 为什么 refresh 存的是摘要而不是原文

`hashCacheToken()`（`packages/node/redis/src/hash-token.ts`）做 SHA-256：

- 即使 Redis 被拖库，拿到摘要也无法反推令牌、无法直接冒用；
- CAS 比对只需要"相等性"，不需要原文；
- 数据库/缓存里出现明文长期凭证本身就是一类漏洞。

同理，写进 Redis 的都是摘要，原文只存在于客户端 Cookie 里。

### 6.4 滑动过期

会话不是"登录后 7 天固定死亡"，而是**每次刷新把三个 key 的 TTL 都重置为 7 天**：

```text
登录    → session TTL = 7d
每次刷新 → touchSession() 重写 session + 重置 user:sessions TTL
        → casRotateRefresh() 重置 refresh TTL
```

所以实际语义是"连续 7 天无操作才过期"。ADR-007 §5 已记录该风险（长期不活跃会话可能长期有效），后续可叠加绝对过期（如 30 天强制重登）。

---

## 7. 刷新：令牌旋转 + Lua CAS

刷新是整个鉴权里最容易写错的地方。

### 7.1 完整流程

```text
POST /auth/refresh（refresh token 从 HttpOnly Cookie 读取）
   │
   ├─ ① verifyAsync：验签 + exp
   ├─ ② typ === 'refresh' 且 sub/sid 存在
   ├─ ③ lookupSession(sid)
   │     missing      → 401
   │     unavailable  → 503（不降级！）
   │     ok           → 继续
   │
   ├─ ④ issueTokens()        ← 纯本地计算，先签发
   ├─ ⑤ touchSession()       ← 滑动会话 TTL（预写）
   └─ ⑥ casRotateRefresh()   ← 唯一提交点
          GET refreshKey == sha256(旧 token) ?
            是 → SET 新摘要 + EX ttl，返回 1 → 换发成功
            否 → 返回 0 → 401「refresh token 无效」
```

### 7.2 为什么顺序是"先签发 → 再滑动 → 最后 CAS"

每一步失败后的状态都可解释：

| 失败点 | 结果 |
| --- | --- |
| 签发失败 | 无任何副作用，旧 token 仍有效，可重试 |
| 滑动 TTL 失败 | 抛 503；旧 token 仍有效，可重试 |
| CAS 返回 0 | 401：这张 token 已被轮换 / 是陈旧或重放令牌 |
| CAS 成功但 HTTP 响应丢失 | 旧 token 已失效、新 token 未送达 → 用户需重新登录（无幂等键的固有取舍） |

如果把顺序反过来（先覆盖哈希再签发），一旦签发失败就会出现"旧令牌已作废、新令牌没发出去"的死局。

### 7.3 为什么要用 Lua CAS，而不是 GET + SET

`GET` 和 `SET` 之间存在 `TOCTOU` 窗口（读到写之间的时间差）。两个并发刷新请求会：

```text
请求 A: GET 旧哈希 → 匹配 → 签发 A 的令牌 → SET A 的新哈希
请求 B: GET 旧哈希 → 匹配 → 签发 B 的令牌 → SET B 的新哈希
```

两个都成功，后写者覆盖先写者：A 刚收到的 refresh token 立刻失效，且"一次性消费"的重放检测被绕过。

Lua 脚本保证 `GET` 与 `SET` 原子完成（`session.service.ts` L178-L190）：

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
```

脚本只操作一个 key。这是**刻意**的：`session`、`refresh`、`user:sessions` 落在不同 slot，多 key Lua 在 Redis Cluster 下会触发 `CROSSSLOT`（除非引入 hash tag，而项目限流模块已明确避免 hash tag 以支持自然散列）。因此滑动会话 TTL 放在 CAS 之前的独立命令中完成。

### 7.4 为什么 refresh payload 必须有 `jti`

JWT 的 `iat` 只精确到秒。如果 payload 只有 `{sub, sid, typ}`，同一秒内两次刷新会签出**字节完全相同**的 token，旋转退化成"写回同值"，旧 token 根本不会失效。

`jti`（UUID）保证每次签发必然唯一，轮换才有意义（`auth.service.ts` L540-L545）。

---

## 8. 登出与强制下线

### 8.1 登出

```text
POST /auth/logout（需要 access token）
   ├─ removeSession(sid, userId)
   │    DEL sessionKey, refreshKey
   │    SREM user:sessions userId sid
   └─ 清 refresh Cookie
```

顺序是**先删会话再清 Cookie**（`auth.controller.ts` L158-L162）：

- 删会话失败会抛 503，此时保留 Cookie，客户端可重试；
- 若先清 Cookie 而删除失败，用户本地看起来已登出，服务端会话却还活着——这是更危险的不一致。

### 8.2 强制下线

管理员删除某个 `auth:session:id=<sid>` 后：

- 该设备的**下一次业务请求**就会 401（守卫查不到会话）；
- 该设备的 refresh 也会失败（会话不存在）；
- 不需要等 access token 自然过期。

> 注意与 ADR-007 D2 的措辞差异：D2 写的是"access token 在剩余有效期内仍可使用"，那是纯无状态 JWT 的行为。本项目守卫**每次请求都查会话**，所以实际行为是"立即失效"。只有 Redis 故障进入 `unavailable` 降级时，才会退化成"access token 到期前仍可用"。

---

## 9. access 为什么不需要存 Redis

这是最容易问倒人的一点。结论：**两者需要维护的状态不同。**

| 维度 | refresh token | access token |
| --- | --- | --- |
| 是否有"消耗"语义 | 有，且只能用一次 | 无，可重复使用 |
| 是否需要"当前唯一有效值" | 需要（CAS 比对基准） | 不需要 |
| 同一 sid 下会存在几张 | 永远 1 张 | 多标签页可能各持一张 |
| 轮换频率 | 每次刷新 | 每个 access TTL 周期一次 |
| 校验方式 | 必须服务端比对摘要 | 验签 + exp 自证；再用 sid 查会话开关 |

如果存 access token 本身：一个 sid 要维护"令牌集合"而非单值，每张 TTL 还不同，换来的收益为零——因为**撤销能力已经由 session 记录提供了**，再存一份副本不会让下线更快。

所以准确表述是：**access token 不落 Redis，但它的有效性开关委托给会话记录。** 用短 TTL 限制无状态窗口，用会话记录补撤销能力。

---

## 10. Redis 故障时的行为矩阵

"正确性敏感的操作不降级"是贯穿整个认证模块的纪律（`session.service.ts` 类注释）。

| 场景 | Redis 不可用时的行为 | 原因 |
| --- | --- | --- |
| 业务请求鉴权 | **降级放行**（仅凭令牌 claims，warn 日志） | access 短 TTL + 签名可信；不能让故障打死整个系统 |
| 登录 | 503 | 不能"登录成功但服务端无会话" |
| 刷新 | 503 | 不能签发无会话的令牌；刷新属授权发凭证 |
| 登出 | 503（Cookie 保留） | 让客户端可重试，避免本地已登出、服务端还活着 |
| 在线会话列表 | 返回空列表 | 纯读取，可降级 |
| MFA 二步验证 | 拒绝（pending 查不到即视为已失效） | 一次性消费标记必须可信 |

矩阵背后的原则：

- **读**可以降级，**写**不能；
- 降级的方向永远选"少给权限"，不选"多给权限"；
- Redis 不是唯一真相源的场景（如会话列表），失败时返回空比返回错更好。

---

## 11. 安全设计细节速查

| 设计 | 做法 | 为什么 |
| --- | --- | --- |
| 错误文案不细分 | 签名错 / 过期 / 缺字段统一"登录状态已失效" | 不给攻击者逐步试错的路标 |
| 令牌类型隔离 | `typ: access / refresh / mfa-pending` | 防长效令牌冒充访问凭证、防半成品令牌当正式令牌 |
| refresh 只存摘要 | Redis 存 SHA-256，原文只在 Cookie | 拖库也无法直接冒用 |
| refresh 放 HttpOnly Cookie | `httpOnly + secure(生产) + sameSite=lax` | 防 XSS 窃取，降低 CSRF 面 |
| 令牌旋转 | 每次刷新换新 refresh，旧令牌立即失效 | 令牌被盗后攻击者一旦使用即暴露 |
| Lua CAS | 单 key 原子比对与覆盖 | 消除并发刷新的 TOCTOU 竞态 |
| `jti` | refresh payload 加 UUID | 保证同一秒内两次签发也必然不同 |
| 主体以服务端为准 | `sup / tid` 取会话记录而非令牌 | 防止签发后身份变更、旧令牌按旧身份放行 |
| 会话三 key 成对维护 | session + refresh + user:sessions | 登出/强制下线一次删净，不留半状态 |
| 登录限流 | ThrottlerGuard 全局 + 认证端点单独额度 | 防暴力破解与验证码枚举 |

---

## 12. 常见问题（FAQ）

**Q1：access token 被偷了，攻击者能做什么？**

最多用 2 小时。如果用户/管理员在此期间登出或强制下线，攻击者的下一次请求就会 401（守卫查会话）。这是"短 TTL + 会话撤销"的组合效果。

**Q2：refresh token 被偷了怎么办？**

攻击者要能读到它，通常意味着已经突破 HttpOnly Cookie 的防护（如服务端漏洞、恶意扩展）。即便如此：每次刷新都会轮换，一旦攻击者和合法客户端同时刷新，CAS 只会让一方成功，另一方拿到 401——重放检测生效。用户可主动登出/强制下线使其立即失效。

**Q3：前端需要保存 refresh token 吗？**

不需要，也拿不到。它是 HttpOnly Cookie，刷新时浏览器自动携带。前端只需要持有 access token，并保留一个"刷新失败 → 回登录页"的分支。

**Q4：为什么刷新接口是 `@Public()`？**

因为它不走 access token，而是靠 Cookie 里的 refresh token 自证。`AuthService.refresh()` 内部完成验签、会话校验与 CAS，安全边界在 Service 层而不在守卫。

**Q5：多标签页同时刷新会互相踢掉吗？**

不会互相"踢掉"，但只有一个能成功。并发刷新时 Lua CAS 保证仅先到者成功，后到者 401。前端通常应在多个标签页间共享刷新结果（如用 BroadcastChannel / 单例刷新锁），避免下一个标签页白白失败一次。

**Q6：为什么 `user:sessions` 里的 sid 可能指向已不存在的会话？**

Set 成员没有独立 TTL，依赖集合整体 TTL。读取（`listSessions`）时会逐个校验会话记录并顺带 `SREM` 清理脏成员。这是"读时修复"而非"写时强一致"的取舍。

**Q7：JWT 密钥怎么配置？**

`JWT_SECRET` 是必填环境变量（`env.validation.ts` 中 `required()`），没有默认值兜底生产环境。开发默认配置里有一个占位值，部署时必须覆盖。单一 secret 同时用于签发 access 与 refresh，依靠 `typ` 区分类型。

**Q8：为什么不用 `passport-jwt`？**

ADR-007 明确选择单一 JWT 机制、不引入 passport，避免额外传递依赖，也让校验顺序（验签 → typ → 会话）在一处可读、可审计。

---

## 附：涉及文件索引

| 文件 | 职责 |
| --- | --- |
| `apps/admin-api/src/common/guards/jwt-auth.guard.ts` | 全局 JWT 守卫：验签、typ 校验、会话查询、降级放行 |
| `apps/admin-api/src/common/guards/permission.guard.ts` | 权限码守卫，排在 JWT 守卫之后 |
| `apps/admin-api/src/modules/auth/auth.service.ts` | 登录 / MFA 二步 / 刷新 / 登出 / 资料，令牌签发 |
| `apps/admin-api/src/modules/auth/auth.controller.ts` | 认证端点、refresh Cookie 读写 |
| `apps/admin-api/src/shared/auth/session.service.ts` | Redis 会话：建立、查询、滑动、CAS 轮换、删除、列表 |
| `apps/admin-api/src/shared/auth/auth-core.module.ts` | `JwtModule` 统一注册（单一 secret + 默认 access 有效期） |
| `apps/admin-api/src/shared/auth/auth.types.ts` | 令牌载荷、`AuthPrincipal`、`SessionRecord` 等类型 |
| `apps/admin-api/src/shared/auth/auth.constants.ts` | `TOKEN_TYPE`、Cookie 名称、MFA 待验 TTL |
| `apps/admin-api/src/shared/auth/auth.errors.ts` | 认证错误码（`10A08` / `10A09` / `10A11` / `10B01` 等） |
| `apps/admin-api/src/shared/caching/cache.constants.ts` | `CacheKeys`：session / refresh / user:sessions 等 key 工厂 |
| `packages/node/redis/src/hash-token.ts` | `hashCacheToken`：SHA-256 摘要 |
| `apps/admin-api/src/config/config.default.ts` | JWT 默认有效期（2h / 7d）与 secret |
| `docs/architecture/decisions/ADR-007-authentication-security-strategy.md` | 设计依据（D1 双令牌、D2 多端登录、D5 Lua CAS 旋转） |
