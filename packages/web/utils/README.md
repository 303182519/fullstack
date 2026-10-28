# @fedstack/web-utils

浏览器专用工具函数集合（web 层，ADR-015）：依赖 `window` / `document` / `navigator` 等宿主全局，只能在浏览器运行时使用。

平台无关的工具（数组、对象、日期、深路径等）在 `@fedstack/utils`（shared 层），本包通过 `@fedstack/utils` 复用其基础能力，不重复实现。

## 入口

单入口 `@fedstack/web-utils`：

| 模块            | 内容                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `class`         | `toggleHtmlClass`：在 `<html>` 上增删 class                                      |
| `compose-props` | `mergeProps` / `withClassName`：插槽模式下的 props 合成（React）                 |
| `download`      | URL / Base64 / Blob / BlobPart / 图片 URL 下载，`urlToBase64`、`triggerDownload` |
| `env`           | 浏览器环境探测：`isWindow`、`isMacOs`、`isWindowsOs`、`isPC`                     |
| `form`          | 表单相关类型（`FieldElement` / `CustomElement`），type-only 导出                 |
| `input`         | `getEventValue`、`isCheckBoxInput` / `isRadioInput` / `isFileInput`              |
| `storage`       | `createStorage`（localStorage / sessionStorage）、`createLocalforage`            |
| `window`        | `openWindow`：新窗口打开（默认 `noopener,noreferrer`）                           |

## 约定

- `react` 为 peerDependency：只有 `compose-props` 用到 React，宿主负责提供具体版本。
- 全包 `sideEffects: false`，所有模块均可被安全 tree-shake。
- `download` 的跨域场景优先 `fetch -> blob`，失败时回退 `openWindow`；`urlToBase64` 要求图片服务端允许 CORS，否则 canvas 会被污染。
- `env` 的 UA 嗅探只是降级手段，能用特性检测就不要依赖它。

## 校验

```bash
pnpm run typecheck   # src 浏览器项目 + 测试项目
pnpm run test        # vitest（happy-dom 环境，含 *.test-d.ts 类型断言）
pnpm run lint
pnpm run build
```
