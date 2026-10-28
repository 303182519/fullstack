# @fedstack/utils

平台无关的工具函数集合（shared 层，ADR-015）：Node / 浏览器 / React Native 三端都可运行。

主入口零 DOM 依赖 —— `tsconfig.json` 的 `lib` 只有 `ES2023`、`types` 为空，任何宿主全局（`window` / `document` / `localStorage`）都会在编译期报错。

## 入口

| 入口                     | 内容                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fedstack/utils`        | 数组、对象比较/差异、深路径读写、日期、正则常量、查询串、类型守卫与类型工具、`Emitter`、`Subject`、`Singleflight`、`PriorityQueue`、`TaskHub`、`cn` |
| `@fedstack/utils/crypto` | `AesCrypto`：基于 crypto-js 的本地存储混淆。单独入口，避免主入口强制带上 crypto-js                                                                  |
| `@fedstack/utils/date`   | 日期边界 / 计算 / 比较 / 格式化，含已注册插件（`duration`、`relativeTime`）的 `dayjs` 实例                                                          |

浏览器专用工具（下载、存储、表单、窗口）在 `@fedstack/web-utils`（web 层），不进本包，避免把 DOM 依赖带进 shared 层。

## 约定

- `date/dayjs.ts` 有副作用（注册 dayjs 插件），已声明在 `sideEffects`，勿在别处重复注册。
- `AesCrypto` 基于 crypto-js 的 passphrase 模式，仅用于本地存储混淆，不构成安全边界；真实加密请用 Web Crypto 或服务端能力。
- 第三方依赖只转出白名单（见 `src/radash.ts`），不做 `export *`，避免把上游 API 面变成自己的公开契约。

## 校验

```bash
pnpm run typecheck   # src 中立项目 + 测试项目
pnpm run test        # vitest（含 *.test-d.ts 类型断言）
pnpm run lint
pnpm run build
```
