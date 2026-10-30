# layouts —— 后台布局壳域

admin 专属的框架层：装配侧栏、顶栏、标签页与内容区，支持六种布局模式。
**不是通用库**，消费者（`apps/admin`）必然会修改它，因此不做发布、不做构建。

## 引用方式

应用侧通过 tsconfig `paths` 源码直引，不走包名导入：

```ts
import { LAYOUT_MODE } from '@shell/layouts';
```

映射关系见 `apps/admin/tsconfig.json` 的 `"@shell/*"`。
壳包没有 `exports` 字段也没有产物，包名子路径（`@fedstack/web-admin-shell/layouts`）不可解析。

## 目录规划（分阶段落地）

| 路径                                                  | 阶段          |
| ----------------------------------------------------- | ------------- |
| `index.ts` / `constant.ts` / `context.tsx`            | SK-3.0 已完成 |
| `materials/` 纯 UI 骨架（只认 vertical / horizontal） | SK-3.1        |
| `config/layout-settings.ts`、`store/`、CSS 变量       | SK-3.2        |
| `modules/admin-menu/`                                 | SK-3.3        |
| `modules/admin-header/`                               | SK-3.4        |
| `modules/admin-tab/`                                  | SK-3.5        |

## 约束

- 本域**禁止**引用应用侧别名 `@/`、`~/`，只能依赖 `@fedstack/*` 公共包与 React / antd。
  由 `eslint.config.js` 的 `no-restricted-imports` 守卫。
- `react` 之类运行时依赖在 `package.json` 用 catalog 版本声明，保证全仓同一份实例。
