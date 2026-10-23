# @fedstack/axios

一个基于 [Axios](https://axios-http.com/) 的**请求客户端工厂**。

> 一句话：它帮你把「发请求」这件事里重复又繁琐的部分（统一加 Token、统一处理错误、自动重试、取消请求……）封装好了，你只需要写「发什么请求」和「拿到数据后做什么」。

## 为什么需要它？

直接用 axios 写请求，每个接口都要重复做这些事：

- 在请求头里加 `Authorization: Bearer xxx`
- 判断后端返回的 `code` 是不是成功
- 失败了弹个提示
- 接口超时了重试一下
- 页面切换时取消没完成的请求

这个包把这些逻辑统一收到一个地方，你**只写一次**，所有请求自动生效。

## 安装

```bash
npm install @fedstack/axios
```

## 快速上手

假设你的后端返回格式是这样的：

```json
{ "code": 200, "data": { "name": "张三" }, "msg": "ok" }
```

### 第 1 步：创建请求实例

```ts
import { createRequest } from '@fedstack/axios';

// 定义后端返回的「信封」格式
interface BackendResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}

const request = createRequest<BackendResponse>(
  // ① axios 的基础配置（baseURL、超时等）
  { baseURL: 'https://api.example.com' },
  // ② 这个包的配置（告诉它怎么判断成功、怎么取数据）
  {
    // 判断业务是否成功：code 为 200 算成功
    isBackendSuccess: response => response.data.code === 200,
    // 从响应里取出真正要用的数据（跳过外层的 code/msg）
    transform: response => response.data.data,
    // 请求发出前自动加 Token
    onRequest: (config) => {
      config.headers.set('Authorization', `Bearer ${getToken()}`);
      return config; // 必须 return config！
    },
    // 所有错误的统一出口（比如弹个 toast）
    onError: error => console.error('请求出错：', error.message),
  },
);
```

### 第 2 步：发请求

```ts
// 定义接口返回的数据类型
interface User {
  name: string;
}

// 发请求，拿到的直接是 transform 后的数据
const user = await request<User>({ url: '/api/user' });
console.log(user.name); // "张三"
```

> **一句话总结**：`createRequest` 做了两件事——①统一加请求头、判成功、处理错误；②把响应里的 `data` 直接掏出来给你，不用每次写 `response.data.data`。

## 两种风格怎么选？

这个包提供了两个创建函数，区别只在于**出错时怎么处理**：

|          | `createRequest`                                              | `createFlatRequest`                        |
| -------- | ------------------------------------------------------------ | ------------------------------------------ |
| 出错时   | **抛出异常**（需要 try/catch）                               | **不抛异常**，返回 `{ data: null, error }` |
| 适合场景 | 搭配 [TanStack Query](https://tanstack.com/query) 用（推荐） | 不想用 try/catch，想自己判断 error         |

### `createRequest`（抛异常风格，推荐）

```ts
try {
  const user = await request<User>({ url: '/api/user' });
  // 成功：user 就是数据
}
catch (error) {
  // 失败：error 是 AxiosError
  console.error(error.message);
}
```

### `createFlatRequest`（Result 风格，不抛异常）

```ts
const { data, error } = await flatRequest<User>({ url: '/api/user' });

if (error) {
  // 失败
  console.error(error.message);
  return;
}
// 成功：data 就是数据
console.log(data.name);
```

> **一句话总结**：用 TanStack Query 就选 `createRequest`（它帮你管 loading/error 状态）；想自己写 `if (error)` 判断就选 `createFlatRequest`。

## 核心概念：5 个钩子

钩子（hook）就是「在特定时机自动调用的函数」。这个包有 5 个钩子，覆盖了请求的完整生命周期：

```
请求发出 → onRequest → 【网络】 → 响应回来 → isBackendSuccess → 成功? → transform
                                                          ↓ 否
                                                    onBackendFail → onError
```

### 1. `onRequest` —— 请求发出前

**用途**：统一加请求头（比如 Token）。

```ts
onRequest: (config) => {
  config.headers.set('Authorization', `Bearer ${getToken()}`);
  return config; // ⚠️ 必须 return config，否则会报错
};
```

### 2. `isBackendSuccess` —— 判断业务是否成功

**用途**：HTTP 状态码是 200 不代表业务成功（比如后端可能返回 `{ code: 401, msg: '未登录' }`）。这个钩子告诉库「怎么算成功」。

```ts
isBackendSuccess: response => response.data.code === 200;
```

### 3. `transform` —— 取出真正的数据

**用途**：把后端的「信封」（`{ code, data, msg }`）剥掉，只返回 `data`。

```ts
transform: response => response.data.data;
```

### 4. `onBackendFail` —— 业务失败时

**用途**：处理业务失败，最常见的是「Token 过期了自动刷新并重试」。

```ts
onBackendFail: async (response, instance) => {
  if (response.data.code === 401) {
    // 刷新 Token 成功后，用新 Token 重发原请求
    await refreshToken();
    response.config.headers.Authorization = `Bearer ${getNewToken()}`;
    return instance.request(response.config);
  }
};
```

### 5. `onError` —— 所有错误的统一出口

**用途**：不管是 HTTP 错误、业务错误、网络超时，都会走到这里。通常用来弹错误提示。

```ts
onError: (error) => {
  showToast(error.message);
};
```

> **一句话总结**：`onRequest` 管「出门前」，`isBackendSuccess`+`transform` 管「进门后取货」，`onBackendFail` 管「货不对怎么办」，`onError` 管「所有意外情况」。

## 常用场景

### 发 GET 请求带参数

```ts
const list = await request<UserList>({
  url: '/api/users',
  params: { page: 1, pageSize: 10 }, // 会拼成 ?page=1&pageSize=10
});
```

### 发 POST 请求提交数据

```ts
const newUser = await request<User>({
  url: '/api/users',
  method: 'post',
  data: { name: '张三', age: 18 },
});
```

### 下载文件（Blob）

```ts
const blob = await request({
  url: '/api/file/download',
  responseType: 'blob',
});
// blob 的类型自动推导为 Blob，不用手动标注
const url = URL.createObjectURL(blob);
```

### 读取纯文本

```ts
const text = await request({
  url: '/api/raw-text',
  responseType: 'text',
});
// text 的类型自动推导为 string
```

> 非 JSON 响应（blob、text 等）**不经过** `transform`，直接返回原始数据。

### 区分业务错误和 HTTP 错误

```ts
import { BACKEND_ERROR_CODE } from '@fedstack/axios';

try {
  await request({ url: '/api/data' });
}
catch (error) {
  if (error.code === BACKEND_ERROR_CODE) {
    // 业务错误：HTTP 200 但 code 不对
  }
  else {
    // HTTP 错误或网络错误
  }
}
```

## 进阶主题

### 自动重试

默认**不重试**（重试对非幂等请求可能有害）。需要时显式开启：

```ts
createRequest<BackendResponse>(axiosConfig, {
  retry: {
    retries: 2, // 最多重试 2 次
    retryDelay: attempt => attempt * 500, // 第 1 次等 500ms，第 2 次等 1000ms
  },
});
```

### 取消所有请求

页面切换时取消所有还没完成的请求，避免「旧请求覆盖新数据」：

```ts
request.cancelAllRequest();
// 之后新发起的请求不受影响
```

> 如果你在某个请求里自己传了 `signal`，那个请求由你自己管理，`cancelAllRequest` 不会取消它。

### 请求 ID（链路追踪）

每个请求默认带一个 `X-Request-Id` header，方便后端排查问题。

不需要时可以关掉（关掉还能减少跨域预检请求）：

```ts
createRequest<BackendResponse>(axiosConfig, {
  requestIdKey: false, // 关闭
  // 或者换成网关认识的名字
  requestIdKey: 'X-Trace-Id',
});
```

### 实例状态（state）

`state` 是挂在请求实例上的一个**共享对象**，用来在**钩子之间**、以及**钩子和外部代码之间**传递数据。

**什么时候用？** 典型场景是存 Token：`onRequest` 钩子里要读 Token 加到请求头，而 Token 可能在别处（比如登录后、刷新后）被更新。把 Token 存在 `state` 里，两边都能读写。

#### 三个泛型参数的含义

```ts
createFlatRequest<
  BackendResponse, // ① 后端原始响应类型（信封格式）
  unknown, // ② transform 后的数据类型
  { token: string }
>();
```

前两个参数前面讲过，第三个就是 `state` 的类型定义。

#### 完整示例：用 state 管理 Token

```ts
const request = createRequest<BackendResponse, unknown, { token: string }>(
  axiosConfig,
  {
    // 初始值
    defaultState: { token: '' },

    // onRequest 里从 state 读 Token
    onRequest: (config) => {
      if (request.state.token) {
        config.headers.set('Authorization', `Bearer ${request.state.token}`);
      }
      return config;
    },
  },
);

// 登录成功后，外部更新 state
request.state.token = 'user-login-token';

// 之后所有请求自动带上这个 Token
await request({ url: '/api/profile' });
```

#### 调用链

```
外部代码写入 token → request.state.token = 'xxx'
                         ↓
onRequest 钩子读取 → request.state.token → 设置 Authorization 头
                         ↓
                   发出带 Token 的请求
```

> **一句话总结**：`state` 就是请求实例的「共享变量」，钩子和外部代码都能读写，适合放 Token、计数器这类需要跨请求共享的数据。

### 响应类型推导

`responseType` 的取值和 axios 完全一致（全小写）。TypeScript 会自动推导返回值类型：

| responseType     | 返回类型         |
| ---------------- | ---------------- |
| `'json'`（默认） | 你标注的泛型类型 |
| `'blob'`         | `Blob`           |
| `'text'`         | `string`         |
| `'arraybuffer'`  | `ArrayBuffer`    |
| `'document'`     | `Document`       |
| `'stream'`       | `ReadableStream` |
| `'formdata'`     | `FormData`       |

## 配置项参考

### Axios 默认配置

| 配置             | 默认值             | 说明                   |
| ---------------- | ------------------ | ---------------------- |
| `Content-Type`   | `application/json` | 请求体格式             |
| `timeout`        | `10000`            | 10 秒超时              |
| `validateStatus` | 200-299 或 304     | 哪些 HTTP 状态码算成功 |

### RequestOption

| 选项               | 说明                                                         |
| ------------------ | ------------------------------------------------------------ |
| `onRequest`        | 请求前修改配置（加 Token 等），**必须 return config**        |
| `isBackendSuccess` | 判断业务是否成功（仅 JSON 响应）                             |
| `transform`        | 把原始响应转成业务数据（仅 JSON 且业务成功）                 |
| `onBackendFail`    | 业务失败处理，可返回新响应实现重试                           |
| `onError`          | 所有错误的统一回调                                           |
| `defaultState`     | 实例的初始 `state`                                           |
| `requestIdKey`     | 请求 ID 的 header 名，默认 `'X-Request-Id'`，传 `false` 关闭 |
| `retry`            | axios-retry 配置，默认 `{ retries: 0 }`（不重试）            |

## 常量与类型导出

**常量：**

| 常量                 | 值                | 说明                    |
| -------------------- | ----------------- | ----------------------- |
| `BACKEND_ERROR_CODE` | `'BACKEND_ERROR'` | 业务失败时的 error.code |
| `REQUEST_ID_KEY`     | `'X-Request-Id'`  | 默认请求 ID header 名   |

**类型：**

| 类型                       | 说明                               |
| -------------------------- | ---------------------------------- |
| `RequestOption`            | 请求选项配置                       |
| `RequestInstance`          | `createRequest` 的返回类型         |
| `FlatRequestInstance`      | `createFlatRequest` 的返回类型     |
| `FlatResponseData`         | Flat 请求的返回值类型              |
| `CustomAxiosRequestConfig` | 请求配置（支持 responseType 推导） |
| `ResponseType`             | 响应类型字面量                     |

## 相关包

实际项目中通常不直接使用 `@fedstack/axios`，而是通过 `@fedstack/service` 进行上层封装。它基于本包提供了**平台适配器**、**业务状态码管理**、**Token 自动刷新**、**错误消息去重**等开箱即用的能力。
