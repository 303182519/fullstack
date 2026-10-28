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

- 本包属 shared 层：源码（`src/**`）禁止 Node 内置模块，禁止依赖 node / web / tooling 层包（根 `eslint.config.js` 拦截）。
- 主入口必须零 DOM 依赖，`__tests__/platform-boundary.test.ts` + tsconfig 中立项目双重兜底。
