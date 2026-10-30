# apps/admin 迁移执行计划（SkyrocAdmin → fedstack）

> 本文档是跨会话施工清单。每个阶段有明确的「完成判定」，做到即停，不开下一阶段。
> 源：https://github.com/Ohh-889/skyroc/tree/master/apps/admin
> 原则：不照抄，对齐本仓架构（Rsbuild / Zustand / @fedstack/* / admin-api 真实契约）。

---

## 0. 已锁定的架构决策

| # | 决策点 | 选择 | 理由 |
|---|---|---|---|
| D1 | 客户端状态 | **Zustand**（内存） | 符合 `docs/rules/stack/frontend.md` §2；accessToken 不落地 |
| D2 | 路由 | **TanStack Router 文件式** | `@tanstack/router-plugin` 已在 devDeps；与源一致便于对照学习 |
| D3 | 样式 | **Tailwind CSS 4** + CSS 变量 | catalog 已有 tailwindcss 4；源也是 Tailwind 语法；Rsbuild 生态契合 |
| D4 | UI 组件 | **antd 6** + 现有 compose 组件 | 不引入 Radix web-ui，降复杂度 |
| D5 | token 存储 | **accessToken 内存，refresh 走 HttpOnly Cookie** | 后端已锁 Cookie；XSS 拿不到；刷新走 `/auth/refresh` |
| D6 | 迁移节奏 | 分阶段，每阶段可独立开会话 | — |

---

## 阶段 0：基线对齐

**目标**：补齐依赖、骨架能跑通，为路由铺路。**不做任何业务代码。**

### 0.1 补 catalog 依赖
`pnpm-workspace.yaml` web 层（3.x 分组）追加：
```yaml
'@tanstack/react-router': ^1.x   # 与 @tanstack/router-plugin 同主版本
zustand: ^5.x
```
> 知识点：pnpm catalog 是 monorepo 单一版本源，所有包用 `catalog:` 引用，禁止在包级 `package.json` 写死版本。

### 0.2 声明 apps/admin 依赖
`apps/admin/package.json`：
- `dependencies` 加：`@fedstack/axios`、`@fedstack/service`、`@tanstack/react-router`、`zustand`
- `devDependencies` 已有 `@tanstack/router-plugin`，保留

### 0.3 安装并验证
```powershell
pnpm install
pnpm --filter @fedstack/admin dev      # 浏览器打开 3004，应看到 "Rsbuild with React"
pnpm --filter @fedstack/admin build    # 应无报错
```

**阶段 0 完成判定**：`dev` 起得来、`build` 通过。

---

## 阶段 1：路由骨架 ✅ 已完成

**完成日期**：2026-10-29

**目标**：TanStack Router 跑通，有 `(auth)` / `(admin)` / `(errors)` 三个布局组和 404。先不接登录逻辑，用占位页。

**路由范式**：Directory 约定（Skyroc admin-example 同款），而非 flat-file 约定。

### 1.1 TanStack Router 插件配置
`apps/admin/rsbuild.config.ts`：
```ts
TanStackRouterRspack({
  autoCodeSplitting: true,
  target: 'react',
  routesDirectory: './src/pages',
  generatedRouteTree: './src/features/router/routeTree.gen.ts',
  routeToken: 'layout',
  routeFileIgnorePattern:
    '(?:^|/)(components|modules)(?:/|$)|(?:^|/)(loading|error|not-found)(?:.tsx?|$)',
}),
```
> 知识点 1：`routesDirectory` = 路由文件扫描目录。Skyroc 用 `./src/pages`，入口文件放 `src/` 根，二者分离。
> 知识点 2：`routeToken: 'layout'` 启用 directory 布局约定——`(auth)/layout.tsx` 是 `(auth)` 分组的布局壳，而非 flat-file 模式下的 `_auth.tsx` pathless 路由。
> 知识点 3：`routeFileIgnorePattern` 把 loading/error/not-found 约定文件从路由树排除，让 TanStack Router 运行时自动发现它们（不需要 `createFileRoute` export）。
> 知识点 4：Rspack 插件和 Vite 插件共享同一个 `configSchema`（zod 校验），选项完全兼容。

### 1.2 最终目录结构
```
apps/admin/src/
├── main.tsx                          # 入口（rsbuild entry 指向这里）
├── bootstrap.tsx                     # 应用启动壳（ErrorBoundary + RouterProvider）
├── plugins/assets.ts                 # 保留原有
├── features/
│   └── router/
│       ├── index.ts                  # createRouter（全选项）
│       ├── router-ref.ts             # 运行时 router 引用，切断循环依赖
│       ├── RouterProvider.tsx        # Provider 组件（阶段 2 注入 auth context）
│       ├── guard.ts                  # 预留，阶段 2+ 接路由守卫
│       └── routeTree.gen.ts          # 插件自动生成（勿手改）
├── pages/                            # routesDirectory（纯路由）
│   ├── __root.tsx                    # 根路由
│   ├── loading.tsx                   # 全局 Suspense loading（约定文件，纯组件）
│   ├── error.tsx                     # 全局错误边界（约定文件，纯组件）
│   ├── not-found.tsx                 # 根级 404（约定文件，纯组件）
│   ├── (auth)/
│   │   ├── layout.tsx                # 认证布局（居中卡片）
│   │   └── login/index.tsx           # 登录页占位
│   ├── (admin)/
│   │   ├── layout.tsx                # 后台布局壳占位
│   │   └── home/index.tsx            # 首页占位
│   └── (errors)/
│       ├── 403.tsx
│       ├── 404.tsx
│       └── 500.tsx
└── [assets/types/utils]
```

### 1.3 router 创建（features/router/index.ts）
```ts
export const router = createRouter({
  routeTree,
  context: {},                       // 阶段 2 RouterProvider 动态注入
  // 自定义 query string 序列化（见下方知识点）
  stringifySearch,
  parseSearch,
  notFoundMode: 'root',              // 子路由 404 冒泡到根
  scrollRestoration: true,           // 列表返回位置恢复
  defaultPreload: 'intent',          // 悬停预加载（只做代码 chunk，不缓存 loader 数据）
  defaultPreloadStaleTime: 0,        // 预加载不缓存 loader 数据，后台数据变动频繁
  defaultPendingMs: 10,              // spinner 延迟出现
  defaultPendingMinMs: 1000,         // spinner 最短展示
  defaultStructuralSharing: true,    // loader selector 结构共享，最小化重渲染
});

setRouter(router);  // 注册运行时引用

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
  interface StaticDataRouteOption {}
}
```
> 知识点 1：**context 用 D2 动态 Provider 方案**（对齐 Skyroc），而非静态 createRouter + 手动 `router.update()`。登录状态变化时 context 自动同步，无需在 authStore.subscribe 里维护两份状态。
>
> 知识点 2：**stringifySearch / parseSearch 适配层**（本模块内部实现，编码核心委托 `@fedstack/utils`）。对齐 Skyroc admin 的 URLSearchParams 格式（`tags=a&tags=b`），而非 TanStack 默认 JSON 格式（`?tags=%5B%22a%22%2C%22b%22%5D`）。三层适配：
>   1. TanStack search object 可能含嵌套对象（`{ filters: { author: 'alice' } }`），shared stringifyQuery 只处理基本类型 → 先展开成点号 key（`filters.author=alice`）
>   2. shared stringifyQuery 输出带 `?` 前缀，TanStack 要求不带 → `.slice(1)`
>   3. shared parseQuery 返回 `string | null` 值，TanStack 期望 `Record<string, unknown>`（含 number / boolean） → autoConvert + 点号 key 合并嵌套

### 1.4 router-ref.ts 循环依赖切断
```
adapter.ts → import { getRouter } from '@/features/router/router-ref'
                                    ↑
                           零依赖哑模块，不 import routeTree.gen
```
> 知识点：`router-ref.ts` 是环上的安全节点——只有一个变量 + 两个函数，不 import 任何路由/Store/Service。`setRouter()` 在 router 完整构建后调用，`getRouter()` 只在运行时事件中调用（如 401 响应）。

### 1.5 已删除的旧文件
- `src/routes/_auth.tsx` / `_auth.login.tsx` / `_admin.tsx` / `_admin.home.tsx`（flat-file 约定废弃）
- `src/routes/$.tsx` / `403.tsx` / `500.tsx`（挪到 `pages/(errors)/`）
- `src/router.ts` / `src/routeTree.gen.ts`（被 features/router/ 替代）
- `src/pages/index/`（main/bootstrap 挪到 `src/` 根）

**阶段 1 完成判定**：typecheck ✅ / build ✅，autoCodeSplitting 生效（7 个 async chunk）。

---

## 阶段 2：登录闭环（service adapter + auth store + 登录页）

**状态**：代码全部落地，`typecheck` / `lint` / `build` 三项绿；**真实账号登录待人工验证**（仓内无可用测试账号，需 seed 或运维脚本提供一个）。
已交付文件：`src/store/auth.ts`、`src/service/{adapter,request,queryClient,antd-holder}.ts`、`src/service/api/auth.ts`、`src/pages/(auth)/login/index.tsx`、`src/pages/__root.tsx`、`src/pages/(admin)/layout.tsx`、`src/pages/(auth)/layout.tsx`、`src/bootstrap.tsx`。

**目标**：能调用 admin-api 完成登录，accessToken 进内存，受保护路由能拿到用户态。

### 2.1 环境变量
**文件名必须是 Rsbuild 标准 mode 名**（`scripts` 里没有 `--env-mode`，`.env.dev` / `.env.prod` 不会被加载）：
- `.env`（全环境共用）：`PUBLIC_MY_APP_NAME` + 业务码 `PUBLIC_SERVICE_SUCCESS_CODE=200`、`PUBLIC_SERVICE_EXPIRED_TOKEN=10A08`、`PUBLIC_SERVICE_LOGOUT=10A09`
- `.env.development`：`PUBLIC_ENV=development`、`PUBLIC_API_BASE_URL=http://localhost:3001/api`
- `.env.production`：`PUBLIC_API_BASE_URL=/api`（同源反代）
- `.env.test`：同上，需显式 `rsbuild build --env-mode test` 才生效

> 知识点 1：`expiredToken` **不能配 HTTP 401**。admin-api 的 bizCode 优先匹配（`shared.ts` 的 `String(bizCode ?? code)`），密码错误 10A02 / 租户不可用 10A07 也都是 401，配 401 会让「密码输错」误入续签分支。用 `10A08`（INVALID_ACCESS_TOKEN）、登出用 `10A09`（SESSION_REVOKED）。
> 知识点 2：admin-api 地址是 **3001**（`config.default.ts` 的 PORT=3001 + 全局前缀 `api`），不是前端的 3003。

### 2.2 service 层目录
```
apps/admin/src/service/
├── adapter.ts        # RequestAdapter 实现（核心！）
├── request.ts        # createAppRequest 实例
├── queryClient.ts    # createQueryClient
└── api/
    └── auth.ts       # 登录 / 刷新 / 资料 / 验证码 / 登出
```

### 2.3 adapter.ts（最关键的文件）
实现 `RequestAdapter`。因为 refresh token 在 HttpOnly Cookie 里，几个方法要特殊处理：

```ts
import { createAppRequest } from '@fedstack/service';
// 注意 adapter 需要的能力：
// - getToken()        → 从 Zustand authStore 取 accessToken
// - getRefreshToken() → 返回空串（Cookie 不可读，fetchRefreshToken 不用这个参数）
// - fetchRefreshToken(_) → POST /auth/refresh 带 withCredentials，返回 { token: accessToken, refreshToken: 'cookie' }
// - setAuth({ token }) → 只存 accessToken 进 authStore；refreshToken 忽略
// - resetAuth()       → 清 authStore
// - redirectToLogin() → router.navigate({ to: '/login' })
// - getCurrentPath()  → 取当前 location.pathname + search
// - showErrorMessage  → antd message.error
// - showErrorModal    → antd Modal.error
// - t()               → 先返回 key 本身（i18n 阶段 7 再接）
```
> 知识点：`@fedstack/service` 用 Adapter 模式把平台差异（UI/导航/认证）注入，请求层本身跨端复用。refresh 的并发去重由 `refreshToken()` 内部的 `inFlight` Promise 保证，adapter 只管「怎么拿/怎么存」。

### 2.4 request.ts
```ts
export const request = createAppRequest({
  adapter,
  axiosConfig: {
    baseURL: import.meta.env.PUBLIC_API_BASE_URL,
    withCredentials: true,   // 关键：让 refresh Cookie 跨域带上
  },
  codes: {
    success: import.meta.env.PUBLIC_SERVICE_SUCCESS_CODE,
    expiredToken: import.meta.env.PUBLIC_SERVICE_EXPIRED_TOKEN?.split(','),
    logout: import.meta.env.PUBLIC_SERVICE_LOGOUT?.split(','),
    modalLogout: [],
  },
});
```

### 2.5 queryClient.ts
```ts
import { createQueryClient } from '@fedstack/service';
export const queryClient = createQueryClient({ /* 默认即可 */ });
```
在 `__root.tsx` 外层包 `<QueryClientProvider client={queryClient}>`。

### 2.6 auth store（Zustand，纯内存）
`apps/admin/src/store/auth.ts`：
```ts
import { create } from 'zustand';
interface AuthState {
  accessToken: string | null;
  setToken: (t: string | null) => void;
  clear: () => void;
}
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  setToken: (t) => set({ accessToken: t }),
  clear: () => set({ accessToken: null }),
}));
```
> 知识点：不持久化 = 刷新后丢失。根路由的 `beforeLoad` 里调一次 `/auth/refresh`（Cookie 自动带）把 accessToken 换回来，用户无感。

### 2.7 端口 / CORS 对齐（已落地）
admin-api dev CORS 现放行 **3003 与 3004** 两个 origin，并补了 `X-Request-Id` 到 `allowedHeaders`；
admin 固定跑 **3004**（3003 常被其它本地服务占用）。
> 知识点 1：refresh token 走 Cookie，`withCredentials: true` 要求服务端 `Access-Control-Allow-Origin` 不能是 `*`，必须是具体 origin 且 `credentials: true`。
> 知识点 2：`@fedstack/axios` 默认给每个请求加 `X-Request-Id` 头 → 触发预检，服务端 `allowedHeaders` 漏配这个头会让请求变成 `net::ERR_FAILED`（不是 401，极难从错误文案定位）。

### 2.8 API 对接契约（对照 admin-api）
| 接口 | 方法 | 入参 | 返回（信封 data） |
|---|---|---|---|
| `/auth/captcha` | GET | — | `{ captchaId, svg, expiresIn }` |
| `/auth/login` | POST | `{ tenantCode, username, password, captchaId?, captchaText?, device? }` | 联合：`{ accessToken, tokenType, expiresIn }` 或 `{ mfaRequired: true, pendingToken, expiresIn }` |
| `/auth/mfa/verify` | POST | `{ pendingToken, code, device? }` | `{ accessToken, tokenType, expiresIn }` |
| `/auth/refresh` | POST | —（靠 Cookie） | `{ accessToken, tokenType, expiresIn }` |
| `/auth/profile` | GET | —（Bearer） | `ProfileResponseDto` |
| `/auth/logout` | POST | —（Bearer） | `null` |

信封统一为 `{ code, data, message }`（`ResponseInterceptor` 包装），`code` 即 HTTP 状态码回声。

### 2.9 登录页
`src/pages/(auth)/login/index.tsx`：
- antd Form（tenantCode / username / password / 可选验证码）
- 调 `POST /auth/login`
- 成功 → `setToken(accessToken)` → `router.navigate({ to: '/home' })`
- 返回 `mfaRequired` → 弹 MFA 输入框 → 调 `/auth/mfa/verify`
- 失败达阈值后端返回 `captchaRequired` → 显示验证码（`GET /auth/captcha`）

### 2.10 根路由 beforeLoad 续期
`__root.tsx` 的 `beforeLoad`：若 `authStore.accessToken` 为空，调 `/auth/refresh` 拿 token；失败跳登录。
> 知识点 1：页面刷新 → 内存 token 丢失 → 用 Cookie 静默续签，用户体验无损。
> 知识点 2（阶段 1 遗留 bug，已修）：`stringifySearch` **必须返回带 `?` 的整串**（router-core 的 `stringifySearchWith` 就是 `searchStr ? '?${searchStr}' : ''`）。阶段 1 代码多做了一次 `.slice(1)`，导致守卫重定向拼成 `/loginredirect=/home`。
> 知识点 3：`ParsedLocation.search` 是**已解析对象**，拼回跳地址必须用 `location.href`，否则得到 `[object Object]`。
> 知识点 4：guard 的重定向要放 `throw redirect()`，不要放 `router.navigate()` —— 后者在 beforeLoad 里不阻断本次导航。

**阶段 2 完成判定**：用真实账号（查 admin-api seed 或数据库）能登录进 `/home`，刷新页面不丢登录态，token 过期自动续签。

---

## 阶段 3：布局壳（已完成，2026-10-30）

**状态**：**已完成**（SK-3.0 ~ SK-3.7 全部落地）。详细施工清单与逐阶段验收记录见 **`.scratch/admin-phase3-layout-checklist.md`**。
**架构调研**：`docs/guide/skyroc-admin-layout-architecture-explained.md`。
**关键裁决（2026-10-30）**：文件式静态路由 + 菜单树只做导航 UI（不跟 skyroc 的动态路由注册）；六种布局模式全做；布局壳放 `packages/web/admin/src/layouts/`；主题只预留 CSS 变量。详见 `ADR-018`。

**实际交付**（与清单的差异见清单各章「偏差」表）：

- 壳包 `layouts/`：`materials/` 受控骨架、`utils/{sider-width,menu-mapper,menu-icons,menu-levels}.ts`、`store/{layout,menus,tabs}.ts`、`modules/{admin-header,admin-menu,admin-tab}/`，壳包 `test` 52/52。
- 六模式（vertical / horizontal / 3×hybrid / vertical-mix）由 `layout-settings.ts` 的 `layout.mode` 单点切换，已浏览器实测；本轮修复 3 个真实缺陷（`isMixMode` 漏模式、hybrid 折叠按钮缺失、portal 容器只解析一次）。
- 标签页按 **B 方案**（不做组件级 Keep-Alive，标签条 = 路由历史可视化 + React Query 数据缓存兜底）。
- 装配全部留在 `apps/admin/src/pages/(admin)/layout.tsx`，壳包不含装配层、不请求业务接口。
- **遗留**：① 移动端 `<sm` 断点回归未实测；② 标签条首帧不建立标签（`useUpdateEffect` 跳过首帧）。

---

## 后续阶段（待排期，本清单不展开）

- 阶段 4：主题系统（暗黑模式 / 主题色 / 配置面板）
- 阶段 5：权限与动态菜单（RBAC / 路由守卫 / 按钮权限）
- 阶段 6：业务页面（用户 / 角色 / 菜单 / 部门 / 字典 CRUD）
- 阶段 7：i18n / 错误页打磨 / 动画 / nprogress

---

## 验证纪律（每个阶段结束都要跑）
```powershell
pnpm --filter @fedstack/admin typecheck
pnpm --filter @fedstack/admin lint
pnpm --filter @fedstack/admin build
```
三项全绿才算阶段完成。
