# Skyroc apps/admin 认证全流程调研 · 源码出处与 fedstack 迁移映射

> 本文面向执行「阶段 2：登录闭环」的同学，讲清楚两件事：
> **skyroc 上游的认证链路实际怎么跑的（每条结论带源码出处）、各环节映射到 fedstack 时该复用还是改写。**
>
> 调研对象：<https://github.com/Ohh-889/skyroc> master @ `10ddd27`（浅克隆源码，2026-10-29）。
> 迁移目标形态：`.scratch/admin-migration-plan.md` 阶段 2（决策 D1 / D2 / D5）。
> 引用格式：`仓库内相对路径:行号范围`。

---

## 1. 概览：一张图看懂 skyroc 认证闭环

```text
登录页 (auth)/login/index.tsx
   │  userName + password（无验证码/租户字段的实际使用）
   ▼
useInitLogin()  →  POST /auth/login
   │  信封 { code, data, msg }，成功码 '0000'
   ▼
setAuth(data)：token + refreshToken 都写 localStorage（前缀 SR_）
   │            jotai authAtom 只做内存镜像
   ▼
initAuth()：GET /auth/getUserInfo（React Query）→ initMenus() → initialized=true
   │
   ▼
每个业务请求：请求拦截器塞 Authorization: Bearer <localStorage 的 token>
   │
   ├─ 响应 code ∈ expiredToken(9999/9998/3333)
   │     → 模块级单例刷新 POST /auth/refreshToken（body 带 refreshToken）
   │     → 成功：换新 Authorization 重发原请求（isTokenRefreshRetry 防循环）
   │     → 失败：resetAuth + 跳 /login-out
   │
   ├─ 响应 code ∈ logout(8888/8889) → 清凭据 + 跳登录页
   └─ 响应 code ∈ modalLogout(7777/7778) → 弹窗确认后清凭据跳登录页

登出：用户点头像 → 确认弹窗 → /login-out 路由
   → context.logout()（纯本地清理，无后端登出接口）→ 跳 /login
```

一句话概括 skyroc 的方案：

> **两个 token 都落 localStorage，刷新完全由业务错误码被动触发，
> 并发去重靠请求层模块级 inFlight Promise，路由层用「context 动态注入 + beforeLoad 分层守卫」管住登录态。**

---

## 2. 分环节详解

### 2.1 登录页组件与提交逻辑

**页面**：`apps/admin/src/pages/(auth)/login/index.tsx:28-156`

- antd `AForm`，字段只有 `userName` / `password` 两项（L80-95），`onFinish={login}`（L78）。
- 表单校验规则来自 `useAuthFormRules()`（`apps/admin/src/features/auth/use-auth-form-rules.ts:11-83`）：必填 + 正则（`REG_USER_NAME` / `REG_PWD` 来自 `@skyroc/utils`）。
- 页面上有 code-login / register / reset-pwd 的入口按钮和三个演示账号快捷登录（L39-58），但：
  - `code-login.tsx:26-29` 的 `handleSubmit` **只弹成功提示，不调任何接口**——短信登录是 UI 占位；
  - 类型系统里 `LoginParams` 是按 `grantType` 分派的可辨识联合（password / sms / email，含可选验证码 `code`/`uuid`、租户 `tenantId`），见 `packages/web/admin/types/api/auth.d.ts:14-59`，但密码登录页实际只传 `{ userName, password }`。

**提交逻辑**：`apps/admin/src/features/auth/use-login.ts:9-72` 的 `useInitLogin()`：

```text
login(params)
  → useLoginMutation().mutate(params)        // React Query mutation，retry: false
  → onSuccess(data):
       setAuth(data)                          // token 落地（见 §2.3）
       info = await initAuth()                // 拉用户信息 + 初始化菜单（见 §2.6）
       router.invalidate()                    // 让 beforeLoad 按新登录态重跑
       按 lastLoginUserId 判断是否换账号       // 换了就清 globalTabs 缓存
       navigate(search.redirect || '/')       // zod 校验过 redirect 必须以 / 开头
```

