# ADR-003：以共享包 `@fedstack/redis` 统一缓存基础设施

- 状态：已采纳（2026-10-15；2026-10-19 修订，见 §7）
- 日期：2026-10-15（修订 2026-10-19）
- 影响范围：`packages/redis`（新增）、`apps/admin-api`、根 `eslint.config.js`、`apps/admin-api` 实时推送（P3a，见 `ADR-013`）；后续 `apps/api` 接入时零新增基础设施代码
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-002`（缓存拓扑）、`apps/admin-api/src/shared/caching/README.md`

---

## 1. 背景（事实依据）

- 缓存基础设施此前位于 `apps/admin-api/src/shared/caching/`：连接工厂（Keyv + `@keyv/redis`）、`CacheService` 降级封装、`KeyPrefixer`、Hash/ZSet/分布式锁直连服务、`withRedis` 降级入口、健康检查（证据：迁移前目录与 `ADR-002`）。
- 目录内同时混有**应用层业务**：`LoginAttemptService`（5 次 / 15 分钟的账号锁定策略）与 `CacheKeys`（auth 业务 key 工厂，文件自述「应用层业务 key，非基础设施」）。
- `cache.module.ts` 硬依赖 `@/config/config.module` 与 `getConfig`，是抽包的唯一真实耦合点（证据：迁移前 `cache.module.ts` 的 import）。
- Monorepo 共享包模式已被 `@fedstack/database` 建立并验证（证据：`ADR-001`、`apps/api/package.json` 已依赖 `workspace:*`）。
- `apps/api`（C 端 API）确定将使用 Redis（缓存 / 限流 / 会话等底座场景），多 app 共享同一 Redis 实例时 **keyPrefix 是唯一隔离手段**。
- 迁移前全仓 grep 确认：`caching/` 目录外仅 `app.module.ts` 引用缓存模块；`withTimeout`（`shared/utils/promise.ts`）仅被 `cache.health.ts` 使用。

## 2. 问题

缓存基础设施留在单个 app 内，第二个消费者出现时必然复制实现。连接纪律（双层 error handler 防进程崩溃、`disableOfflineQueue` 防请求挂死、单 key 约束、降级口径）一旦双份漂移，即为生产事故级风险。如何在「不过度抽象」的前提下让基础设施单一实现、业务策略各自保留？

## 3. 决策（最终）

- **D1 基础设施收敛为 `packages/redis`（`@fedstack/redis`）**：连接工厂、`CacheService`、`KeyPrefixer`、Hash/ZSet/分布式锁服务、`withRedis`、健康检查、`REDIS_CLIENT` 令牌、`withTimeout`、`hashCacheToken` 进包；**业务策略与业务 key 不进包**。
- **D2 配置注入式（`forRootAsync`），包不读环境变量**：与 `ADR-001 D6` 同一哲学。包导出 `RedisModuleOptions` 契约，由各 app 配置层解析 env 后注入；包内不做 joi / env 校验。
- **D3 `keyPrefix` 必填、无默认值、启动期 fail-fast**：`validateRedisModuleOptions` 在模块装配时校验 `keyPrefix` 非空、`defaultTtl` 非负，配置错误让进程起不来，而不是带着撞 key 风险上线。包刻意不提供默认前缀，防止两个 app 静默共用命名空间。
- **D4 各 app 的默认前缀与 app 同名**：`admin-api` 的 `REDIS_KEY_PREFIX` 默认值由旧项目名 `my-first-nest` 改为 `admin-api`（`config.default.ts` 与 `env.validation.ts` 同步）。
- **D5 应用层保留业务模块**：`apps/admin-api/src/shared/caching/` 保留 `CachingModule`（新）、`LoginAttemptService`、`cache.constants.ts`，依赖包的导出物（`REDIS_CLIENT` + `KeyPrefixer` + `withRedis` + `hashCacheToken`），自身零连接逻辑。
- **D6 连接工厂为纯函数**：`createCacheStores(options)` 独立于 NestJS DI，连接纪律可被单测锁定（namespace / separator / `disableOfflineQueue` / 内存降级分支）。
- **D7 依赖布局**：`@nestjs/*`、`@keyv/redis`、`keyv`、`cache-manager`、`reflect-metadata`、`rxjs` 声明为 `peerDependencies`（保证宿主单实例，`instanceof KeyvRedis` 判定不失效），开发期经 `devDependencies` + catalog 装配。
- **D8 Lint 分层**：包自带 `eslint.config.js`（共享 `node()` 配置，关闭 `ts/consistent-type-imports` 防 DI 令牌被擦除），根 `eslint.config.js` 将其排除——与 apps 的「自带配置 + turbo 触发」模式同构；代码风格遵循 packages 既有标准（带分号、`packages/database` 先例）。

## 4. 备选方案与取舍

- **A. 基础设施留在 admin-api，api 需要时再复制（否决）**：连接纪律双份漂移即为事故源；且与已建立的 `@fedstack/database` 模式相悖。
- **B. 整个 caching 目录原样搬入包（否决）**：`LoginAttemptService` 的阈值（5 次 / 15 分钟）与 `CacheKeys` 的 auth key 是 admin-api 业务决策，进包会污染所有消费方并固化边界错误的依赖方向。
- **C. 等 api 出现真实 Redis 需求再抽（否决）**：模块刚按 `ADR-002` 稳定、边界已收敛，当前上下文最完整、迁移成本最低；等需求火烧眉毛时在时间压力下做架构变更质量风险更高。包接口（`RedisModuleOptions`）足够小，无第二个消费者验证的设计风险可控。
- **D. 包内保留 `@nestjs/config` 依赖并自读 env（否决）**：把某个 app 的环境约定固化进共享层，违反 `ADR-001 D6` 已确立的环境契约边界。

## 5. 后果

**正面**

- 连接纪律单一实现，`api` 后续接入只需 `RedisCacheModule.forRootAsync` 一处接线。
- 集群改造点（`ADR-002 D4`）随包收敛，所有 app 同时受益。
- `keyPrefix` 隔离纪律由包契约强制（必填 + fail-fast），而非靠各 app 自觉。

**负面 / 风险**

- `useFactory` 被调用两次（cache-manager 装配与模块选项各一次），契约要求幂等（已在 `RedisModuleAsyncOptions` 注释成文；配置读取天然满足）。
- 旧前缀 `my-first-nest` 下的既有缓存 key 在默认值变更后不再被命中（前缀即命名空间）：缓存可重建、登录计数器 15 分钟 TTL 自然过期，影响可接受；已部署环境如需保留旧前缀可显式设置 `REDIS_KEY_PREFIX=my-first-nest`。
- `useFactory` 入参与 `inject` 的类型关联在 TS 层面无法表达（NestJS 异步模块通病），签名退化为 `any[]`，依赖 `validateRedisModuleOptions` 运行时兜底。

## 6. 验证（2026-10-15 实测）

| 校验             | 命令                                                | 结果                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依赖安装         | `pnpm install --no-frozen-lockfile`                 | 通过，workspace 链接建立                                                                                                                                                                                                   |
| 包构建 / 类型    | `pnpm --filter @fedstack/redis build` / `typecheck` | 通过                                                                                                                                                                                                                       |
| 包测试           | `pnpm --filter @fedstack/redis test`                | 10/10 通过（URL 拼装、配置 fail-fast、store 工厂内存 / Redis / `disableOfflineQueue` 三分支）                                                                                                                              |
| 包 lint          | `pnpm --filter @fedstack/redis lint`                | 0 问题                                                                                                                                                                                                                     |
| 全量类型 / 构建  | `pnpm typecheck` / `pnpm build`                     | 6/6、4/4 通过（首次并发触发 `prisma generate` EEXIST 为 ADR-001 遗留的既有问题，重跑通过）                                                                                                                                 |
| 全量测试         | `pnpm test`                                         | 5/5 通过（含本次补齐的 `env.validation.spec.ts` 3 用例——该文件在 HEAD 中为 0 字节空文件，属 ADR-001 §8 遗留，本次在改动域内一并修复）                                                                                      |
| Lint（改动文件） | `eslint`（admin-api 本次全部修改 / 新建文件）       | 0 问题                                                                                                                                                                                                                     |
| Lint（基线）     | `eslint .` / `turbo run lint`                       | 既有基线未变：root 60 个错误全部落既有文件（ADR-001 §8 同源）；`api` 52 个 `style/semi`（既有）；`admin-api` 既有错误含 README 2 个 parsing error（经 HEAD 版本对照确认为既有代码片段）；**本次新增 / 修改文件零新增问题** |

---

## 7. 修订（2026-10-19）：PubSubService 连接分层纪律并入包

- 触发：P3a 引入实时推送（SSE），需要跨实例 pub/sub（证据：`ADR-013` D5/D6）。
- 事实：Redis 连接一旦进入 subscribe 模式便**不能再执行普通命令**；`admin-api` 现有 4 处直连 `REDIS_CLIENT`（证据：`ADR-003 §1` 同期调研），若订阅复用该共享 client，会阻塞同一连接上的其它命令。
- 决策（**D9**）：`packages/redis` 新增 `PubSubService`——**发布复用共享 client，订阅使用独占连接**；独立连接的创建/释放、`disableOfflineQueue`、错误处理与降级口径沿用 `D6` 的连接纪律并进包；**频道命名等业务语义不进包**（与 `KeyPrefixer` 的 keyPrefix 纪律同构）。
- `D1`–`D8` 不变；`D9` 的验证待 P3a 实施后按 `ADR-013 §6` 校验项补。
