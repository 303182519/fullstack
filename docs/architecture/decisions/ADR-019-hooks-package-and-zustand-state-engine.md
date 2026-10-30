# ADR-019：@fedstack/hooks 落地与 Zustand 统一状态引擎

- 状态：已接受
- 日期：2026-10-30
- 影响范围：新增 `packages/web/hooks`（`@fedstack/hooks`）；`pnpm-lock.yaml`；状态归属约定（前端客户端状态引擎）

## 背景

需要把 `@skyroc/hooks` v1.1.0（`https://github.com/Ohh-889/skyroc/tree/master/packages/hooks`）迁移进本仓库，并符合本仓架构。

上游包包含两类资产：

1. 9 个浏览器 / React hooks（`useArray` / `useCaptcha` / `useCountDownTimer` / `useLoading` / `useNow` / `usePriorityQueue` / `useCopy` / `useSystemTheme`）。
2. 一套自研状态基础设施 `src/store`：`Store<S>` 类（`subscribe` + `getSnapshot` + `setState` + `patchState`）+ `useStore`（`useSyncExternalStore` + 可选 selector）。

核实 `Store` 源码后确认：它只是 Zustand vanilla core 的同构实现（同一套 `subscribe` / `getSnapshot` / `Object.is` 去重语义），不含持久化、不可变更新、浅比较等扩展能力。

本仓现状：Zustand 已在 catalog 固定 `^5.0.5`，`apps/admin/src/store/auth.ts` 与 `packages/web/admin/src/layouts/store/*` 均直接使用 `create()`；全仓无任何代码依赖自研 `Store` / `useStore` 形态。

## 决策

### D1 新增 `packages/web/hooks`，包名 `@fedstack/hooks`，单一入口、源码直出

- 位置遵循 ADR-015 四层分组（`packages/*/*` glob 自动纳入），web 层已预留 `hooks` 角色。
- 不并入 `@fedstack/web-utils`：hooks 是跨应用复用的独立能力域，混入会把它扩张成杂物包。
- 构建方式沿用 `@fedstack/web-admin-shell` 的源码直出（`exports` 指向 `./src/index.ts`），不引入 rslib；本包 `private: true`，无发布需求。
- 合并上游「主入口 + `./web` 子路径」为单入口：本仓无 React Native 目标，`./web` 拆分只会增加 import 决策成本。

### D2 不迁移 `src/store`，状态引擎统一由 Zustand 承担

- `useArray` / `useNow` 改用 Zustand vanilla `createStore` + `create` API 桥接（`zustand/vanilla` + `zustand`），对外仍返回「快照 + 可操作 store」形态。
- `usePriorityQueue` 不再包装 adapter store：`@fedstack/utils` 的 `PriorityQueue` 本身就是带 `subscribe` 的权威数据源，直接以 `useSyncExternalStore`（Zustand 内部同款原语）桥接，避免制造第二份重复状态。
- 禁止在本仓再引入第二套订阅基础设施；需要多实例 / 可销毁 store 时用 Zustand `createStore`，不新增 class 基类。

依据：`frontend.md` §2「状态归属是架构边界」与「禁止制造多份重复的状态数据源」。

### D3 依赖归属

- `react`、`zustand` 为 peerDependency（宿主运行时由消费方提供，避免多份实例）。
- `ahooks`（catalog `^3.11.0`）为 dependency：`useCreation` / `useBoolean` / `useCountDown` 由它提供，且 `@fedstack/web-admin-shell` 已在用同一版本。
- 优先级队列复用 `@fedstack/utils`（shared 层）的 `PriorityQueue`，不引入 `@skyroc/utils`。

### D4 保留上游 MIT 版权声明

- 上游为 MIT（Copyright (c) 2026 Ohh）。包根 `NOTICE` 记录来源 URL、版本 v1.1.0、修改点与 MIT 全文。
- 本包自身代码许可仍为 `UNLICENSED`（内部包）。

## 备选方案

- **合并进 `@fedstack/web-utils`**：省一个包，但把「纯工具函数」与「React hooks」两种职责混在一起，违背包角色单一。
- **保留自研 `Store` 基础设施**：可与上游源码零改动对齐，但会让仓库出现 Zustand 与自研 Store 两套状态引擎，违反单一数据源与写法统一。
- **保留 `./web` 子路径**：仅对多端（RN）有意义；本仓无该目标。
- **直接依赖 npm 上的 `@skyroc/hooks`**：引入外部供应链与版本漂移，且无法按本仓规范裁剪 store。

## 已知限制与跟进项

1. **API 形态变化**：`useArray` / `useNow` 返回的 store 实例由「class 实例」变为「Zustand `StoreApi` + 操作方法」的交叉类型。本仓当前零消费方，无迁移成本；后续若照抄上游调用代码，需按本仓类型书写。
2. **上游行为原样保留**：`unshift` / `push` 按 key 去重时保留首次出现的元素（`unshift` 的新元素会顶掉原位置的同 key 元素）；`splice(start)` 未传 `deleteCount` 时按 0 删除（与 `Array.prototype.splice` 语义不同）。如需修正，应单独变更并以 ADR 记录。
3. **不覆盖的 hook**：上游若有未列出的 hook，本次未迁移；新增时按本 ADR 的依赖与状态规则扩展。
4. **测试覆盖**：8 个测试文件覆盖 9 个 hook 的主路径与边界，DOM 依赖通过 happy-dom 提供；`useCopy` 的 legacy `execCommand` 兜底分支未纳入单测。