- `search.redirect` 由 `(auth)/login/layout.tsx:12-14` 的 zod schema 校验（`z.string().startsWith('/')`，防开放跳转）。
- `login/layout.tsx:19-23` 的 `beforeLoad`：**已登录用户访问登录页直接跳走**（`redirect: search.redirect || context.getHomeRoute()`）。

### 2.2 service / request 层：实例创建、拦截器、信封、错误码

分两层：`@skyroc/axios`（纯 axios 封装）+ `@skyroc/service`（平台无关的请求工厂，Adapter 模式）。

**实例创建**：`apps/admin/src/service/request/index.ts:13-27`

```ts
export const request = createAppRequest({
  adapter: antdAdapter,
  axiosConfig: { baseURL, headers: { apifoxToken: '...' } },
  codes: {
    expiredToken: import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [],
    logout:       import.meta.env.VITE_SERVICE_LOGOUT_CODES?.split(',') || [],
    modalLogout:  import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [],
    success:      import.meta.env.VITE_SERVICE_SUCCESS_CODE
  }
});
```

错误码来自环境变量（`apps/admin/.env`）：

| 环境变量 | 值 | 语义 |
|---|---|---|
| `VITE_SERVICE_SUCCESS_CODE` | `0000` | 业务成功码 |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | 触发令牌刷新 |
| `VITE_SERVICE_LOGOUT_CODES` | `8888,8889` | 直接登出 |
| `VITE_SERVICE_MODAL_LOGOUT_CODES` | `7777,7778` | 弹窗确认后登出 |

`normalizeCodes()`（`packages/@core/service/src/request/shared.ts:16-23`）会对每项 trim 去空，成功码缺省兜底 `'0000'`。

**信封格式**：`{ code: string|number, data: any, msg: string }`。成功判定 `String(response.data.code) === codes.success`（`create-request.ts:24-26`），数据转换默认取 `response.data.data`（`create-request.ts:44-48`）。

**请求拦截器**（`packages/@core/axios/src/index.ts:60-79`）：

1. 塞 `X-Request-Id: nanoid()`（`constant.ts:2`）；
2. 无自带 signal 的请求挂共享 `AbortController`（`cancelAllRequest` 用）；
3. `onRequest` 钩子设置认证头（`create-request.ts:36-41`）：

```ts
config.headers.set('Authorization', getAuthorization(adapter));
// getAuthorization: token 存在 → `Bearer ${token}`，否则 null（shared.ts:54-57）
```

axios 基础配置（`options.ts:42-59`）：`timeout: 10s`、`Content-Type: application/json`、`paramsSerializer` 用 `qs.stringify`、`validateStatus` 只认 2xx + 304。**默认不重试**（`createRetryOptions` 返回 `retries: 0`，`options.ts:34-40`）。

**响应拦截器**（`packages/@core/axios/src/index.ts:81-129`），两条分支都会进业务码分岔：

- 2xx 分支：`isBackendSuccess` 失败 → `onBackendFail` → 仍失败则包成 `BACKEND_ERROR` 的 AxiosError 走 `onError`；
- **非 2xx 分支**：只要 `response.data` 是对象信封，**同样先接一次 `onBackendFail`**（L111-122）——这是关键设计：后端用真实 HTTP 状态码表达失败时（如 401），刷新/登出分岔依然生效。

**错误提示去重**：`showErrorMsg()`（`shared.ts:71-94`）用实例级 `errMsgStack` 数组去重，单条消息最长占位 5 秒（防 onClose 不回调时消息被永久吞掉）。

### 2.3 token 存储方案

**结论：accessToken 和 refreshToken 都存 localStorage；jotai atom 只是内存镜像。**

出处：

- `apps/admin/src/features/auth/use-auth.ts:25-39`：

```ts
export function getToken() { return localStg.get('token'); }
export function setAuth(data: Api.Auth.LoginToken) {
  setAtomValue(authAtom, prev => ({ ...prev, token: data.token }));
  localStg.set('token', data.token);
  localStg.set('refreshToken', data.refreshToken);
}
```

