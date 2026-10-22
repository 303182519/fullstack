# ADR-004：以共享包 `@fedstack/health` 统一健康检查底座

- 状态：已采纳（2026-10-15）
- 日期：2026-10-15
- 影响范围：`packages/health`（新增）、`packages/redis`、`apps/admin-api`、`apps/api`、根 `eslint.config.js`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-003`（缓存基础设施包）

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。

---

## 1. 背景（事实依据）

- 健康检查模块此前被从外部项目抽入 `apps/admin-api/src/shared/health/`，但**从未完成接线**：
  - `health.module.ts` 引用 `@/shared/caching/cache.module` 与 `@/shared/caching/cache.tokens`——两者已随 ADR-003 迁入 `@fedstack/redis`，**import 全部断裂**（证据：迁移后 `caching/` 目录仅存 `caching.module.ts` / `login-attempt.service.ts` / `cache.constants.ts`）。
  - `HealthModule` 未被 `app.module.ts` 注册，属死代码（证据：迁移前 `app.module.ts` 全文）。
  - 但周边设施已按「探针必将上线」预留：`ResponseInterceptor` 对 `/health`、`/health/ready` 的精确路径 bypass、`pino-logger.config.ts` 的 `HEALTH_PATHS` 访问日志过滤（证据：两文件现状）。
- `@fedstack/redis` 已含 terminus 无关的 `CacheHealthIndicator`（仅返 bool 的 `ping()`，供启动自检），但三态语义（up/degraded/down）只存在于 admin-api 断链代码的注释里，且未从模块导出（证据：ADR-003 迁移后 `redis.module.ts` exports 列表）。
- `apps/api` 确定需要探针（用户明确提出「api 也许也需要这个模块」），但其尚未接入 `RedisCacheModule`、`@nestjs/terminus`（证据：`apps/api/package.json`、`apps/api/src/app.module.ts`）。
- terminus 12 的关键行为（证据：`@nestjs/terminus@12.1.0` dist 源码）：
  - `HealthIndicatorSession` 支持 `up/down/degraded` 三态，degraded 整体 200；
  - `PrismaHealthIndicator.pingDb` **先调 `$runCommandRaw`**，仅当错误文案含 `Use the mongodb provider` 时回退 `$queryRawUnsafe('SELECT 1')`；
  - 就绪失败抛 `ServiceUnavailableException`（503），`HealthCheckError` 不从包入口导出。
- Prisma 7.9.1 SQL 客户端运行时定义了 `$runCommandRaw` 并抛出 `The mysql provider does not support $runCommandRaw. Use the mongodb provider.`（证据：`@prisma/client@7.9.1` runtime/client.js），与 terminus 12 回退条件**文案匹配**。

## 2. 问题

探针是编排层（k8s liveness/readinessProbe）与网关 ACL 消费的基础设施契约。留在单个 app 内（且处于断链死代码状态），第二个消费者出现时必然复制实现；三态语义、超时口径、探针路径纪律一旦双份漂移，即为「就绪探针误杀 / 假活」的生产事故级风险。如何让探针骨架单一实现、各 app 的就绪检查项（DB / 第三方依赖）各自装配？

## 3. 决策（最终）

- **D1 探针骨架收敛为 `packages/health`（`@fedstack/health`）**：双探针控制器（`GET /health` 存活 / `GET /health/ready` 就绪）、`RedisHealthIndicator`（terminus 适配）、`HealthModule.forRootAsync` 进包；**各 app 的就绪检查项不进包**，经 `forRootAsync({ inject, useFactory })` 显式装配（如 `() => db.pingCheck('database', prisma)`），与 ADR-001 D6 / ADR-003 D2 的「包不携带应用层依赖」同一哲学。
- **D2 Redis 三态口径收口在 `@fedstack/redis`**：`CacheHealthIndicator.check()` 返回 `CacheHealthStatus`（up/degraded/down），是唯一语义源；启动自检 `ping()` 委托 `check()`（degraded 可启动、down 判失败，行为不变）；`CacheHealthIndicator` 加入 `RedisCacheModule` exports（global 模块导出后即可跨模块注入）。
- **D3 `RedisHealthIndicator` 对 `CacheHealthIndicator` 标 `@Optional`**：未注册 `RedisCacheModule` 的 app（如当前的 api）cache 项 degraded 而非装配期报错——「未配置 ≠ 故障」；已注册但不可达仍是 down（503）。显式 `@Inject(CacheHealthIndicator)` 指定令牌（联合类型标注会被 TS 擦成 `Object` 元数据）。
- **D4 探针不进 `/api` 全局前缀**：消费方在 `setGlobalPrefix(..., { exclude: ['health', 'health/ready'] })` 声明。探针是基础设施契约，不属于版本化业务 API；同时让 `ResponseInterceptor` 既有的精确路径 bypass 与 pino `HEALTH_PATHS` 过滤自然生效，无需改动。
- **D5 503 明细透传**：`GlobalExceptionsFilter` 对探针路径的 `HttpException` 放行 terminus 原始响应体——编排层与 `kubectl describe` 依赖 `details` 定位是哪个依赖不可用；统一响应包装会抹掉该信息。未知异常仍走统一格式与 5xx 日志。
- **D6 不依赖 `@nestjs/swagger`**：探针是内部基础设施端点，刻意不进业务 API 文档；同时避免给未装 swagger 的消费方（api）强加依赖。
- **D7 依赖布局**：`@nestjs/*`、`reflect-metadata`、`rxjs` 声明 `peerDependencies`（同 ADR-003 D7 防双实例）；`@fedstack/redis` 用 `workspace:*` 常规依赖（workspace 符号链接保证单实例，DI 令牌同一性由仓库布局保证）。
- **D8 Lint 分层**：同 ADR-003 D8——包自带 `eslint.config.js`（`node()` 配置），根 `eslint.config.js` 将其排除；代码风格遵循 packages 既有标准（带分号）。

## 4. 备选方案与取舍

- **A. 留在 admin-api 修复 import 了事（否决）**：api 需求已在视野内；三态口径双份漂移即事故源，与 ADR-003 已确立的模式相悖。
- **B. 包内置 DB 检查（否决）**：包不认识各 app 的 `PrismaService`；把 `@fedstack/database` 耦进健康包会强迫不使用 Prisma 的消费方安装它。
- **C. Redis 检查也做成可选装配项（否决）**：底座纪律是「凡接入 Redis 必查就绪」，内置 + `@Optional` 降级既统一口径，又不阻塞未接入的 app 先行上线探针。
- **D. 探针保留在 `/api` 前缀下（否决）**：版本化业务前缀与基础设施探针语义不同；`ResponseInterceptor` 预留的精确匹配 `'/health'` 已暴露原设计口径；且模块从未上线，无 URL 兼容负担。

## 5. 后果

**正面**

- 探针骨架单一实现；api 已接线（DB-only，cache 项 degraded），接入 `@fedstack/redis` 后自动升级为真实三态检查，零骨架改动。
- 启动自检（`RedisCacheModule.onApplicationBootstrap`）与就绪探针共用同一三态口径（D2），杜绝「启动认为可用、就绪认为挂」的口径分裂。
- 探针契约成文：`packages/health/README.md`（接线示例 + Nginx 内网 ACL 示例，迁移自 admin-api 旧 readme 并按 D4 口径更新路径）。

**负面 / 风险**

- terminus 12 对 SQL Prisma 客户端的就绪检查每次先产生一次客户端侧 `$runCommandRaw` 校验异常再回退 `SELECT 1`（多一次无 IO 的异常往返）。已核实 Prisma 7.9.1 文案匹配，并以集成测试锁定回退路径（`$queryRawUnsafe` 被以 `SELECT 1` 调用）；Prisma 若未来改动该错误文案，database 项会误报 down——升级 Prisma 或 terminus 时需重跑本包集成测试确认。
- `useFactory` 入参与 `inject` 的类型关联在 TS 层面无法表达（NestJS 异步模块通病，同 ADR-003 §5），签名退化为 `any[]`。
- 探针 URL 由旧 readme 设想的 `/api/health` 变为 `/health`：模块此前从未上线，无兼容负担；网关 ACL 须以新路径配置（README 已更新）。
- 未执行依赖真实 DB / Redis 的 e2e（需环境变量与基础设施）；DI 装配正确性由本包集成 spec 三分支覆盖（无 Redis 模块 degraded / up / down→503），剩余风险为应用层装配笔误，由 typecheck + 上述集成测试的形态约束兜底。

## 6. 验证（2026-10-15 实测）

| 校验               | 命令                                          | 结果                                                                                       |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 依赖安装           | `pnpm install --no-frozen-lockfile`           | 通过，workspace 链接建立，无新包下载                                                       |
| redis 包构建/测试  | `pnpm --filter @fedstack/redis build / test`  | 通过；17/17（含新增 `cache.health.spec.ts` 7 用例：三态映射、connect 分支、ping 启动语义） |
| redis 包 lint      | `pnpm --filter @fedstack/redis lint`          | 0 问题                                                                                     |
| health 包构建/测试 | `pnpm --filter @fedstack/health build / test` | 通过；7/7（指标三态映射 4 用例 + 模块装配集成 3 用例）                                     |
| health 包 lint     | `pnpm --filter @fedstack/health lint`         | 0 问题                                                                                     |
| 全量类型           | `pnpm typecheck`                              | 8/8 通过                                                                                   |
| 全量构建           | `pnpm build`                                  | 5/5 通过                                                                                   |
| 全量测试           | `pnpm test`                                   | 7/7 通过                                                                                   |
| Lint（改动文件）   | `eslint`（admin-api / api 本次全部修改文件）  | 0 问题；既有基线（root / api / admin-api 存量错误）未触碰                                  |
