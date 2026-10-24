# ADR-016：@fedstack/service 迁移定位与 admin-api 信封契约适配

- 状态：已接受
- 日期：2026-10-24
- 影响范围：`packages/web/service/`（新增）、`packages/web/axios/src/index.ts`（新增一行纯类型重导出）、`pnpm-workspace.yaml`（catalog 新增 @tanstack/react-query / node-forge / @types/node-forge）

## 背景

skyroc 上游 `@core` 目录包按既定策略逐步迁移进本仓 `packages/`。`@core/service` 是请求基础设施的上层：在 `@core/axios`（已迁为 `@fedstack/axios`）之上收口业务错误分流、token 续签、错误消息去重、QueryClient 统一配置、接口传输加密。其平台无关性靠 Adapter 模式：UI 反馈 / 认证存取 / 导航 / i18n 全部由消费方注入，包内零平台依赖。

迁移不是纯搬运：上游信封契约（`code` 分流 + `msg` 文案 + 成功码 `'0000'`）与本仓 admin-api 已定契约（`code` 为 HTTP 回声 + 可选 `bizCode` 业务码 + `message` 文案，成功 HTTP 200）不一致，必须做适配决策；同时上游 README 与源码存在两处漂移（见 D3），文档口径需要重新确立。

## 决策

### D1 落位 `packages/web/service`，包名 `@fedstack/service`

遵循 ADR-015 四层分组：包依赖 DOM 语义（`beforeunload`、防抖窗口定位）且服务浏览器场景，归 web 层；包名不加层前缀，目录表达层信息。`@fedstack/axios` 以 `workspace:*` 进 dependencies。

### D2 信封契约按方案 A 适配，保留全部覆盖点

包内 4 个硬编码读取点改为 admin-api 口径：

| 读取点                                                     | 上游                         | 本仓                                                  |
| ---------------------------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| 分流业务码（isBackendSuccess / backEndFail / handleError） | `String(response.data.code)` | `String(response.data.bizCode ?? response.data.code)` |
| 错误文案（logout / modalLogout / handleError）             | `data.msg`                   | `data.message`                                        |
| 默认成功码兜底（normalizeCodes）                           | `'0000'`                     | `'200'`                                               |

分流语义：`bizCode` 优先、缺失回落 `code`——经真实 HTTP 状态码表达失败的响应（如 409）没有 `bizCode`，纯 HTTP 语义路径不受影响；有业务码语义的场景（token 过期、强制登出）由 `bizCode` 精确表达。`codes` / `isBackendSuccess` / `transform` 三个覆盖点全部保留，信封再变时不改包源码。

包内新增导出类型 `BackendEnvelope<T>`（`bizCode?` / `code` / `data` / `message`），作为 `createRequest` 的信封泛型实参与消费方的契约参照。

### D3 crypto 全量迁移，`./crypto` 子入口隔离 node-forge

加密模块（RSA-OAEP-SHA256 包 AES-256-GCM 一次性密钥的信封方案）完整保留，含测试。主入口不导出：node-forge 会 `require('crypto')`，打包器静态分析下主入口引到它就会让 React Native / Metro 这类无 node 内置模块的运行时连包都打不出来——而这些端不需要加密。加密器做成注入（`RequestSealer` 函数类型 + `createRequestSealer` 工厂 + `createAppRequest` 的 `sealRequest` 选项），不传不参与，请求体原样发出。

上游 README 两处漂移按源码口径纠正，不沿抄：① 装配形态是 `createRequestSealer` + `sealRequest` 选项（README 写的 `crypto: {...}` 选项在源码中不存在）；② `importPublicKey` / `seal` 在 `./crypto` 子路径（README 写成主入口导出）。

### D4 依赖布局：@tanstack/react-query 作 peer，其余进 dependencies