- `localStg` = `createStorage('local', 'SR_')`（`apps/admin/src/utils/storage.ts:1-7`，前缀可被 `VITE_STORAGE_PREFIX` 覆盖）。
- localStorage 键类型声明：`apps/admin/src/types/storage.d.ts:4-13`（`token` / `refreshToken` / `lastLoginUserId` / `lang`）。
- 模块加载时用 `localStg.get('token')` 初始化 atom（`use-auth.ts:9`），所以**刷新页面登录态不丢**。
- `LoginToken` 类型含 `expiresIn?` / `refreshExpiresIn?`（`packages/web/admin/types/api/auth.d.ts:113-122`），注释写着"据此提前续签"，但**已 grep 确认 apps/admin/src 无任何代码消费这两个字段**——没有主动续签调度，刷新完全被动（见 §2.4）。
- adapter 的 token 读写也直接打 localStorage（`apps/admin/src/service/adapter.ts:41-57`），不经过 jotai。

### 2.4 token 刷新机制：被动触发 + 模块级单例去重

**触发点**在响应错误分岔 `backEndFail()`（`packages/@core/service/src/request/error-handler.ts:79-92`）：

```ts
const canRefresh =
  codes.expiredToken.includes(responseCode) &&
  !isRefreshTokenRequest(response.config, adapter) &&   // 续签请求自己不许再续签
  !response.config.isTokenRefreshRetry;                  // 已重发过一次的不许再刷

if (canRefresh) {
  const success = await refreshToken(adapter);
  if (success) {
    response.config.headers.set('Authorization', getAuthorization(adapter));
    response.config.isTokenRefreshRetry = true;          // 字符串键：Symbol 会在 mergeConfig 丢失
    return instance.request(response.config);            // 重发原请求，结果交回调用方
  }
}
```

两道防死锁闸门：

- `isRefreshTokenRequest()`（`shared.ts:37-51`）：认 `config.isRefreshToken` 标记，也认 url 与 `adapter.refreshTokenUrl` 的归一化匹配。`refreshTokenUrl` 在 `RequestAdapter` 里是**必填字段**（`types.ts:43-50`），漏配是编译错误——因为续签请求若再触发续签，会 `await` 自己那次未完成的刷新，把所有等待者一起永久挂起。
- `isTokenRefreshRetry`：刷完还是过期码说明问题不在 token（时钟偏移、多副本未同步、码配错），不再刷第二次，防热循环。

**并发去重**在 `token-refresh.ts:8-55`：

```ts
const REUSE_WINDOW = 1_000;
let inFlight: Promise<boolean> | null = null;   // 模块级，全局唯一

export async function refreshToken(adapter) {
  inFlight ??= handleRefreshToken(adapter);      // 并发共享同一次刷新
  const success = await inFlight;
  reuseTimer ??= setTimeout(() => { inFlight = null; reuseTimer = null; }, REUSE_WINDOW);
  return success;
}
```

- `inFlight` 放**模块级**而非实例级（注释 L10-14）：HTTP / WebSocket / SSE 共享同一次登录凭据，各刷各的会让后发者拿着已轮换的 refresh token 去换，必败。已确认 apps/admin 内没有业务代码直接调 `refreshToken()`，实际只有响应拦截器这一条触发路径。
- 刷新完成后 **1 秒复用窗口**：一批请求几乎同时拿到过期码是常态，窗口内直接复用结果，不再发新刷新。

**刷新动作本身**（`handleRefreshToken`，`token-refresh.ts:19-37`）：

```text
adapter.fetchRefreshToken(adapter.getRefreshToken() || '')
  → 成功：adapter.setAuth(data) 写回双 token
  → 失败：adapter.resetAuth() 清凭据 + adapter.redirectToLogin(当前完整路径)
```

