# @fedstack/service

平台无关的请求 & 查询基础设施 —— 通过 **Adapter 模式**注入平台差异，使错误处理、token 刷新、QueryClient 等逻辑可跨端复用。

> 一句话：`@fedstack/axios` 解决「怎么发请求」，这个包解决「请求出了各种状况怎么办」——业务错误分流、token 过期自动续签、错误消息去重、接口加密，全部在一个地方收口。

## 为什么需要它？

典型中后台项目的请求层困境：

```text
❌ 错误处理硬编码了 antd message / modal，React Native 无法复用
❌ token 刷新逻辑绑定了某个状态库 + localStorage，换个状态库就得重写
❌ 登出跳转依赖某个路由库，换框架意味着改所有 catch 分支
❌ 独立测试需要 mock 大量平台 API，测试成本高
```

这个包的答案：**一个 Adapter 接口 + 两个工厂函数**。

```text
✅ 核心逻辑零平台依赖，纯函数可独立测试
✅ 各平台实现一个 Adapter 即可接入
✅ QueryClient 配置统一收口，跨项目一致
```

## 架构总览

```text
┌─────────────────────────────────────────────────────┐
│                  @fedstack/service                  │
│                                                     │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │  createAppRequest │   │  createQueryClient     │  │
│  │                  │   │                        │  │
│  │  业务错误分流     │   │  默认 query / mutation  │  │
│  │  token 续签      │   │  配置                   │  │
│  │  错误消息去重     │   │  统一错误回调           │  │
│  └───────┬──────────┘   └────────────────────────┘  │
│          │                                          │
│          │  依赖                                     │
│          ▼                                          │
│  ┌──────────────┐                                   │
│  │ RequestAdapter│ ◄── 各平台实现                    │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

## 核心概念

### RequestAdapter 接口

每个平台需要实现的 5 类能力：

| 能力       | 方法                                                     | 说明                               |
| ---------- | -------------------------------------------------------- | ---------------------------------- |
| UI 反馈    | `showErrorMessage` / `showErrorModal`                    | 错误提示的展示方式                 |
| Auth       | `getToken` / `getRefreshToken` / `setAuth` / `resetAuth` | 认证信息的存取，全部同步           |
| Token 刷新 | `fetchRefreshToken` / `refreshTokenUrl`                  | 换取新 token，以及它走的是哪个 url |
| 导航       | `getCurrentPath` / `redirectToLogin`                     | 路由跳转                           |
| i18n       | `t`                                                      | 国际化翻译                         |

两个容易踩的坑：

- `refreshTokenUrl` 用来识别「拿到过期码的是续签请求自己」。这种请求绝不能再去续签，否则它会 `await` 自己那次还没完成的刷新，把自己和所有等着刷新的请求一起永久挂起——不是报错，是转圈不动。续签走的 url 跟它对不上时（网关重写、换域名），在续签请求上补 `isRefreshToken: true`。
- `getToken` / `getRefreshToken` 必须是同步的。存储层是异步的平台（RN 的 `AsyncStorage`）要在外面先读进内存，adapter 里只做取值。

### 后端信封契约（admin-api 口径）

本包默认按 admin-api 的响应信封分流业务错误：

```ts
interface BackendEnvelope<T = any> {
  bizCode?: string | number; // 业务状态码（可选，AuthBizCode 等）
  code: string | number; // HTTP 状态码的回声
  data: T;
  message: string; // 人类可读文案
}
```

分流规则：**`bizCode` 优先，缺失时回落 `code`**。经真实 HTTP 状态码表达失败的响应可以不写 `bizCode`（比如 409 冲突直接走 HTTP 语义）；有业务码语义的场景（token 过期、强制登出）由 `bizCode` 精确表达，不和 HTTP 状态码抢含义。

默认成功码是 `'200'`，可用 `codes.success` 覆盖；成功判断和取数也可以用 `isBackendSuccess` / `transform` 整体换掉。

### ServiceCodes 配置

声明后端业务状态码，不同环境可配置不同值：

```ts
interface ServiceCodes {
  success: string; // 成功码，默认兜底 '200'
  logout: string[]; // 直接登出码
  modalLogout: string[]; // 弹窗确认后登出码
  expiredToken: string[]; // token 过期码（触发刷新）
}
```

## 安装

包已在 monorepo 内，直接引用：

```ts
import { createAppRequest, createQueryClient } from '@fedstack/service';
```

## 快速上手

### 第 1 步：实现平台 Adapter

以 antd + tanstack-router 为例：

```ts
// apps/admin/src/service/adapter.ts
import type { RequestAdapter } from '@fedstack/service';
import { setAuth } from '@/features/auth/use-auth';
import { router } from '@/features/router';
import { $t } from '@/locales';
import { localStg } from '@/utils/storage';
import { fetchRefreshToken } from './api';
import { AUTH_URLS } from './api/auth/urls';

