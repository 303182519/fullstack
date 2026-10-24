# @fedstack/logger

一个基于 [LogLayer](https://loglayer.dev/) 的**跨平台日志收集库**。

> 一句话：它帮你把「打日志」这件事里超出 console 的部分（本地持久化、按设备白名单控制、批量上报到后端、自动清理过期日志）封装好了，你只管 `logger.info('xxx')`，剩下的它来做。

## 为什么需要它？

线上排查问题时，console 日志用户看不到、你也拿不到。直接在业务代码里埋上报逻辑，每个项目都要重复做这些事：

- 日志先落到本地存储，不能因为接口挂了就丢日志
- 不能全量设备都上报，得有个「白名单」开关按需开启（否则服务器被打爆）
- 上报要批量、要断点续传，不能因为一次失败就从头再来
- 本地日志不能无限膨胀，过期的要自动清掉

这个包把这些逻辑统一收口：**开发环境打控制台，生产环境写本地 IndexedDB，后端把设备加进白名单后自动批量上报，过期日志每天自动清理**。

## 安装

```bash
npm install @fedstack/logger
```

> React Native 端还需额外安装 peer 依赖：`npm install @react-native-async-storage/async-storage`（Web 端不需要）。

## 快速上手

假设你有一个管理后台 Web 应用，想做到：平时日志只存在用户浏览器里，出问题时后端把这台设备加进白名单，设备上的历史日志自动上传到服务器。

### 第 1 步：创建日志实例

```ts
import { createLogger } from '@fedstack/logger';

const { logger, dispose } = await createLogger({
  // 生产模式（true 时只打控制台，不写本地存储）
  isDev: import.meta.env.DEV,
  // 本地日志保留 7 天，过期自动清理
  retentionDays: 7,
  // 后端两个端点：不配则不启用对应功能
  whitelistEndpoint: '/api/log/whitelist',
  uploadEndpoint: '/api/log/upload',
});
```

### 第 2 步：打日志

```ts
// 和 console 一样的用法
logger.info('应用启动');
logger.warn('配置缺失，使用默认值');
logger.error('请求失败');

// 带附加数据（会被一起存储和上报）
logger.withMetadata({ userId: '123' }).info('用户点击了导出按钮');

// 带错误对象（自动序列化 stack）
logger.withError(new Error('timeout')).error('请求超时');

// 带上下文（比如模块名），之后每条日志都自动带上
const authLogger = logger.withContext({ module: 'auth' });
authLogger.info('开始登录');
```

### 第 3 步：应用销毁时清理资源

```ts
// 比如 React 根组件 unmount 时
dispose();
```

> **一句话总结**：`createLogger` 返回的 `logger` 就是一个 LogLayer 实例，打日志的 API 和 console 几乎一样；存储、白名单、上传、清理这四个后台动作全部由配置驱动，不配就不启用。

## 它是怎么工作的？

```
logger.info('xxx')
   │
   ├─ 开发模式 → ConsoleTransport → 控制台输出
   │
   └─ 生产模式 → StorageTransport → 内存缓冲（默认 100 条或 5 秒触发一次）
                                      │
                                      ↓
                              批量写入 IndexedDB（WebStorageAdapter）
                                      │
              ┌───────────────────────┼────────────────────┐
              ↓                       ↓                    ↓
      WhitelistManager         UploadManager         CleanupManager
      每 5 分钟问一次后端：     设备入白名单后，        每天清一次
      「我这台设备要上报吗？」   分批 POST 历史日志，    7 天前的过期日志
                               记录断点续传进度
```

- **StorageTransport（缓冲传输器）**：日志先攒在内存里，攒够 `bufferSize`（默认 100）条或每隔 `flushInterval`（默认 5 秒）批量写一次 IndexedDB，避免每条日志都开一次事务。
- **WebStorageAdapter（存储适配器）**：用 IndexedDB 存日志，按时间戳建索引，支持范围读取和按时间删除。
- **WhitelistManager（白名单管理器）**：定期问后端「设备在不在白名单里」。首次从不信到可信时，自动触发一次全量历史日志上传。
- **UploadManager（上传管理器）**：把本地日志分批 POST 到后端。每批成功后把进度（最后一条日志的时间戳）持久化到 localStorage，刷新页面/重启浏览器后从断点继续，不会全量重传。
- **CleanupManager（清理管理器）**：启动时和每天各清一次超过 `retentionDays` 的日志。

## 配置项一览

| 选项                     | 类型                                        | 默认值   | 说明                                        |
| ------------------------ | ------------------------------------------- | -------- | ------------------------------------------- |
| `platform`               | `'web' \| 'react-native' \| 'mini-program'` | `'web'`  | 运行平台（RN/小程序适配见下文「平台支持」） |
| `isDev`                  | `boolean`                                   | `true`   | 开发模式：只打控制台，不写存储              |
| `retentionDays`          | `number`                                    | `7`      | 本地日志保留天数                            |
| `whitelistEndpoint`      | `string`                                    | -        | 白名单检查接口，不配则不启用白名单          |
| `uploadEndpoint`         | `string`                                    | -        | 日志上传接口，不配则不启用上传              |
| `whitelistCheckInterval` | `number`                                    | `300000` | 白名单检查间隔（毫秒）                      |
| `uploadBatchSize`        | `number`                                    | `100`    | 每批上传的日志条数                          |
| `flushInterval`          | `number`                                    | `5000`   | 缓冲区定时写入存储的间隔（毫秒）            |
| `enableStorageInDev`     | `boolean`                                   | `false`  | 开发模式下也写本地存储（调试用）            |
| `storageAdapter`         | `IStorageAdapter`                           | -        | 自定义存储适配器                            |
| `headers`                | `object \| (() => object)`                  | -        | 白名单/上传请求的附加请求头（如鉴权 token） |

> ⚠️ 注意 `isDev` 默认值是 `true`：**不显式传 `isDev: false`，生产环境也不会写存储、不会启用管理器**。接入时务必显式传值（如 `isDev: import.meta.env.DEV`）。

### 给上传/白名单请求加鉴权头

两个端点如果要求登录态，用 `headers` 注入（白名单和上传共用）：

```ts
const { logger } = await createLogger({
  isDev: false,
  whitelistEndpoint: '/api/log/whitelist',
  uploadEndpoint: '/api/log/upload',
  // 传函数时每次发请求都会调用一次，token 轮换也不怕
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
});
```

## 后端接口契约

当前 fedstack 的 admin-api **尚未实现**这两个端点（计划在后续阶段提供），此处记录契约供后端实现参考。只要后端按此契约实现，前端零改动即可接通。

### 白名单检查接口

**请求**

```http
POST /api/log/whitelist
Content-Type: application/json

{
  "deviceId": "设备唯一 ID（库自动生成并持久化）"
}
```

**响应**

```json
{
  "enabled": true,
  "deviceIds": ["device-1", "device-2"]
}
```

- `enabled: false` 时视为全局关闭日志收集，所有设备都不上报。
- `enabled: true` 且 `deviceIds` 包含本设备 ID 时，该设备开始上报。

### 日志上传接口

**请求**

```http
POST /api/log/upload
Content-Type: application/json

{
  "deviceId": "设备唯一 ID",
  "logs": [
    {
      "id": "nanoid",
      "timestamp": 1706745600000,
      "level": "info",
      "message": "User logged in",
      "data": { "userId": "123" },
      "context": { "module": "auth" },
      "error": { "message": "...", "stack": "..." }
    }
  ],
  "batchIndex": 0,
  "totalBatches": 3
}
```

**响应**

```json
{
  "success": true,
  "receivedCount": 100,
  "message": "ok"
}
```

- 响应 `success: false` 或 HTTP 非 2xx 时，客户端停止后续批次，下次从失败断点继续。
- 服务端实现建议按日志 `id`（nanoid）幂等去重：断点续传存在边界重传（见「已知问题」）。

## 进阶用法

### 手动触发上传 / 清理

```ts
const { uploadLogs, cleanupLogs } = await createLogger(config);

// 比如「帮助」页面放个「上传日志反馈问题」按钮
const result = await uploadLogs();
if (result) {
  console.log(`已上传 ${result.uploadedCount} 条日志`);
}

// 手动清理过期日志
const deletedCount = await cleanupLogs();
```

`uploadLogs` 会先把内存缓冲里的日志强制写入存储，再执行全量上传，不会丢缓冲区里的最新日志。

### 自定义存储适配器

默认 Web 端用 IndexedDB。想换成别的存储（比如测试时换内存实现），继承 `BaseStorageAdapter` 实现 7 个方法：

```ts
import type { LogRecord } from '@fedstack/logger';
import { BaseStorageAdapter, createLogger } from '@fedstack/logger';

class MemoryAdapter extends BaseStorageAdapter {
  private records: LogRecord[] = [];

  async init() { /* 初始化资源 */ }
  async write(record: LogRecord) { this.records.push(record); }
  async writeBatch(records: LogRecord[]) { this.records.push(...records); }
  async read() { return this.records; }
  async deleteBeforeTime(time: number) {
    const before = this.records.length;
    this.records = this.records.filter(r => r.timestamp >= time);
    return before - this.records.length;
  }

  async count() { return this.records.length; }
  async clear() { this.records = []; }
}

const { logger } = await createLogger({ storageAdapter: new MemoryAdapter() });
```

### 只要控制台输出（不带存储）

```ts
import { createConsoleLogger } from '@fedstack/logger';

const logger = createConsoleLogger();
logger.info('Hello');
```

## 平台支持

| 平台         | 存储介质               | 状态                                       |
| ------------ | ---------------------- | ------------------------------------------ |
| Web          | IndexedDB              | ✅ 完整支持                                |
| React Native | AsyncStorage（v3 API） | ✅ 适配器已实现，需自行安装 peer 依赖      |
| 小程序       | 文件系统（JSONL 分片） | ⏳ 设备 ID 已支持，存储适配器 Phase 2 提供 |

> 迁移自上游时我们把持久化存储键从 `skyroc_*` 重命名为 `fedstack_*`（IndexedDB 库名 `fedstack_logs`、设备 ID 键 `fedstack_device_id` 等），与上游数据不互通，老数据不会自动迁移。

## 标准接入清单

1. 安装依赖：`npm install @fedstack/logger`
2. 应用入口处 `await createLogger({ isDev: import.meta.env.DEV, ... })`，**显式传 `isDev`**
3. 拿到 `logger` 挂到应用级可访问的位置（模块导出 / Context）
4. 业务代码统一用 `logger.xxx` 替代 `console.xxx`
5. 需要远程收集时：后端按上文契约实现两个端点 → 配置 `whitelistEndpoint` / `uploadEndpoint`（需要鉴权再加 `headers`）
6. 应用销毁时调用 `dispose()`

## Do / Don't

**Do**

- ✅ 显式传 `isDev`，不要依赖默认值
- ✅ 用 `withContext({ module: 'xxx' })` 给日志打模块标记，线上排查时按模块过滤
- ✅ 上传/白名单接口需要鉴权时用 `headers` 函数形式注入，token 过期自动取新
- ✅ 长生命周期应用（SPA）在卸载钩子里调 `dispose()`

**Don't**

- ❌ 不要在请求拦截器、渲染循环里创建多个 `createLogger` 实例——全应用共用一个
- ❌ 不要在日志 `data` 里放敏感信息（密码、完整 token），日志最终会上传到服务器
- ❌ 不要把 `bufferSize` 调得很大当「无限缓存」用——缓冲区有硬上限（见下）

## 已知问题（上游既有行为，有意保留）

1. **`isDev` 默认 `true`**：与直觉相反，不显式传值时生产环境也不会启用存储。接入清单第 2 步已要求显式传值。
2. **`dispose()` 同步返回、异步 flush 可能被丢弃**：`dispose` 内部触发 flush 但不 await，进程/页面立即销毁时缓冲区里最后几条日志可能丢失。需要严格保证时请自行 `await uploadLogs()` 后再 `dispose()`。
3. **断点续传边界重传 1 条**：上传进度按「最后一条已上传日志的时间戳」记录，而读取是该时间戳的闭区间，每轮上传边界上会重传恰好 1 条。服务端按日志 `id` 幂等去重即可。
4. **Error 对象同时进 `error` 和 `data`**：日志 `data` 里的 Error 会被序列化到记录的 `error` 字段，但原始 Error 对象仍保留在 `data` 中（不移除）。
5. **缓冲区硬上限**：缓冲区上限 = `bufferSize × 10`（默认 1000 条）。存储持续不可用导致积压超限时，丢弃**最旧**日志并 `console.warn` 一次（恢复后再次溢出会重新告警）——宁可丢日志也不能撑爆内存。

## License

UNLICENSED