skyroc 的 `fetchRefreshToken`（`apps/admin/src/service/api/auth/api.ts:23-31`）是 **POST /auth/refreshToken，body 明文带 refreshToken**；`redirectToLogin` 跳的是 `/login-out` 路由并带 `search.redirect`（`adapter.ts:47-49`），由该路由完成登出清理后再跳 `/login`（见 §2.6）。

### 2.5 路由守卫：context 动态注入 + beforeLoad 分层

**context 注入方式**：RouterProvider 动态方案（与 fedstack 计划 §1.3 知识点 1 同款）。

- `createRouter` 时 `context` 给的是**桩默认值**（`apps/admin/src/features/router/index.ts:18-39`）；
- 真正的登录态在 `RouterProvider.tsx:7-15` 每次渲染时注入：

```tsx
<TanStackRouterProvider
  context={{ initAuth, isAuthInitialized, isLoggedIn, userInfo, logout, getHomeRoute, homeRoute }}
  router={router}
/>
```

**守卫分四层**，全部用 `beforeLoad`：

| 层 | 文件 | 逻辑 |
|---|---|---|
| 根路由 | `pages/__root.tsx:44-48` | `!isAuthInitialized && isLoggedIn` → `context.initAuth()`（刷新页面后补拉用户信息） |
| `/` 首页 | `pages/index.tsx:3-13` | 已登录 → home；未登录 → `/login` |
| `(admin)` 布局 | `pages/(admin)/layout.tsx:41-43` | `guardAdminRoute(options)`（见下） |
| `(auth)/login` 布局 | `pages/(auth)/login/layout.tsx:19-23` | 已登录 → 跳 `search.redirect \|\| home` |
| `/login-out` | `pages/(auth)/login-out.tsx:19-26` | `await context.logout()` → 跳 `/login`（携带 redirect） |

**`guardAdminRoute`**（`apps/admin/src/features/router/guard.ts:84-94`）：

```text
!context.isLoggedIn → redirect /login（search.redirect = location.href，首页裸路径除外）
userInfo = context.isAuthInitialized ? context.userInfo : await context.initAuth()
!userInfo → await context.logout() → redirect /login   // 先清完再跳，否则被当成还登录着
静态权限模式 → 无权限路由 / 403
staticData.href 外链 → window.open 新窗口 + 回退跳转
```

要点：守卫依赖的是 **context 里的 `isLoggedIn`（token 非空）+ `initAuth()` 的真实用户数据**双重判定；权限校验（`hasMatchedRoutePermission` / `hasAuthorizedRoutePath`）只在 `VITE_AUTH_ROUTE_MODE=static` 下生效，动态路由模式的菜单由 `initMenus` 拉后端路由表（`GET /route/getReactUserRoutes`，`apps/admin/src/service/api/route/urls.ts:4`）。

### 2.6 用户信息获取与登出流程

**用户信息**：React Query 承载（`apps/admin/src/service/api/auth/hooks.ts:6-14`）：

```ts
queryOptions({
  queryKey: ['auth', 'userInfo'],
  queryFn: fetchGetUserInfo,
  staleTime: Infinity, gcTime: Infinity, retry: false
})
```

`fetchGetUserInfo`（`api/auth/api.ts:15-21`）**无 token 时直接 `Promise.resolve(null)` 不发请求**。`initAuth()`（`use-auth.ts:47-63`）= `refetch()` 拿用户 → `initMenus(data)` → `initialized = true`。

**登出**：

- 用户侧入口：`UserAvatar.tsx:26-36` 确认弹窗 → `navigate('/login-out', { search: { redirect } })`。
- 被动入口：请求层 logout/modalLogout 码（`error-handler.ts:46-70`）或刷新失败，最终都汇聚到 `adapter.redirectToLogin()` → `/login-out` 路由。
- **`/login-out` 是个纯 beforeLoad 路由**（组件返回 null）：`await context.logout()` 后才 `throw redirect('/login')`——注释明确"等它走完再跳，否则跳到 /login 时本地令牌可能还没清掉"（`login-out.tsx:22-25`）。
- `logout()` 本体（`use-auth.ts:70-82`）：记 `lastLoginUserId` → `queryClient.clear()` → atom token 置空 → `clearAuthStorage()` 删 localStorage 双 token → `clearMenus()` → `cacheTabs()`。

