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

## 阶段 1：路由骨架

**目标**：TanStack Router 跑通，有 `(auth)` / `(admin)` / `(errors)` 三个布局组和 404。先不接登录逻辑，用占位页。

### 1.1 启用 TanStack Router 插件
`apps/admin/rsbuild.config.ts`：
```ts
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';
// plugins 数组里加：
TanStackRouterRspack({ autoCodeSplitting: true }),
```
> 知识点：`@tanstack/router-plugin` 提供 Rspack/Vite 插件，扫描 `src/routes/` 生成路由树（`routeTree.gen.ts`），实现类型安全的文件式路由。

### 1.2 建路由目录结构
```
apps/admin/src/routes/
├── __root.tsx              # 根路由：挂 Provider（QueryClient / Theme / Router）
├── (auth)/
│   ├── layout.tsx          # 认证布局（居中卡片）
│   └── login/
│       └── index.tsx       # 登录页（占位，阶段 2 填）
├── (admin)/
│   ├── layout.tsx          # 后台布局壳（占位，阶段 3 填）
│   └── home/
│       └── index.tsx       # 首页占位
└── (errors)/
    ├── 403.tsx
    ├── 404.tsx             # 捕获未匹配路由
    └── 500.tsx
```
> 知识点：带括号的目录 `(auth)` 是「路径段分组」——不生成 URL 段，只用于组织布局。`__root.tsx` 是所有路由的根。

### 1.3 根路由 `__root.tsx`
```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {/* TanStack Router DevTools 只在开发态挂 */}
    </>
  ),
});
```

### 1.4 改入口 bootstrap.tsx
把当前直接 `<App />` 换成 `<RouterProvider>`。新建 `src/router.ts`：
```ts
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({ routeTree });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
```
`bootstrap.tsx` 用 `<RouterProvider router={router} />`。
> 知识点：`declare module` 做模块增强，让 `useNavigate` / `Link` 的 `to` 参数获得全量类型推导。

### 1.5 验证
`dev` 后访问 `/login`、`/home`、`/not-exist`，分别落到对应占位页。

**阶段 1 完成判定**：三个路由组 + 404 均可访问，无控制台报错。

---

## 阶段 2：登录闭环（service adapter + auth store + 登录页）

**目标**：能调用 admin-api 完成登录，accessToken 进内存，受保护路由能拿到用户态。

### 2.1 环境变量
`apps/admin/.env.dev` 追加（所有客户端变量必须 `PUBLIC_` 前缀）：
```env
PUBLIC_API_BASE_URL = http://localhost:3003/api    # admin-api 地址（见 2.7 端口对齐）
PUBLIC_SERVICE_SUCCESS_CODE = 200
PUBLIC_SERVICE_EXPIRED_TOKEN = 401
PUBLIC_SERVICE_LOGOUT = 401
```

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

### 2.7 端口 / CORS 对齐（必须处理）
admin-api dev CORS 只允许 `http://localhost:3003`，但 admin dev 跑在 3004。二选一：
- **方案 A（推荐）**：把 admin 的 `rsbuild.config.ts` `server.port` 改成 `3003`
- 方案 B：改 admin-api `main.ts` 的 `origin` 加 `3004`

> 知识点：refresh token 走 Cookie，`withCredentials: true` 要求服务端 `Access-Control-Allow-Origin` 不能是 `*`，必须是具体 origin 且 `credentials: true`。

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
`src/routes/(auth)/login/index.tsx`：
- antd Form（tenantCode / username / password / 可选验证码）
- 调 `POST /auth/login`
- 成功 → `setToken(accessToken)` → `router.navigate({ to: '/home' })`
- 返回 `mfaRequired` → 弹 MFA 输入框 → 调 `/auth/mfa/verify`
- 失败达阈值后端返回 `captchaRequired` → 显示验证码（`GET /auth/captcha`）

### 2.10 根路由 beforeLoad 续期
`__root.tsx` 的 `beforeLoad`：若 `authStore.accessToken` 为空，调 `/auth/refresh` 拿 token；失败跳登录。
> 知识点：页面刷新 → 内存 token 丢失 → 用 Cookie 静默续签，用户体验无损。

**阶段 2 完成判定**：用真实账号（查 admin-api seed 或数据库）能登录进 `/home`，刷新页面不丢登录态，token 过期自动续签。

---

## 后续阶段（待排期，本清单不展开）

- 阶段 3：布局壳（侧边栏 / 顶栏 / 标签页 Keep-Alive / 菜单）
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
