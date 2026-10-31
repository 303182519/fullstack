# AGENTS.md

## Commands

- `pnpm run build` - Build the library for production
- `pnpm run test` - Run tests
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run typecheck` - Run TS type checking (src + tests)
- `pnpm run lint` - Lint the package

本包由 `tsc` 产出 `dist`（`exports` 指向 `./dist/index.js`），无 bundler 产物。

## 边界

- 本包属 shared 层：源码禁止 Node 内置模块与 DOM / BOM 全局，禁止依赖 node / web / tooling 层包（根 `eslint.config.js` 拦截）。
- `tsconfig.json` 为中立项目（`lib: ES2023`、`types: []`），任何宿主全局引用都会在 typecheck 阶段失败。
- `colord` / `culori` 是运行时依赖；两者均为纯 JS 实现，不得为「方便」引入带宿主能力的替代库。
- `src/shared/colord.ts` 在模块加载时注册 colord 插件，属模块级副作用；`package.json` 的 `sideEffects` 必须保持指向该产物，否则消费方 bundler 可能错误地删除它。
- 源码迁移自 `@skyroc/color` v2.6.1（MIT），来源与许可声明见 `NOTICE`；对外 API 与上游保持一致，修改点必须同步记录到 `NOTICE`。