**重要事实：skyroc admin 没有调用任何后端登出接口。** `use-auth.ts:66-69` 的注释原文："这个 app 的后端没有登出接口，所以眼下只有清理这一半"。登出是纯前端本地状态清理。

### 2.7 与后端的请求/响应契约（前端视角可见部分）

| 接口 | 方法 | 入参 | 返回 data | 出处 |
|---|---|---|---|---|
| `/auth/login` | POST | `LoginParams`（grantType 联合；密码登录实传 `{ userName, password }`） | `LoginToken { token, refreshToken, expiresIn?, refreshExpiresIn? }` | `api/auth/urls.ts:5`、`types/api/auth.d.ts:113-122` |
| `/auth/refreshToken` | POST | `{ refreshToken }`（body 明文） | 同上 `LoginToken` | `api/auth/api.ts:23-31` |
| `/auth/getUserInfo` | GET | —（Bearer） | `UserInfo { userId, userName, nickname, roles[], buttons[] }` | `api/auth/urls.ts:4`、`types/api/auth.d.ts:125-136` |
| `/route/getReactUserRoutes` | GET | —（Bearer） | 动态路由表 | `api/route/urls.ts:4` |

信封统一 `{ code, data, msg }`；成功码 `'0000'`。类型注释（`types/api/auth.d.ts`）显示配套后端是 **RuoYi-Vue-Plus 风格**（租户列表 `voList`、`captcha_enabled`、`sys_client.client_id`），`.env` 的 `VITE_SERVICE_BASE_URL` 指向 Apifox mock。

---

## 3. skyroc 方案 vs fedstack 阶段 2 目标形态 · 差异对照

| 维度 | skyroc（现状） | fedstack 阶段 2（目标） | 差异性质 |
|---|---|---|---|
| accessToken 存储 | **localStorage**（`SR_token`），jotai atom 镜像 | **Zustand 内存 store，不落地**（D1/D5） | 架构决策冲突，必须改写 |
| refreshToken 存储 | **localStorage**（`SR_refreshToken`），JS 可读 | **HttpOnly Cookie**，JS 不可读（D5） | 架构决策冲突，必须改写 |
| 刷新请求形态 | POST body 明文带 refreshToken | POST `/auth/refresh` 空 body + `withCredentials` 靠 Cookie | 契约不同，adapter 改写 |
| 刷新触发 | 业务码 `9999/9998/3333`（信封 code） | HTTP **401**（`PUBLIC_SERVICE_EXPIRED_TOKEN=401`） | 配置差异，机制可复用 |
| 信封成功码 | `'0000'`（字符串） | `200`（HTTP 状态码回声） | 配置差异 |
| 刷新并发去重 | 模块级 `inFlight` + 1s 复用窗口 | 同机制（`@fedstack/service` 已移植同一实现） | **直接复用** |
| 防刷新死锁 | `refreshTokenUrl` 必填 + `isTokenRefreshRetry` | 同机制 | **直接复用** |
| 客户端状态库 | **jotai**（atom + setAtomValue） | **Zustand**（D1） | 必须改写 |
| 路由 context 注入 | RouterProvider 动态注入 | 同方案（计划 §1.3 已锁定） | **直接复用** |
| 未登录跳转目标 | `/login-out` 中间路由（先清理再跳 /login） | adapter 内 `resetAuth()` + 直跳 `/login` | 可简化：fedstack 登出清理无异步后端调用之外的重状态 |
| 登出 | **纯前端清理，无后端登出接口** | **POST /auth/logout**（Bearer），先服务端删会话再清本地 | 必须新增调用 |
| 登录表单 | userName + password（无验证码/租户实传） | tenantCode + username + password + 条件验证码 + MFA 分支 | 契约不同，页面重写 |
| 用户信息 | `GET /auth/getUserInfo`，React Query Infinity 缓存 | `GET /auth/profile`，React Query | 形状相似，字段不同 |
| 刷新后页面刷新 | localStorage 有 token，无需续签 | 内存丢失 → 根路由 `beforeLoad` 调 `/auth/refresh` 静默续签 | 新增环节（Cookie 方案的配套动作） |
| 菜单/权限 | 守卫内含静态权限判定 + 动态路由表 | 阶段 5 才做，阶段 2 守卫只判登录态 | 不迁移（本阶段） |