export const antdAdapter: RequestAdapter = {
  // ---- UI 反馈 ----
  showErrorMessage(msg, onClose) {
    // 有 onClose 时要透传：错误消息去重靠它回收栈位
  },
  showErrorModal(options) {
    // 确认和取消都算 onConfirm：弹窗只是告知，登出动作不依赖用户选哪个
  },
  // ---- Auth ----
  getToken: () => localStg.get('token') || null,
  getRefreshToken: () => localStg.get('refreshToken') || null,
  setAuth: tokens => setAuth(tokens),
  resetAuth() {
    localStg.remove('token');
    localStg.remove('refreshToken');
  },
  async fetchRefreshToken(refreshToken) {
    const data = await fetchRefreshToken(refreshToken);
    return { token: data.token, refreshToken: data.refreshToken };
  },
  // 和上面这个函数请求的 url 必须是同一个，否则续签接口自己过期时会死等自己
  refreshTokenUrl: AUTH_URLS.REFRESH_TOKEN,
  // ---- 导航 ----
  getCurrentPath: () => router.state.location.href,
  redirectToLogin: path => router.navigate({ to: '/login', search: { redirect: path } }),
  // ---- i18n ----
  t: key => $t(key),
};
```

### 第 2 步：创建请求实例

```ts
// apps/admin/src/service/request/index.ts
import { createAppRequest } from '@fedstack/service';
import { antdAdapter } from '../adapter';

export const request = createAppRequest({
  adapter: antdAdapter,
  codes: {
    success: '200',
    logout: ['8888', '8889'],
    modalLogout: ['7777', '7778'],
    expiredToken: ['9999', '9998', '3333'],
  },
  axiosConfig: {
    baseURL: '/api',
    headers: { 'X-Custom': 'value' },
  },
});
```

### 第 3 步：创建 QueryClient

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

### 第 4 步：像往常一样使用

```ts
// 业务代码无需感知信封
const userInfo = await request<Api.Auth.UserInfo>({ url: '/user/info' });
```

## API

### `createAppRequest(options)`

创建平台无关的请求实例。

```ts
interface CreateRequestOptions {
  adapter: RequestAdapter; // 平台适配器
  codes: ServiceCodes; // 后端业务状态码
  axiosConfig?: CreateAxiosDefaults; // axios 基础配置
  requestIdKey?: string | false; // 请求 id 的 header 名，默认 'X-Request-Id'
  retry?: IAxiosRetryConfig; // axios-retry 配置，默认不重试
  sealRequest?: RequestSealer; // 请求体加密器（见「接口传输加密」）
  isBackendSuccess?: (response) => boolean; // 自定义成功判断
  transform?: (response) => any; // 自定义响应转换
}
```

返回值与 `@fedstack/axios` 的 `createRequest` 一致，是一个可直接调用的函数：

```ts
const request = createAppRequest({
  adapter,
  codes,
});

// 直接调用
const data = await request<UserInfo>({ url: '/user/info' });

// 取消所有请求
request.cancelAllRequest();

// 访问内部状态（调试用）
request.state.errMsgStack;
```

#### 默认行为

| 行为     | 默认实现                                                                | 可覆盖             |
| -------- | ----------------------------------------------------------------------- | ------------------ |
| 成功判断 | `String(response.data.bizCode ?? response.data.code) === codes.success` | `isBackendSuccess` |
| 数据转换 | `response.data.data`                                                    | `transform`        |
| 请求拦截 | 自动注入 `Bearer {token}`                                               | —                  |
| 错误处理 | 根据 `codes` 分流（登出 / 弹窗 / 刷新 / toast）                         | —                  |

#### 错误处理流程

```text
后端返回非成功码（bizCode ?? code 命中）
    │
    ├─ logout codes      → showErrorMessage + resetAuth + 跳转登录页
    ├─ modalLogout codes → showErrorModal + 确认后 resetAuth + 登出
    ├─ expiredToken codes → 自动刷新 token + 重试原请求（重试的响应交回调用方）
    └─ 其他               → 抛出 AxiosError（由 onError 兜底展示 toast）
```

登出和续签失败都由本包调 `adapter.resetAuth()` 清凭据，`redirectToLogin` 只负责「跳到哪」——平台不必在路由里再清一遍（清了也无妨，`resetAuth` 是幂等的）。

#### token 续签的并发安全

- 同一时刻最多一次刷新：模块级 `inFlight` 单例，多个请求同时拿到过期码时共享同一次续签。
- 1 秒复用窗口：刚刷完的 token 在窗口期内直接复用，避免过期码连环触发时连续打续签接口。
- 重入守卫：续签重发过的请求带 `isTokenRefreshRetry` 标记，再次失败不再触发刷新，直接走登出——防止「续签成功但原请求权限就是不够」时无限循环。
- 测试或强制重刷场景用 `resetTokenRefresh()` 清掉单例。

#### 错误消息去重

同一条错误文案在展示期间不会重复弹：`errMsgStack` 记录正在展示的消息，`onClose` 回调回收栈位；adapter 没透传 `onClose` 时有 5 秒看门狗兜底，不会因漏回调导致同类错误永远不弹。

### 接口传输加密（`@fedstack/service/crypto`）

给个别接口（登录、改密码、实名信息提交）加一层传输加密，让密码这类内容不以明文出现在浏览器 devtools、网关访问日志和抓包里。

加密能力在独立子入口，主入口不导出：它依赖 node-forge（会 `require('crypto')`），进主入口会让 React Native 这类没有 node 内置模块的运行时打不出包。

装配一次：

```ts
import { createRequestSealer } from '@fedstack/service/crypto';