- `dependencies`：`@fedstack/axios`（workspace:*）、`axios`、`node-forge`（catalog）——产物运行必需。
- `peerDependencies`：`@tanstack/react-query` `^5`——QueryClient 必须与消费方应用同一实例，双实例会导致 cache 不共享；peerDependencies 不能用 `catalog:` 协议，写版本范围。
- `devDependencies`：`@tanstack/react-query`、`@types/node-forge` 等走 catalog，供包内开发与测试。

### D5 `IAxiosRetryConfig` 经 @fedstack/axios 纯类型重导出

service 的 `CreateRequestOptions.retry` 类型来自 `axios-retry`，但 `axios-retry` 是 `@fedstack/axios` 的依赖，pnpm 严格隔离下 service 无法直接引用其类型。处理：axios 主入口加一行 `export type { IAxiosRetryConfig } from 'axios-retry'`（retry 配置本就经 `RequestOption` 暴露给消费方），service 从 `@fedstack/axios` 引类型，**不**为单个类型重复声明实体依赖。

### D6 构建与测试形态沿用 web 层既定模板

rslib bundleless ESM + dts，三入口（`.` / `./crypto` / `./query`）；tsconfig extends `packages/web/tsconfig.base.json`（`moduleResolution: bundler`，源码 import 不带 `.js` 扩展名，rslib 构建产物自动补全）；测试在包根 `__tests__/*.test.ts`，vitest node 环境 + `vi.stubGlobal('window', ...)` 模拟浏览器分支（不为两个用例引入 jsdom）。

## 备选方案

- **方案 B：包内信封直接定义为本仓契约并删覆盖点**：源码更贴本仓，但信封再演进时要改库而非改配置，且丢失上游后续修复的合入便利性。方案 A 用默认值表达契约、用覆盖点保留弹性。
- **方案 C：信封字段双读（`msg ?? message`、`code ?? bizCode`）**：兼容面最大但分流优先级含糊（`code` 在上游是业务码、在本仓是 HTTP 回声，同名不同义），制造隐性歧义数据源。
- **crypto 整块砍掉**：本仓暂无加密接口需求，但上游已完整实现+测试，砍掉等于把已验证的契约设计（含 RN 边界分析）丢弃，后续重做成本高；隔离在子入口后不进主路径，零运行时代价。
- **zod 校验信封**：违反 ADR-015 D3「不引入第三 schema 源」。

## 已知限制与跟进项

1. **`BackendEnvelope` 与 admin-api 实际响应是约定而非生成**：前端契约的统一形态按 ADR-015 D3 走 OpenAPI 生成客户端；本包 `BackendEnvelope` 是请求基础设施层的独立最小描述，生成客户端落地后复核两者是否合并。
2. **响应不解密**：只加密请求，缺后端响应信封格式与实现，有需求时在 `./crypto` 内扩展。
3. **node-forge 是 `./crypto` 的静态依赖**：未配加密的 Web 部署若引了 `./crypto` 会把它打进包里（约 90KB gzip）；主入口消费方不受影响。
4. **adapter 的 `t` 当前只服务少数内置文案**：登出确认弹窗标题等；前端 i18n 方案定型后复核键位布局。
5. **上游 README 漂移已发现两处**，后续迁移 `@core` 其余包时 README 一律以源码为准。

## 验证

| 项       | 命令                                 | 结果                                                 |
| -------- | ------------------------------------ | ---------------------------------------------------- |
| 构建     | `pnpm run build`                     | 14 个产物 10.5kB，三入口 dist 齐全（.js + .d.ts）    |
| 类型检查 | `pnpm run typecheck`                 | 0 错误                                               |
| 测试     | `pnpm run test`                      | 8 个文件 87 用例全绿（含新增 bizCode 优先/回落用例） |
| Lint     | 根 `eslint .` + 包内 `pnpm run lint` | service 0 错误（显式返回类型已补齐）                 |
| 加密隔离 | 检查 dist 主入口与 request/*.js      | 无 node-forge 引用                                   |
| 回归     | @fedstack/axios 110 用例             | 全绿                                                 |
