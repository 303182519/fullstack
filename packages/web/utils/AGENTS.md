# AGENTS.md

## Commands

- `pnpm run build` - Build the library for production
- `pnpm run dev` - Turn on watch mode, watch for changes and rebuild the library
- `pnpm run test` - Run tests
- `pnpm run test:watch` - Run tests in watch mode

## Docs

- Rslib: https://rslib.rs/llms.txt
- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
- Rstest: https://rstest.rs/llms.txt

## Tools

### ESLint

- Run `pnpm run lint` to lint your code

## 边界

- 本包属 web 层：允许依赖 DOM / BOM 全局与 `@fedstack/utils`（shared 层），禁止依赖 node / tooling 层包（根 `eslint.config.js` 拦截）。
- `react` 是 peerDependency，不要把它写进 `dependencies`；新增用到其他宿主运行时能力时同样先评估 peer 还是 dependency。
- 本包不得被 shared 层的包反向依赖。