const sealRequest = createRequestSealer({
  header: import.meta.env.VITE_API_CRYPTO_HEADER,
  publicKey: import.meta.env.VITE_API_CRYPTO_PUBLIC_KEY,
});

export const request = createAppRequest({
  adapter,
  codes,
  sealRequest,
});
```

之后每个要加密的接口加一行 `encrypt: true`，没加的接口不进这段逻辑：

```ts
export function fetchLogin(params: Api.Auth.LoginParams) {
  return request<Api.Auth.LoginResponse>({
    data: params,
    encrypt: true,
    method: 'post',
    url: '/auth/login',
  });
}
```

#### 报文格式

两层信封，RSA 只用来传一次性 AES 密钥：

```text
密钥头  base64( RSA-OAEP-SHA256(服务端公钥, aesKey) )        ← 头的名字由 header 配置
请求体  base64( nonce(12B) ‖ AES-256-GCM(aesKey, 明文 JSON) ‖ tag(16B) )
```

和后端的 `API_CRYPTO_*` 配置是同一份契约。请求体会被声明成 `text/plain`——它现在是一段 base64，标成 `application/json` 会让网关和 WAF 按 JSON 去解析它。公钥从 PEM 载入，换行可以写成字面量 `\n`（环境变量装不下多行）。

#### 为什么是 node-forge 而不是 WebCrypto

`crypto.subtle` 只在安全上下文里存在。用 `http://192.168.x.x:5173` 访问开发服务器时浏览器不提供它，整条加密链路直接不可用——手机和同事的电脑都进不来。forge 是纯 JS 实现，不挑上下文，代价是约 90KB gzip 和慢一些的 RSA（一次登录几十毫秒）。

#### 边界

- **先想清楚它挡的是什么。** 公钥在前端 JS 里，AES 密钥也是前端生成的，攻击者照样构造得出合法密文。它挡的是明文落到日志和抓包里，不是主动攻击，别把它当成认证或授权的替代。
- **只加密请求，不解密响应。** 单纯是还没做：forge 是同步的，接 `isBackendSuccess` 这种同步钩子没有障碍，缺的是实现和后端对应的响应信封格式。
- **没配 `publicKey` 时不会退化成明文**：标了 `encrypt: true` 的请求直接抛错。没有加密需求的部署不用配，但配了一半的部署不会安静地把密码明文发出去。
- **FormData / 二进制请求体不支持**，上传文件的接口去掉 `encrypt: true`。

### `createQueryClient(options?)`

创建带统一默认配置的 QueryClient 实例。

```ts
interface CreateQueryClientOptions {
  /** 覆盖默认 defaultOptions（会与内置默认值浅合并） */
  defaultOptions?: DefaultOptions;
  /** MutationCache 配置（onError / onSuccess / onSettled / onMutate） */
  mutationCache?: MutationCacheConfig;
  /** QueryCache 配置（onError / onSuccess / onSettled） */
  queryCache?: QueryCacheConfig;
}
```

内置默认值：

| Query                  | 值                      | Mutation      | 值                 |
| ---------------------- | ----------------------- | ------------- | ------------------ |
| `staleTime`            | 30s                     | `gcTime`      | 60s                |
| `gcTime`               | 10min                   | `retry`       | 1                  |
| `retry`                | 2（指数退避，上限 30s） | `retryDelay`  | 指数退避，上限 10s |
| `refetchOnWindowFocus` | `false`                 | `networkMode` | `'online'`         |
| `networkMode`          | `'online'`              |               |                    |

`@tanstack/react-query` 是 peerDependency，由消费方安装，避免双实例。

## 入口形态

| 入口                       | 内容                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `@fedstack/service`        | `createAppRequest` / `refreshToken` / `resetTokenRefresh` / `createQueryClient` + 全部类型 |
| `@fedstack/service/crypto` | `createRequestSealer` / `importPublicKey` / `seal` + 加密类型                              |
| `@fedstack/service/query`  | `createQueryClient` + 默认配置常量                                                         |

`createQueryClient` 同时挂在主入口和 `./query`：只有 QueryClient 需求的场景引子路径，依赖面更窄。

## 相关包

- [@fedstack/axios](../axios/README.md)：底层请求客户端工厂（统一钩子、取消、重试、请求 id）
