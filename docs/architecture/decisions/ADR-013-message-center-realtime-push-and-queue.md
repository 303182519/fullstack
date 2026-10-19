# ADR-013：消息中心、实时推送与队列引入

- 状态：已采纳（2026-10-19，P3a/P3b 设计定稿；实施后补验证）
- 日期：2026-10-19
- 影响范围：`packages/redis`（新增 `PubSubService`，修订 `ADR-003`）、`apps/admin-api/src/modules/message/`（新增）、`apps/admin-api/src/modules/notice/`（新增）、`apps/admin-api/src/modules/realtime/`（新增）、`apps/admin-api/src/modules/mfa/`（新增）、`apps/admin-api/src/modules/auth/`（登录二步改造）、`apps/admin-api/src/shared/audit/`（改队列投递）、`packages/database/prisma/schema.prisma`（新增 `SysUserMessage` / `SysNotice` / `SysMessageTemplate` / `SysMessageSendLog` / `SysUserMfa`）、`packages/auth-core`（新增权限码）
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-003`（共享缓存基础设施）、`ADR-007`（认证与会话）、`ADR-009`（遮蔽语义与审计）、`ADR-010`（权限码注册表）、`ADR-012`（文件存储）；路线图 `docs/plans/nest-admin-soybean-migration.md` §6

---

## 1. 背景（事实依据）

- 上游 `linlingqin77/Nest-Admin-Soybean@83a83f7` 的消息能力为**模拟实现**：短信/邮件 SDK 全部是 mock（不发真实请求），`sys_sms_*` / `sys_mail_*` 表**无 `tenant_id`**；站内信是**纯拉取**（无实时推送）；MFA **无表、未接入登录流程**（证据：P3 调研基线 commit `83a83f7` 全量源码核对）。
- 上游 `sys_client` 是 RuoYi 风格的 OAuth 客户端注册表，本仓库**无任何鉴权消费方**，P3 **不做**。
- 本仓库已有 `@fedstack/redis`（`ADR-003`）收敛连接纪律，公开出口只含缓存/锁/健康检查（证据：`packages/redis/src/index.ts` 导出清单）——**当前无 pub/sub 能力**，实时推送所需的订阅连接纪律尚无归属。
- 审计日志当前是 **fire-and-forget 直接落库、无背压**：落库失败仅 warn 吞掉（证据：`apps/admin-api/src/shared/audit/oper-log.service.ts` 类注释与 `append()` 实现），该风险已被 `ADR-009` §4 风险表登记为「P4 若引入队列再评估」。
- `ADR-009` D2 已确立「平台级 + 租户级」的遮蔽语义与实现（含缓存纪律），可直接复用于消息模板。
- 认证侧已有会话与令牌体系（`ADR-007`），`AuthPrincipal` 携带 `tenantId`（证据：`ADR-005` §1）。
- Redis **不作为权威数据源**（`AGENTS.md` §14）；MySQL 为权威持久化（§13）。限流已用 Redis 承载计数（限流模块约定），说明 Redis 在本仓库承担「可重建的运行时状态」角色。

## 2. 问题

P3 需要回答：

1. 站内信 / 邮件 / 短信三种投递途径如何统一编排，同时保持「加一个通道不改核心」？
2. 「公告」与「站内信」的语义差异是什么？平台级公告与租户级公告如何共存？（是否复用遮蔽语义？）
3. 实时推送如何跨实例分发，且**不把访问令牌放进 URL**（SSE 的 `EventSource` 无法自定义请求头）？
4. 什么时候值得引入队列？它承载什么，不承载什么？
5. MFA 如何在**不破坏既有登录流程契约**的前提下插入第二步，密钥与恢复码如何安全存储？

## 3. 决策（最终）

### D1 收敛 `MessageCenter`：`MessageProvider` 接口 + 编排层

- 定义 `MessageProvider` 接口（`send(...)`），三个实现：站内信（`InnerMessageProvider`）、邮件（`EmailMessageProvider`）、短信（`SmsMessageProvider`）。
- `MessageCenter` 负责：模板解析（变量替换）→ 通道选择 → 投递 → 写 `SysMessageSendLog`。加通道 = 加一个 provider，核心编排不变。
- **P3a 只落站内信 provider**（无模板化，内容由投递方直接给出）；邮件/短信 provider 与模板化在 **P3b** 落地。

### D2 站内信 = 定向（有已读），公告 = 广播（无已读）

- **站内信** `SysUserMessage`：归属到**单个用户**，有 `readAt` 表达逐用户已读；来源 = 内部投递 API（其他后端模块调用）+ 自助读取端点。
- **公告** `SysNotice`：**广播**型，**不建逐用户已读记录**（广播记录 × 用户数会产生天文级行数）；支持平台级（`tenantId IS NULL`）。
- 已读状态只存 `readAt`（`DateTime?`），**不另设 `read` 布尔列**——`read = readAt != null`，避免两个字段互相矛盾。

### D3 公告两级**并列合并**，与「遮蔽」是两种不同语义（术语必须区分）

- 消费端可见公告 = **平台级公告 + 本租户公告，两级并列合并展示**（都可见）。
- 这与 `ADR-009` D2 的**遮蔽（shadowing）**不同：遮蔽是「租户一旦接管某键，平台级定义整体不参与」；公告是「两级并存、都参与」。
- 该区分必须在 `GLOSSARY.md` 中明确成文（「通知公告」条目的定义里点明「非遮蔽」），防止后续实现者按遮蔽实现出「租户发过公告就看不到平台公告」的错。

### D4 消息模板（P3b）：平台级 + 租户级覆盖，**复用遮蔽语义**

- `SysMessageTemplate` 的 `tenantId` 可空（`null` = 平台级标准模板）；租户对同 `(templateKey, channel)` 建立自有模板后**整体遮蔽**平台级，判定/缓存/失效纪律**完全复用 `ADR-009` D2/D4**，不另造机制。

### D5 实时推送：SSE + `fetch` 消费，跨实例走 Redis pub/sub

- 传输选 **SSE（`text/event-stream`）**，端点如 `GET /api/realtime/stream`。
- 消费端用 **`fetch` + 流读取**（而非浏览器 `EventSource`）：`EventSource` 不能自定义请求头，而本项目要求 `Authorization` 头传令牌——**令牌绝不进 URL / query**（URL 会进访问日志、Referer、浏览器历史）。
- 推送是 **best-effort**：DB（`SysUserMessage` / `SysNotice`）是权威真相源，实时推送只是「更快看到」；客户端断线重连后以拉取接口对齐（未读数以 DB 为准）。Redis 故障时推送静默降级，**不影响站内信落库**。

### D6 连接分层纪律并入 `@fedstack/redis`（修订 ADR-003）

- 在 `packages/redis` 新增 `PubSubService`：**发布复用共享 client，订阅使用独占连接**（Redis 进入 subscribe 模式后不能再执行普通命令，混用会阻塞其它调用）。
- 边界与 `ADR-003` D1 一致：包内只放**连接纪律与封装**，**频道命名等业务语义留给各 app**（同 `KeyPrefixer` 的 keyPrefix 纪律）。
- 频道（app 侧，`{ns}` 为 keyPrefix）：`{ns}rt:user:{userId}`（定向推送）、`{ns}rt:notice:{tenantId|platform}`（公告广播）；实例按**本地实际存在的 SSE 连接**动态订阅 / 退订，不订阅全局模式。

### D7 队列（P3b）：引入 BullMQ，承载外部 IO 与审计背压

- 引入 `bullmq` + `@nestjs/bullmq`（Redis 承载）。**用途**：① 邮件 / 短信投递（外部网络 IO，必须可重试，不能在请求链路里同步等待）；② 审计日志落库（结清 `ADR-009` §4「fire-and-forget 无背压」待评估项）；③ 文件物理删除补偿（`ADR-012` D6 待办）。
- **队列不承载权威数据**：`SysMessageSendLog` / `SysOperLog` / `SysFile` 均落 MySQL；Redis 里的是**可重放 / 可丢弃的待办任务**。因此 Redis 重启导致任务丢失的后果是「投递未发生 / 日志缺失」，而非「业务数据不一致」——MySQL 侧仍是唯一真相源。
- P4 定时任务（`@nestjs/schedule` + Bull）**复用同一队列底座**，不重复引入第二套。

### D8 MFA：仅 TOTP + 一次性恢复码；二步登录用 pending token

- 因子只做 **TOTP**（`otpauth`）+ **一次性恢复码**；不做 WebAuthn / 短信验证码因子。
- **登录二步改造**：密码校验通过后，若该用户已启用 MFA，**不签发正式会话**，而是返回 **pending token**（短 TTL、Redis 存储、一次性消费）；第二因子校验通过后才走既有「签发 access + refresh + 建会话」路径。这样**既有登录契约只在「启用 MFA 的用户」这一分支上改变**，未启用 MFA 的用户零变化。
- **策略不做表**：走参数配置（`SysConfig`，平台级 + 租户级遮蔽，默认「可选」），复用 `ADR-009` 全套判定。
- **secret 加密**：AES-256-GCM（`node:crypto`，**零新依赖**），密钥走 env（`MFA_SECRET_ENC_KEY`）；不引入加密库。
- **恢复码不存明文**：高熵随机码用 SHA-256 摘要 + `usedAt` 存 `Json` 数组（用 argon2 会在每次校验时付出 10 次哈希代价，且恢复码本身熵足够高，无需慢哈希）。
- 自助端点（绑定 / 校验 / 解绑 / 重置恢复码）**仅需认证**，不挂权限码——MFA 是账号自身的凭证，不是管理资源。

### D9 权限与审计口径（沿用 ADR-009）

- 管理端点（公告管理、模板管理、投递记录查询）挂 `@RequirePermission`（新码注册进 `@fedstack/auth-core`，**seed 同步 import 注册表**，不得二次硬编码——`ADR-010` 的教训）。
- 自助端点（站内信读 / 标记已读 / 删除、MFA 自助）**仅需认证 + 租户作用域**。
- 写端点挂 `@OperLog`；高频读（未读数轮询、SSE 建立）**不挂**审计。

### D10 依赖清单（新增 / 不引）

- 新增：`nodemailer`（+ `@types/nodemailer`）、`otpauth`、`bullmq`、`@nestjs/bullmq`。
- **不引**：`qrcode`（后端只回 otpauth URI，二维码由前端生成）、短信服务商 SDK（服务商未定，先用 `MessageProvider` 接口占位）。
- **零新依赖**：SSE 走 Nest 原生 `@Sse` + `rxjs`；AES-256-GCM 走 `node:crypto`。
- 服务商配置（SMTP、短信 AK）**不建表**：走 env（同 `ADR-012` D2 的凭据纪律）。

## 4. 备选方案与取舍

- **A. WebSocket 替代 SSE**：否决——推送是**服务端单向**的，SSE 天然是 HTTP（复用既有鉴权守卫、全局前缀、异常过滤器），且零新依赖；WebSocket 需额外网关与握手鉴权。
- **B. `EventSource` + query 传令牌**：否决——令牌进 URL 会滞留于访问日志 / 浏览器历史 / 代理日志，违背 `AGENTS.md` §15 的凭据纪律。
- **C. 引入独立消息中间件（Kafka / RabbitMQ）**：否决——当前只有「投递重试 + 审计背压 + 删除补偿」三类需求，Redis 已在基础设施内，引入第二套中间件的运维与一致性成本远超收益。
- **D. 公告复用遮蔽语义（租户发过就不再展示平台公告）**：否决——公告是「广播通知」，平台公告通常是必须触达的全站规则（如维护通知），被租户一条公告遮蔽即失效；且与公告「并列合并」的直觉语义相悖。
- **E. 首期不引入队列，继续同步投递**：否决——邮件/短信是外部 IO，同步投递会把第三方超时转嫁为登录/业务请求的时延；审计背压问题已被 `ADR-009` 显式登记。
- **F. 公告建逐用户已读记录**：否决——广播语义下会产生「用户数 × 公告数」量级的行，且已读对广播公告无业务意义。
- **G. MFA 策略建独立策略表**：否决——平台/租户两级 + 遮蔽的判定机制已由 `ADR-009` 完整提供，另建表等于复制一套判定。
- **H. 恢复码用 argon2 哈希**：否决——校验一次要遍历 10 条慢哈希，登录路径成本不可接受；随机恢复码熵已足够。

## 5. 后果

**正面**

- 新增通道零改动核心编排；新增消息类型零改动 `MessageCenter`。
- 实时推送不引入新协议栈，鉴权与审计链路与既有 HTTP 完全一致。
- 令牌不进 URL；Redis 故障只损失「实时性」，不损失「消息本身」（DB 权威）。
- 审计背压问题在 P3b 得到结构性解决，队列底座被 P4 复用。
- MFA 对未启用用户零侵入；密钥/恢复码都不落地明文。

**负面 / 风险**

- **SSE 连接是长连接**：每实例的连接数、心跳、超时、反向代理缓冲（Nginx `proxy_buffering off`）都需显式配置，否则推送静默失效。
- **订阅连接占用**：Redis 的 pub/sub 连接不能复用于普通命令，每实例至少一条独占连接；连接数与实例数线性增长，需在连接池预算内核算。
- **BullMQ 依赖 Redis 持久化策略**：Redis 未开 AOF/RDB 时重启会丢任务；本 ADR 已把它限定为「可丢弃任务」，但**补偿类任务（对象删除）丢失会导致孤儿对象残留**，需巡检兜底。
- `pending token` 引入登录流程的**中间状态**：TTL、一次性消费、并发重放都要显式处理，否则会留下「pending 换正式会话」的重放窗口。
- 公告「并列合并」与「遮蔽」并存于同一仓库，是最容易被后续实现者混淆的一对概念（D3 已要求写入 `GLOSSARY.md` 作为防线）。
- 上游 mock 实现**不可复用**，通道实现需从零写，P3b 工作量集中在邮件/短信 provider 与队列编排。

## 6. 验证（P3a/P3b 实施后补，计划校验项）

| 校验         | 方法                                                      | 预期                                                        |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| 站内信       | 内部投递 API 写入 → 自助列表 / 标记已读 / 删除            | 未读数以 DB 为准；已读状态持久                              |
| 公告合并     | 平台级公告 + 租户公告并存                                 | 两级**都可见**（验证「非遮蔽」）                            |
| 实时推送     | 两个实例、两个客户端；A 实例投递 → B 实例客户端收到       | 跨实例可达；Redis 停服时静默降级、消息仍落库                |
| 令牌位置     | 检查 SSE 请求与访问日志                                   | 令牌仅出现在 `Authorization` 头，URL/query 无令牌           |
| 模板遮蔽     | 租户建立同键模板后消费                                    | 整体取租户级（复用 `ADR-009` D2 断言口径）                  |
| 队列         | 邮件/短信走队列；审计日志走队列；Redis 重启后行为         | 可重试；丢任务表现为「投递未发生 / 日志缺失」，无数据不一致 |
| MFA 二步登录 | 未启用用户登录 / 启用用户登录 / 恢复码登录 / pending 重放 | 前者零变化；后者需第二因子；恢复码一次性；重放被拒          |
| MFA 存储     | 直查 `SysUserMfa.secretCipher` 与恢复码列                 | 无明文；密钥不出现在日志中                                  |
| 权限码同步   | 新码注册后执行 seed                                       | 菜单按钮与实际 `@RequirePermission` 一致（无二次硬编码）    |

</content>
