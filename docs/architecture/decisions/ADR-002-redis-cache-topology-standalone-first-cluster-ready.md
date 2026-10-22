# ADR-002：Redis 缓存拓扑——单机先行、集群就绪

- 状态：已采纳（2026-10-15）
- 日期：2026-10-15
- 影响范围：原 `apps/admin-api/src/shared/caching/`，2026-10-15 起经 ADR-003 迁移至 `packages/redis`（业务文件除外）
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`apps/admin-api/src/shared/caching/README.md`

> **2026-10-15 迁移注记（ADR-003）**：本 ADR 中的 `cache.module.ts`、`cache.service.ts`、`hash-cache.service.ts` 等通用基础设施已迁入 `packages/redis/src/`（同名文件），D2 失效扫描、D3 单 key 约束、D4 集群改造点随之收敛到包内；`login-attempt.service.ts` 与 `cache.constants.ts` 作为 admin-api 业务留在原目录。本 ADR 全部决策对包继续有效。

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。

---

## 1. 背景（事实依据）

- 缓存模块当前只接一个 Redis 实例：`cache.module.ts` 经 URL 直连构造 `KeyvRedis`（`@keyv/redis@5.1.6`），底层为 `@redis/client@5.12.1` 单机 client。
- `@redis/client` v5 的集群 API 实测：`RedisCluster.masters` 是 **getter 返回 `MasterNode[]` 数组**（不是 Map），每个 `MasterNode.client` 为该节点的独立 `RedisClientType` 连接（证据：`@redis/client@5.12.1` 的 `dist/lib/cluster/index.d.ts`、`cluster-slots.d.ts`）。
- `KeyvRedis` 构造签名接受连接串或既有 client/cluster 实例，集群接入不需要更换缓存抽象层（证据：`@keyv/redis` README）。
- 模块内现存的 Redis 原子操作全部为**单 key**：登录计数 `INCR+EXPIRE` Lua、锁释放 `GET+DEL` Lua、`hmset` 的 `MULTI(HSET+EXPIRE)`（证据：`login-attempt.service.ts`、`redis-lock.service.ts`、`hash-cache.service.ts`）。
- Hash Tag 多键归槽约定已在 `hash-cache.service.ts` 类级注释成文。
- 曾存在的 `rotateRefreshToken` 双 key Lua（跨 key `DEL`+`SET`）在集群下必须 Hash Tag 才能执行，该方法已随业务解耦移除；将来 auth 模块重新实现令牌轮换时受 D3 约束。

## 2. 问题

当前按单机 Redis 部署，但企业级演进可能转向集群（容量 / 高可用）。如何在「不接集群时零负担」与「切集群时不改写业务代码」之间取舍？

## 3. 决策（最终）

- **D1 当前拓扑：单实例**。`REDIS_URL` / `REDIS_HOST` 直连，不引入 Sentinel / Cluster 配置。
- **D2 失效扫描拓扑无关**：`CacheService.invalidatePattern` 自动检测底层 client 形态——单机对唯一节点 `SCAN + DELETE`；集群并行逐 master `SCAN + DELETE`，单节点失败降级为 warn 不阻塞其余。检测基于 v5 真实 API（`masters` 数组 + `MasterNode.client`），不依赖任何"当前一定是单机"的隐含假设。
- **D3 多键原子操作只允许单 key**：一切 Lua 脚本 / `MULTI` 事务必须只涉及一个 key（集群下天然 slot-safe）。确需跨 key 原子操作时，必须用 `{业务域:业务id}` Hash Tag 把 key 归入同一 slot（约定见 `hash-cache.service.ts` 类级注释），并在 code review 中显式核查。
- **D4 集群接入路径（预留，不实现）**：将来切集群时的改造点固定为——
  1. 配置层新增 `REDIS_CLUSTER_NODES`（逗号分隔 host:port 列表）；
  2. `cache.module.ts` 工厂分支：`createCluster({ rootNodes })` 创建集群 client，传入 `new KeyvRedis(cluster, { namespace, keyPrefixSeparator })`；
  3. `disableOfflineQueue` 的单机断言（`cache.module.ts` 已注释标记）需改为 cluster 的 `nodeOptions` 形态；
  4. 启动期 `PING` 在集群上只覆盖单节点，健康检查需按需扩展为逐 master；
  5. `KeyPrefixer` / `CacheService.invalidatePattern` / 各直连 client 服务**无需改动**（前缀口径从 store 实例派生、扫描拓扑无关，均已就绪）。
- **D5 不提前实现集群配置**：当前无真实集群环境可验证，按 `AGENTS.md` 最小安全变更原则不引入未验证代码；本 ADR 的 D4 清单即为接入时的实施索引。

## 4. 备选方案与取舍

- **A. 现在就实现完整集群配置（否决）**：无集群环境可验证，属于投机抽象；配置、Joi 校验、连接工厂分支全是无测试覆盖的 speculative 代码。
- **B. 完全不考虑集群，切换时再改（否决）**：`invalidatePattern` 若按单机实现，切集群后只对单节点 SCAN，大部分 key 删不掉且**无任何报错**——静默正确性事故，比性能问题更危险。
- **C. 沿用旧的 `masters instanceof Map` 检测（否决）**：与 v5 真实 API 不符（`masters` 是数组），检测恒为 false，等于没有集群分支。

## 5. 后果

**正面**

- 切换集群时业务代码与缓存封装零改动，改造点收敛在 `cache.module.ts` 连接工厂一处（D4 清单）。
- 单 key 约束（D3）消除了集群下最常见的 `CROSSSLOT` 事故类别。

**负面 / 风险**

- 集群分支（D2）当前无真实环境验证，属"按 API 契约编写的未运行代码"；接入集群时必须补集成测试（残留风险，记入 D4-5）。
- D3 是约定而非编译期强制，依赖 code review 把关。

## 6. 验证

- `pnpm typecheck`、`pnpm build`、`eslint`（caching 目录）通过（2026-10-15 实测）。
- 集群分支行为验证 deferred 至集群环境就绪后（见 D5）。