---

## 4. 迁移映射：skyroc 模块 → fedstack 落点

### 4.1 直接复用思路（机制不变，代码已在或将在 @fedstack/service）

| skyroc 源 | 机制 | fedstack 落点 |
|---|---|---|
| `packages/@core/service/src/request/create-request.ts` | Adapter 模式请求工厂 | `packages/web/service`（已存在同构实现） |
| `packages/@core/service/src/request/token-refresh.ts` | 模块级 inFlight 去重 + 复用窗口 | 同上，已移植 |
| `packages/@core/service/src/request/error-handler.ts` | 业务码分岔（刷新/登出/弹窗登出）+ errMsgStack 去重 | 同上，已移植 |
| `apps/admin/src/features/router/RouterProvider.tsx` | context 动态注入登录态 | `apps/admin/src/features/router/RouterProvider.tsx`（阶段 1 已就位，阶段 2 接 auth store） |
| `apps/admin/src/features/router/router-ref.ts` | 哑模块切断 adapter → router 循环依赖 | 同名文件已就位 |
| `apps/admin/src/pages/__root.tsx` beforeLoad 补拉用户态 | 刷新页面后初始化 | `pages/__root.tsx` beforeLoad 改为「无 token 时调 `/auth/refresh` 续签」（计划 §2.10） |

### 4.2 因 D1 / D2 / D5 必须改写

| skyroc 源 | 改写点 | fedstack 落点 |
|---|---|---|
| `apps/admin/src/features/auth/use-auth.ts`（jotai + localStorage） | 整体换成 Zustand 纯内存 store，只存 accessToken | `apps/admin/src/store/auth.ts`（计划 §2.6） |
| `apps/admin/src/service/adapter.ts` | `getRefreshToken()` 返回空串；`fetchRefreshToken()` 改 POST `/auth/refresh` + `withCredentials`，返回 `{ token, refreshToken: 'cookie' }`；`setAuth` 只存 accessToken；`redirectToLogin` 直跳 `/login` | `apps/admin/src/service/adapter.ts`（计划 §2.3） |
| `apps/admin/src/service/request/index.ts` | codes 换成 `PUBLIC_*` 环境变量；`axiosConfig` 加 `withCredentials: true` | `apps/admin/src/service/request.ts`（计划 §2.4） |
| `apps/admin/src/service/api/auth/api.ts` + `urls.ts` | 接口对齐 admin-api 契约：`/auth/captcha`、`/auth/login`（联合返回含 mfaRequired）、`/auth/mfa/verify`、`/auth/refresh`、`/auth/profile`、`/auth/logout`（计划 §2.8） | `apps/admin/src/service/api/auth.ts` |
| `apps/admin/src/pages/(auth)/login/index.tsx` | 表单加 tenantCode；失败阈值后出验证码；`mfaRequired` 分支弹 MFA 输入 | `apps/admin/src/pages/(auth)/login/index.tsx`（计划 §2.9） |
| `apps/admin/src/features/router/guard.ts` | 阶段 2 只保留「未登录 → /login?redirect=...」；权限/菜单判定留给阶段 5 | `apps/admin/src/features/router/guard.ts`（已预留） |
| `use-auth.ts` 的 `logout()` | 增加 **先调 POST /auth/logout 再清本地**（顺序不能反：先清了请求带不上 Authorization）；fedstack 有真实登出接口 | auth store 的 logout action |

### 4.3 不迁移

