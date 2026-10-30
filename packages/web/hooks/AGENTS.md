# AGENTS.md

## Commands

- `pnpm run test` - Run tests
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run typecheck` - Run TS type checking (src + tests)
- `pnpm run lint` - Lint the package

本包为源码直出（`exports` 指向 `./src/index.ts`），由消费方 bundler 编译，无独立 build 产物。

## 边界

- 本包属 web 层：允许依赖 DOM / BOM 全局、`@fedstack/utils`（shared 层）与 `ahooks`；禁止依赖 node / tooling 层包（根 `eslint.config.js` 拦截）。
- `react`、`zustand` 是 peerDependency，不要写进 `dependencies`。
- 状态引擎统一由 Zustand 承担，不要再引入自研 Store 基类或第二套订阅基础设施。
- 源码迁移自 `@skyroc/hooks` v1.1.0（MIT），来源与许可声明见 `NOTICE`。
