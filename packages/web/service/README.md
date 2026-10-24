# @fedstack/service

平台无关的请求 & 查询基础设施 —— 通过 **Adapter 模式**把「平台差异」（怎么弹提示、怎么存 token、怎么跳路由）抽象成一个接口，让错误处理、token 续签、QueryClient 配置这些逻辑在所有端只写一次。

> 一句话：`@fedstack/axios` 解决「怎么发请求」，这个包解决「请求出了各种状况怎么办」——业务错误分流、token 过期自动续签、错误消息去重、接口加密，全部在一个地方收口。

**这份文档面向第一次接触这个包的读者**：每个概念都从「没有它会多痛」讲起，配一个能直接抄的例子。想查 API 的老手直接跳到 [API 参考](#api-参考)。

## 目录

- [它解决什么问题](#它解决什么问题)
- [快速上手](#快速上手)
- [核心概念](#核心概念)
  - [Adapter：平台差异的翻译官](#1-adapter平台差异的翻译官)
  - [后端信封契约：code 和 bizCode 谁说了算](#2-后端信封契约code-和-bizcode-谁说了算)
  - [错误分流：四种业务码，四种命运](#3-错误分流四种业务码四种命运)
  - [token 自动续签](#4-token-自动续签)
  - [错误消息去重](#5-错误消息去重)
  - [QueryClient 统一配置](#6-queryclient-统一配置)
- [接口传输加密](#接口传输加密)
- [最佳使用方式](#最佳使用方式)
- [API 参考](#api-参考)

## 它解决什么问题

想象你在给一个中后台项目写请求层。第一天很顺利，`axios.create()` 加一个拦截器就完事了。然后现实来了：

```text
第 2 周  后端说「token 过期会返回业务码 9999，你们前端自己续签」
        → 你在响应拦截器里写了刷新逻辑，发现 5 个请求同时过期时刷新了 5 次，
          第 2 次刷新把第 1 次换到的 token 顶废了，用户莫名其妙被踢回登录页

第 4 周  测试说「列表加载失败时连弹了 3 条一模一样的报错」
        → 你给 message.error 加了个全局去重变量

第 6 周  老板说「这套东西 App 端也要用」
        → 你发现错误处理里写死了 antd 的 message/modal，token 存取写死了
          localStorage，登出跳转写死了 react-router，React Native 一个都用不了
```

问题不在你写得不好，而在于**「业务逻辑」（什么情况该登出、什么情况该续签）和「平台能力」（用什么弹窗、token 存哪）被搅拌在了一起**。这个包把它们分开：

```text
┌──────────────────────────────────────────────────────┐
│                  @fedstack/service                   │
│                                                      │
│  业务逻辑（本包提供，跨端复用）                          │
│  ┌──────────────────┐   ┌─────────────────────────┐  │
│  │  createAppRequest │   │   createQueryClient     │  │
│  │  · 业务错误分流    │   │  · 默认 query/mutation  │  │
│  │  · token 自动续签  │   │    配置                 │  │
│  │  · 错误消息去重    │   │  · 统一错误回调入口      │  │
│  └───────┬──────────┘   └─────────────────────────┘  │
│          │ 依赖                                        │
│          ▼                                            │
│  ┌───────────────┐                                    │
│  │ RequestAdapter │ ◄── 平台能力（你来实现，每端一份）  │
│  │ 弹窗/存token/  │                                    │
│  │ 跳路由/翻译    │                                    │
│  └───────────────┘                                    │
└──────────────────────────────────────────────────────┘
```

你的业务代码只跟 `request()` 打交道，永远不需要知道 token 快过期了、报错弹没弹过——这些都收口在这一个包里。

## 快速上手

场景设定：你在写一个 antd + TanStack Router 的 admin 后台，有**登录页**和**用户列表页**，后端返回统一信封（下一节会讲什么是信封）。目标：让用户列表页发出第一个请求。

### 前提

```ts
import { createAppRequest, createQueryClient } from '@fedstack/service';
```

`@tanstack/react-query` 是这个包的 peer dependency（同伴随依赖：包声明「需要它」，但由你的应用自己安装，避免一个应用里出现两个 React Query 实例互相看不到缓存）。

### 第 1 步：实现平台 Adapter

Adapter 是「适配器」：本包不知道你在用 antd 还是 RN、token 存 localStorage 还是 AsyncStorage，它只定义「我需要这些能力」，由你的平台实现一份。一共 5 类方法，先看完整个例子，再逐个解释：

```ts
// apps/admin/src/service/adapter.ts
import type { RequestAdapter } from '@fedstack/service';
import { message, Modal } from 'antd';
import { setAuth } from '@/features/auth/use-auth';
import { router } from '@/features/router';
import { $t } from '@/locales';
import { localStg } from '@/utils/storage';
import { fetchRefreshToken } from './api';
import { AUTH_URLS } from './api/auth/urls';

export const antdAdapter: RequestAdapter = {
  // ---- UI 反馈：错误怎么展示 ----
  showErrorMessage(msg, onClose) {
    // 有 onClose 时要透传：错误消息去重靠它回收栈位（见「错误消息去重」）
    message.error({ content: msg, onClose });
  },
  showErrorModal(options) {
    // 确认和取消都算 onConfirm：弹窗只是告知，登出动作不依赖用户选哪个
    Modal.error({ ...options, onCancel: options.onConfirm });
  },

  // ---- Auth：认证信息存哪 ----
  getToken: () => localStg.get('token') || null,
  getRefreshToken: () => localStg.get('refreshToken') || null,
  setAuth: tokens => setAuth(tokens),
  resetAuth() {
    localStg.remove('token');
    localStg.remove('refreshToken');
  },

  // ---- token 续签：怎么换新 token ----
  async fetchRefreshToken(refreshToken) {
    const data = await fetchRefreshToken(refreshToken);
    return { token: data.token, refreshToken: data.refreshToken };
  },
  // 必须和上面这个函数实际请求的 url 是同一个（原因见「token 自动续签」）
  refreshTokenUrl: AUTH_URLS.REFRESH_TOKEN,

  // ---- 导航：登出后跳哪 ----
  getCurrentPath: () => router.state.location.href,
  redirectToLogin: path => router.navigate({ to: '/login', search: { redirect: path } }),

  // ---- i18n：内置文案怎么翻译 ----
  t: key => $t(key),
};
```

逐个方法说「为什么需要它」：

| 方法                | 包在什么时候调它                                                                                                   | 没有它会怎样                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `showErrorMessage`  | 业务错误兜底弹 toast                                                                                               | 报错了用户一无所知                 |
| `showErrorModal`    | 「强制下线」类错误需要弹窗确认                                                                                     | 弹窗和 toast 量级不分              |
| `getToken`          | **每个请求发出前**拼 `Authorization: Bearer <token>` 头（`Bearer` 是 HTTP 认证方案的固定前缀，表示「持此令牌者」） | 你得在每个 api 调用处手动加 token  |
| `getRefreshToken`   | token 过期去续签时                                                                                                 | —                                  |
| `setAuth`           | 续签成功，写回新 token                                                                                             | —                                  |
| `resetAuth`         | 登出/续签失败，清掉凭据                                                                                            | 带着废 token 停在登录页死循环      |
| `fetchRefreshToken` | 真正发续签请求的那个函数                                                                                           | —                                  |
| `refreshTokenUrl`   | 识别「拿到过期码的是续签请求自己」                                                                                 | 续签请求自己过期时会把自己永久挂起 |
| `getCurrentPath`    | 跳登录页时带上 `?redirect=` 方便回跳                                                                               | —                                  |
| `redirectToLogin`   | 登出后跳转                                                                                                         | 路由库就被硬编码进包了             |
| `t`                 | 内置文案（如「登录已过期」）走你的 i18n                                                                            | 文案语言不可控                     |

> ⚠️ **两个必须遵守的约定**
>
> - `getToken` / `getRefreshToken` **必须同步**。存储层是异步的平台（RN 的 `AsyncStorage`）要在 App 启动时先读进内存，adapter 里只做取值——请求拦截器是同步钩子，等不了 Promise。（拦截器：axios 提供的钩子，在请求发出前 / 响应返回后统一插入逻辑，见 [axios 文档](https://axios-http.com/docs/interceptors)。）
> - `refreshTokenUrl` 是**必填**而不是靠自觉加标记：漏标记得等到 refresh token 也过期那天才发作（页面转圈不动），这个字段漏了是编译错误。

### 第 2 步：创建请求实例

```ts
// apps/admin/src/service/request/index.ts
import { createAppRequest } from '@fedstack/service';
import { antdAdapter } from '../adapter';

export const request = createAppRequest({
  adapter: antdAdapter,
  // 和后端约定的业务状态码，下面马上讲
  codes: {
    success: '200',
    logout: ['8888', '8889'],
    modalLogout: ['7777', '7778'],
    expiredToken: ['9999', '9998', '3333'],
  },
  axiosConfig: {
    baseURL: '/api',
  },
});
```

### 第 3 步：发出第一个请求

```ts
// apps/admin/src/service/api/user.ts
import { request } from '../request';

export interface UserInfo {
  id: string;
  nickname: string;
  email: string;
}

export function fetchUserList() {
  return request<UserInfo[]>({ url: '/system/user/list' });
}
```

业务代码拿到的 `UserInfo[]` 已经是**拆过信封的纯数据**——不需要写 `res.data.data.list` 这种层层取值。token 注入、错误提示、过期续签全部自动发生。

### 第 4 步（可选）：接入 React Query

如果你的应用用 React Query 管理服务端状态，用它创建一个带统一默认配置的 QueryClient：

```ts
// apps/admin/src/service/queryClient.ts
import { createQueryClient } from '@fedstack/service';

export const queryClient = createQueryClient({
  queryCache: {
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error('Query error:', error);
      }
    },
  },
});
```

```tsx
// apps/admin/src/main.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { queryClient } from './service/queryClient';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
```

至此请求层接入完成。下面逐个讲清背后的概念，让你知道每一步到底买到了什么。

## 核心概念

### 1. Adapter：平台差异的翻译官

**痛点**：错误处理写死 antd，RN 没法复用；token 存取写死 localStorage，换个存储就重写；登出跳转写死某个路由库，换框架要改所有 catch 分支。

**方案**：包只定义接口（interface），平台实现接口。包内的逻辑只调 `adapter.showErrorMessage(...)`，不关心那背后是 antd 的 `message` 还是 RN 的 `Alert`。

**实例**：同一个「登录已过期」的登出逻辑——

- 在 antd admin 里：弹一条红色 toast，跳 `/login`；
- 在未来的 RN App 里：弹一个原生 Alert，navigate 到 `LoginScreen`。

业务判断（「什么码该登出」）一行没改，只换了 adapter 实现。这也是为什么本包的核心逻辑可以**脱离任何 UI 框架独立测试**——测试里塞一个内存版假 adapter 就行。

### 2. 后端信封契约：code 和 bizCode 谁说了算

**信封（envelope）**指后端给每个响应套的统一包装。本包默认按 admin-api 的信封格式工作：

```ts
interface BackendEnvelope<T = any> {
  bizCode?: string | number; // 业务状态码（可选）
  code: string | number; // HTTP 状态码的回声
  data: T; // 真正的业务数据
  message: string; // 人类可读文案
}
```

看三个真实响应。

① 成功——`code` 是 HTTP 状态码 200 的回声，业务码缺省：

```json
{
  "code": 200,
  "data": [{ "id": "1", "nickname": "张三" }],
  "message": "ok"
}
```

② 业务失败——HTTP 是 200，但 `bizCode` 说 token 过期了：

```json
{
  "code": 200,
  "bizCode": 9999,
  "data": null,
  "message": "登录状态已过期"
}
```

③ 纯 HTTP 失败——409 冲突，HTTP 状态码本身已表达失败，不需要 `bizCode`：

```json
{
  "code": 409,
  "data": null,
  "message": "用户名已存在"
}
```

分流规则一句话：**`bizCode` 优先，缺失时回落 `code`**。也就是「先看有没有业务码，没有就信 HTTP 状态码」。成功判断等价于：

```ts
const isSuccess = String(response.data.bizCode ?? response.data.code) === '200';
```

为什么这样设计？像 409 冲突这种失败，HTTP 状态码语义已经足够，后端不必再造一个业务码；而「token 过期」「强制下线」是**业务语义**（HTTP 层面它们是成功的 200 响应），只能靠 bizCode 精确表达。两套语义各走各的通道，互不抢含义。

> 💡 你的后端信封长得不一样？`createAppRequest` 的 `isBackendSuccess`（成功判断）和 `transform`（取数方式）两个选项可以整体换掉默认逻辑，见 [API 参考](#api-参考)。

### 3. 错误分流：四种业务码，四种命运

**痛点**：没有分流时，每个 catch 分支都要自己判断「这是要登出的错？要弹窗的错？还是 toast 一下就行？」——判断散落全项目，改一个码要改几十处。

**方案**：`createAppRequest` 的 `codes` 选项声明四类业务码，包按码自动分流：

| 后端返回                     | 包的行为                                                                 | 用户看到什么               | 你要写什么代码                                             |
| ---------------------------- | ------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------- |
| `logout` 码（如 8888）       | 弹一条提示 → `resetAuth()` 清凭据 → 跳登录页（带 `?redirect=` 回跳地址） | 一条 toast，然后回到登录页 | **什么都不用写**                                           |
| `modalLogout` 码（如 7777）  | 弹一个不可点遮罩关闭的弹窗 → 确认（或取消）后同上                        | 一个弹窗，确认后回登录页   | **什么都不用写**                                           |
| `expiredToken` 码（如 9999） | 自动刷新 token → 用新 token **重发原请求**，把重试结果交回调用方         | 无感知，页面照常加载       | **什么都不用写**                                           |
| 其他码（如 409、500）        | 抛出错误，由 onError 兜底弹一条 toast                                    | 一条错误 toast             | **什么都不用写**，要特殊处理（如表单冲突高亮）再自己 catch |
| 网络断开 / 超时（无响应）    | 弹 axios 的错误文案                                                      | 一条错误 toast             | 同上                                                       |

一个具体的推演。用户列表页发出请求，后端返回：

```json
{
  "code": 200,
  "bizCode": 8888,
  "data": null,
  "message": "该账号已在别处登录"
}
```

因为 `8888` 配在 `codes.logout` 里，包会：调 `adapter.showErrorMessage('登录已过期')` → 调 `adapter.resetAuth()` 清掉本地 token → 调 `adapter.redirectToLogin('/system/user?...')` 跳回登录页并带上回跳地址。你的 `fetchUserList()` 调用方收到一个 rejected promise，但不需要任何处理—— toast 已经弹过了。

> 💡 **弹过的提示不会弹第二次**：登出/弹窗登出码的提示由分流逻辑负责，兜底的 onError 会跳过它们；`expiredToken` 码也完全不弹（正在静默续签，弹错误反而误导）。

> ⚠️ 登出和续签失败都由本包调 `adapter.resetAuth()` 清凭据，`redirectToLogin` 只负责「跳到哪」。平台**不必**在路由守卫里再清一遍（清了也无妨，约定上它是幂等的）。

### 4. token 自动续签

**痛点**：token 过期是最高频的「假故障」。朴素实现「遇到 9999 就调续签接口」在真实场景会连环爆炸——看一个真实推演：

用户打开 Dashboard 页，页面同时发出 5 个请求。此刻 token 刚好过期，5 个响应都带着 `bizCode: 9999` 回来。如果每个请求各自去续签：

```text
请求A → 续签(旧refreshToken) → 成功，换新token
请求B → 续签(旧refreshToken) → 失败！refreshToken 已被 A 轮换
请求C → 同上失败 → 触发登出 → 用户莫名其妙被踢回登录页
```

**方案**：本包的续签有三层并发守卫，上面这个场景里 5 个请求**共享同一次续签**：

```text
5 个响应同时拿到 9999
    │
    ▼
第 1 个到达的请求发起续签（全局唯一在途单例）
其余 4 个 await 同一次续签的 Promise
    │
    ▼ 续签成功
5 个请求各自用新 token 重发原请求，调用方拿到正常数据
```

三层守卫分别是：

1. **在途单例**：同一时刻全应用最多一次刷新。它是模块级的而不是挂在某个请求实例上——HTTP、WebSocket、SSE 用的是同一次登录的凭据，各刷各的就会重演上面的轮换事故。
2. **1 秒复用窗口**：刚刷完的 token 在 1 秒内被直接复用。过期码经常连环触发（一个页面十几个请求），窗口期内它们不会一人再打一次续签接口。
3. **重入守卫**：续签后重发的请求带 `isTokenRefreshRetry` 内部标记，如果重发还是失败（比如刷完了但权限就是不够），不再触发第二次刷新，直接走登出——否则第二次起会命中 1 秒复用窗口，连网络往返都没有，变成纯热循环重发。

**对你的两个要求**（都在 adapter 那一节出现过，这里解释为什么）：

- `refreshTokenUrl` 必须填对。它用来识别「拿到过期码的是续签请求自己」——这种请求绝不能再去续签，否则它会 `await` 自己那次还没完成的刷新，把自己和所有等着刷新的请求**一起永久挂起**（不是报错，是页面转圈不动）。续签走的 url 跟它对不上时（网关重写、换域名），在续签请求的配置上补一个 `isRefreshToken: true`。
- 登出/续签失败后跳登录页，是包来调 `resetAuth` + `redirectToLogin` 的，平台不用自己串这两个动作。

**其他传输通道（WebSocket / SSE）拿到过期码时**，不要自己调 `adapter.fetchRefreshToken`（那样和 HTTP 的刷新没有去重，第二个刷新必定失败），调本包导出的 `refreshToken`：

```ts
import { refreshToken } from '@fedstack/service';
import { antdAdapter } from './adapter';

async function reconnectWithFreshToken() {
  const success = await refreshToken(antdAdapter);
  if (success) {
    // 用新 token 重建连接
  }
}
```

测试里要模拟「强制重刷」或隔离用例时，用 `resetTokenRefresh()` 清掉单例和复用窗口。

### 5. 错误消息去重

**痛点**：列表页加载时发了 3 个请求，后端挂了，3 个响应都是 500——用户屏幕上叠了 3 条一模一样的「服务器开小差了」。

**方案**：`showErrorMsg` 内部维护一个 `errMsgStack`（正在展示中的消息栈）。同一条文案在展示期间不会重复弹出；消息关闭时通过 `onClose` 回调把自己从栈里摘掉，之后同样的错误可以再次弹出。

```text
3 个 500 响应同时回来，message 都是「服务器开小差了」
    │
    ▼
第 1 条：栈里没有 → 入栈 → 弹 toast
第 2、3 条：栈里已有 → 直接丢弃
    │
    ▼ toast 关闭（用户关掉或自动消失）
onClose 回调 → 出栈 → 下次同样的错误能再弹
```

> ⚠️ **adapter 里记得透传 `onClose`**。它是可选的，平台可以不回调（RN 的 `Alert.alert` 就没有这个回调）——所以包内还有一道 5 秒看门狗兜底：到点自动出栈，不会因为漏回调导致某类错误**永远**弹不出来。但透传了 `onClose` 的平台，栈位回收更及时、去重语义更准确（看门狗的定时器也会被清掉）。

这个栈也挂在实例上暴露出来（`request.state.errMsgStack`），调试时可以直接查看当前有哪些消息在展示。

### 6. QueryClient 统一配置

**痛点**：每个项目的 React Query 默认值各配各的——这个项目 `staleTime: 0` 导致切换路由就重新请求，那个项目忘了关 `refetchOnWindowFocus`，切个窗口全页面重新加载。

**方案**：`createQueryClient` 把一套经过实战的默认值收口成包级配置，所有项目开箱一致。

两个关键术语一句话解释（详细语义见 [React Query 文档](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)）：

- **staleTime**：数据「保鲜期」。30 秒内同一个 query 再次挂载不会重新请求，直接用缓存。
- **gcTime**：缓存的「垃圾回收时间」。一个 query 没有任何组件在用之后，缓存再保留 10 分钟才清除——这段时间内回到页面能秒开。

内置默认值：

| Query                  | 值                      | Mutation       | 值                 |
| ---------------------- | ----------------------- | -------------- | ------------------ |
| `staleTime`            | 30s                     | `gcTime`       | 60s                |
| `gcTime`               | 10min                   | `retry`        | 1                  |
| `retry`                | 2（指数退避，上限 30s） | `retryDelay`   | 指数退避，上限 10s |
| `refetchOnWindowFocus` | `false`                 | `networkMode`  | `'online'`         |
| `refetchOnMount`       | `true`                  | `throwOnError` | `false`            |
| `refetchOnReconnect`   | `true`                  |                |                    |
| `networkMode`          | `'online'`              |                |                    |
| `throwOnError`         | `false`                 |                |                    |

**实例**：你项目里的「操作日志」页面数据几乎不变，30 秒保鲜期太短，想改成 5 分钟——只覆盖这一项，其余保持包级默认：

```ts
// apps/admin/src/service/queryClient.ts
import { createQueryClient } from '@fedstack/service';

export const queryClient = createQueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});
```

`defaultOptions` 与内置默认值**浅合并**：`queries` 里的字段逐项覆盖，不会因为传了 `queries` 就把整个 queries 默认块替换掉。

`createQueryClient` 同时挂在主入口和 `@fedstack/service/query` 子入口：只有 QueryClient 需求的场景引子路径，依赖面更窄。默认配置常量（`DEFAULT_QUERY_CONFIG` / `DEFAULT_MUTATION_CONFIG`）也从 `./query` 导出，方便你比对「我覆盖了哪些」。

## 接口传输加密

> 子入口：`@fedstack/service/crypto`（主入口不导出加密，原因见本节末尾「边界与选型」）。

**痛点**：登录、改密码这类接口，密码会以**明文**出现在浏览器 devtools 的 Network 面板、网关访问日志、抓包工具里。HTTPS 防的是传输链路，防不住这些「落点」。

**方案**：给个别敏感接口加一层传输加密——请求体用一次性 AES 密钥加密，AES 密钥再用后端 RSA 公钥加密后放进请求头。只有持私钥的后端能解开。

### 装配（每个应用一次）

```ts
// apps/admin/src/service/request/index.ts
import { createAppRequest } from '@fedstack/service';
import { createRequestSealer } from '@fedstack/service/crypto';
import { antdAdapter } from '../adapter';

const sealRequest = createRequestSealer({
  // 密钥头的名字，前后端约定一致，改要一起改
  header: import.meta.env.VITE_API_CRYPTO_HEADER,
  // 后端 RSA 公钥（PEM），后端持有配对的私钥
  publicKey: import.meta.env.VITE_API_CRYPTO_PUBLIC_KEY,
});

export const request = createAppRequest({
  adapter: antdAdapter,
  codes: {
    success: '200',
    logout: ['8888', '8889'],
    modalLogout: ['7777', '7778'],
    expiredToken: ['9999', '9998', '3333'],
  },
  sealRequest,
});
```

公钥从环境变量注入。PEM 是多行文本，环境变量装不下换行，写成字面量 `\n` 的单行形式即可，`importPublicKey` 会自动规整。

### 使用（每个敏感接口一行）

```ts
// apps/admin/src/service/api/auth/index.ts
import { request } from '../../request';

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
}

export function fetchLogin(params: LoginParams) {
  return request<LoginResponse>({
    data: params,
    encrypt: true, // ← 就这一行，没加的接口不进加密逻辑
    method: 'post',
    url: '/auth/login',
  });
}
```

标记写在调用处（`encrypt: true`）而不是按 url 配一张名单——名单和接口分处两地，加接口的人不会想起来去改它。

### 报文格式

两层信封，RSA 只用来传一次性 AES 密钥（非对称算法有明文长度上限而且慢，包不了 body）：

```text
密钥头  base64( RSA-OAEP-SHA256(服务端公钥, aesKey) )        ← 头的名字由 header 配置
请求体  base64( nonce(12B) ‖ AES-256-GCM(aesKey, 明文 JSON) ‖ tag(16B) )
```

和后端的 `API_CRYPTO_*` 配置是同一份契约。请求体的 Content-Type 会被声明成 `text/plain`——它现在是一段 base64，标成 `application/json` 会让网关和 WAF 按 JSON 去解析它。

### 边界与选型

- **先想清楚它挡的是什么。** 公钥在前端 JS 里，AES 密钥也是前端生成的，攻击者照样构造得出合法密文。它挡的是**明文落到日志和抓包里**，不是主动攻击，别把它当成认证或授权的替代。
- **只加密请求，不解密响应。** 单纯是还没做：forge 是同步的，接 `isBackendSuccess` 这种同步钩子没有障碍，缺的是实现和后端对应的响应信封格式。
- **两种「没配好」的后果不同**：
  - 根本没传 `sealRequest`（没引 crypto）：标了 `encrypt: true` 的请求**原样发出**——这是给没有加密需求的部署留的明路；
  - 传了 `sealRequest` 但漏配 `publicKey`：标了 `encrypt: true` 的请求**发出前直接抛错**。配了一半的部署不会安静地把密码明文发出去。
- **FormData / 二进制请求体不支持**（加密器只认 JSON 文本），上传文件的接口去掉 `encrypt: true`。
- **为什么是 node-forge 而不是浏览器自带的 WebCrypto**：`crypto.subtle` 只在安全上下文（HTTPS 或 localhost）里存在。用 `http://192.168.x.x:5173` 这种局域网地址访问开发服务器时浏览器不提供它，整条加密链路直接不可用——手机和同事的电脑都进不来。forge 是纯 JS 实现，不挑上下文，代价是约 90KB gzip 和慢一些的 RSA（一次登录几十毫秒）。
- **加密不在主入口**：node-forge 会 `require('crypto')`，进主入口会让 React Native 这类没有 node 内置模块的运行时连包都打不出来——而这些端根本不需要加密。所以需要加密的端从 `@fedstack/service/crypto` 单独引。

## 最佳使用方式

### 标准接入清单

一个新应用从零接入，推荐按这个顺序做，每步都可验证：

**① 目录摆法**（以 apps/admin 为例）：

```text
src/service/
├── adapter.ts            # 平台 Adapter 实现（第 1 步）
├── request/
│   └── index.ts          # createAppRequest 实例（第 2 步）
├── queryClient.ts        # createQueryClient 实例（可选）
└── api/                  # 按领域划分的 api 函数
    ├── auth/
    │   ├── index.ts      # fetchLogin / fetchRefreshToken
    │   └── urls.ts       # AUTH_URLS 常量
    └── user.ts
```

**② 初始化顺序**：存储层就绪（RN 先把 AsyncStorage 读进内存）→ auth store → adapter → `request` → `QueryClientProvider` 挂载。`request` 是模块级单例，整个应用共享一个实例，不要在组件里再 `createAppRequest` 第二次。

**③ 环境变量**：

```bash
# .env
VITE_API_BASE_URL=/api
# 加密只在有需求的部署配置；两个必须同时有或同时没有
VITE_API_CRYPTO_HEADER=X-Encrypted-Key
VITE_API_CRYPTO_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
```

**④ 和后端对齐的契约清单**（少一项都会出事故）：

- [ ] 信封格式：`{ bizCode?, code, data, message }`
- [ ] 四类业务码的具体值（`success` / `logout` / `modalLogout` / `expiredToken`）
- [ ] 续签接口的 url（与 adapter 的 `refreshTokenUrl` 完全一致）
- [ ] 加密的密钥头名字（`header`）与 RSA 公钥

### Do / Don't

| ❌ 不要                                                        | ✅ 要                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 在组件里 `axios.create()` 自己的实例                           | 统一走 `request`，认证头和错误分流才会生效                                           |
| 业务代码 catch 后手动 `message.error`                          | 交给分流兜底弹；只有要做特殊处理（表单高亮、静默轮询）才自己 catch                   |
| WebSocket / SSE 拿到过期码时自己调 `adapter.fetchRefreshToken` | 调包导出的 `refreshToken(adapter)`，和 HTTP 共享同一次刷新                           |
| 在 RN 的 adapter 里直接 `AsyncStorage.getItem`（异步）         | 启动时先读进内存，`getToken` 同步取值                                                |
| 给每个 api 函数手动加 `Authorization` 头                       | 什么都不用加，请求拦截器自动注入                                                     |
| 上传文件的 FormData 接口标 `encrypt: true`                     | 去掉标记，加密只支持 JSON 请求体                                                     |
| 打开 `retry` 但不配幂等判断                                    | 带上 `axios-retry` 的 `isNetworkOrIdempotentRequestError`，否则下单/支付会被重复提交 |
| 在路由守卫里再清一遍 token 才跳登录页                          | 交给包调 `resetAuth()`；`redirectToLogin` 只管跳转                                   |
| 靠记性好给续签请求加 `isRefreshToken`                          | 把 `refreshTokenUrl` 填对，url 对不上的特殊场景才补标记                              |

## API 参考

### `createAppRequest(options)`

```ts
interface CreateRequestOptions {
  adapter: RequestAdapter; // 平台适配器（必填）
  codes: ServiceCodes; // 后端业务状态码（必填）
  axiosConfig?: CreateAxiosDefaults; // axios 基础配置
  requestIdKey?: string | false; // 请求 id 的 header 名，默认 'X-Request-Id'，传 false 不发送
  retry?: IAxiosRetryConfig; // axios-retry 配置，默认不重试
  sealRequest?: RequestSealer; // 请求体加密器（见「接口传输加密」）
  isBackendSuccess?: (response: { data: BackendEnvelope }) => boolean; // 自定义成功判断
  transform?: (response: any) => any; // 自定义响应转换
}
```

返回值与 `@fedstack/axios` 的 `createRequest` 一致，是一个可直接调用的函数：

```ts
import { createAppRequest } from '@fedstack/service';

const request = createAppRequest({ adapter, codes });

// 直接调用，泛型指信封里 data 的类型
const data = await request<UserInfo>({ url: '/user/info' });

// 取消所有在途请求（如登出时）
request.cancelAllRequest();

// 访问内部状态（调试用）
console.log(request.state.errMsgStack);
```

#### 默认行为一览

| 行为       | 默认实现                                                                | 可覆盖             |
| ---------- | ----------------------------------------------------------------------- | ------------------ |
| 成功判断   | `String(response.data.bizCode ?? response.data.code) === codes.success` | `isBackendSuccess` |
| 数据转换   | `response.data.data`                                                    | `transform`        |
| 请求拦截   | 自动注入 `Bearer {token}`；加密器在最后执行（认证头不随 body 加密）     | —                  |
| 错误处理   | 根据 `codes` 分流（登出 / 弹窗 / 刷新 / toast）                         | —                  |
| 业务码规整 | 传入的码列表自动去空格、滤空项；`success` 缺省兜底 `'200'`              | —                  |

### `refreshToken(adapter)` / `resetTokenRefresh()`

`refreshToken` 是给 HTTP 之外的传输（WebSocket / SSE）共享同一次刷新的公开入口，见「token 自动续签」。`resetTokenRefresh` 清空在途单例与复用窗口，只在测试里用。

### `createQueryClient(options?)`

```ts
import type { DefaultOptions } from '@tanstack/react-query';

interface CreateQueryClientOptions {
  defaultOptions?: DefaultOptions; // 覆盖默认值（与内置值浅合并）
  mutationCache?: { onError?: unknown }; // MutationCache 配置（onError / onSuccess / onSettled / onMutate）
  queryCache?: { onError?: unknown }; // QueryCache 配置（onError / onSuccess / onSettled）
}
```

（`mutationCache` / `queryCache` 的实际类型就是 React Query 两个 Cache 构造函数的参数类型，这里简写示意；默认值明细见「QueryClient 统一配置」。）

### 入口形态

| 入口                       | 内容                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `@fedstack/service`        | `createAppRequest` / `refreshToken` / `resetTokenRefresh` / `createQueryClient` + 全部类型 |
| `@fedstack/service/crypto` | `createRequestSealer` / `importPublicKey` / `seal` + 加密类型                              |
| `@fedstack/service/query`  | `createQueryClient` + `DEFAULT_QUERY_CONFIG` / `DEFAULT_MUTATION_CONFIG` 常量              |

## 相关包

- [@fedstack/axios](../axios/README.md)：底层请求客户端工厂（统一钩子、取消、重试、请求 id）