| skyroc 内容 | 原因 |
|---|---|
| `code-login.tsx` / `register.tsx` / `reset-pwd.tsx` 三个子页 | skyroc 侧本身就是 UI 占位（code-login 提交不调接口）；fedstack 阶段 2 无此需求 |
| 演示账号快捷登录（super/admin/user 按钮） | 面向模板的演示功能 |
| `initMenus` / 动态路由表 `/route/getReactUserRoutes` | 阶段 5（权限与动态菜单）再议 |
| `lastLoginUserId` 换账号清 tab 缓存逻辑 | 依赖 globalTabs（阶段 3 标签页），届时再评 |
| modalLogout 码体系（7777/7778） | admin-api 契约无此概念，`codes.modalLogout: []` 置空即可（计划 §2.4） |
| `demoRequest` / `VITE_OTHER_SERVICE_BASE_URL` 多 baseURL 体系 | 阶段 2 单一后端 |
| jotai devtools（`@shell/devtools/jotai`） | 状态库换成 Zustand |

---

## 5. 未能从源码确认的事项

1. **skyroc 配套后端的真实行为**：前端只能看出契约形状（信封、码值、URL），`.env` 指向的是 Apifox mock；类型注释指向 RuoYi-Vue-Plus 系后端，但该后端不在本仓库内，实际签发/轮换语义无法确认。
2. **`expiresIn` 主动续签**：类型注释写"据此提前续签，不用等一次 401"（`types/api/auth.d.ts:115`），但 apps/admin/src 无任何消费代码，不能确认这是废弃设计还是留给使用方的钩子。
3. **WebSocket/SSE 的刷新接入**：`token-refresh.ts:13` 注释声称 inFlight 为 HTTP/WS/SSE 共享设计，但 apps/admin 内未见 WS/SSE 代码，实际收益无法验证。
4. **`globalConfig.defaultHome` 的解析链路**：守卫依赖 `context.getHomeRoute()`，其定义在 `@shell/layouts` / `@/config`，属布局包内部，与认证主线关系不大，未深入。

---

## 附：源码文件索引（skyroc 仓库相对路径）

| 文件 | 职责 |
|---|---|
| `apps/admin/src/pages/(auth)/login/index.tsx` | 登录页（userName/password 表单） |
| `apps/admin/src/pages/(auth)/login/layout.tsx` | 登录布局：已登录跳走、redirect 参数 zod 校验 |
| `apps/admin/src/pages/(auth)/login-out.tsx` | 登出中间路由：先清理再跳 /login |
| `apps/admin/src/features/auth/use-login.ts` | 登录提交编排（mutation → setAuth → initAuth → 跳转） |
| `apps/admin/src/features/auth/use-auth.ts` | 认证状态（jotai atom + localStorage 读写 + logout） |
| `apps/admin/src/service/adapter.ts` | RequestAdapter 实现（token 存取、跳转、UI 反馈） |
| `apps/admin/src/service/request/index.ts` | createAppRequest 实例 + 错误码注入 |
| `apps/admin/src/service/api/auth/{api,urls,hooks,keys}.ts` | 登录/刷新/用户信息的请求与 React Query 封装 |
| `apps/admin/src/features/router/guard.ts` | guardAdminRoute（登录态 + 用户态 + 静态权限） |
| `apps/admin/src/features/router/{index,RouterProvider,router-ref}.ts(x)` | router 创建、context 动态注入、循环依赖切断 |
| `apps/admin/src/pages/__root.tsx` / `pages/index.tsx` | 根路由 beforeLoad 初始化、`/` 分流 |
| `apps/admin/src/utils/storage.ts` / `types/storage.d.ts` | localStorage 封装（`SR_` 前缀）与键类型 |
| `packages/@core/service/src/request/{create-request,token-refresh,error-handler,shared,types}.ts` | 平台无关请求层：信封判定、刷新去重、错误分岔、Adapter 接口 |
| `packages/@core/axios/src/{index,options,shared,constant}.ts` | axios 封装：拦截器、共享 AbortController、X-Request-Id |
| `packages/web/admin/types/api/auth.d.ts` | `Api.Auth` 契约类型（LoginParams 联合、LoginToken、UserInfo） |
