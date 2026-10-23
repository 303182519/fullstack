# ADR-015：packages 运行时四层分组与 ESLint 边界规则

- 状态：已接受
- 日期：2026-10-23
- 影响范围：`packages/`（全量重组为 `shared|node|web|tooling` 四层）、根 `eslint.config.js`（新增边界规则块）、`pnpm-workspace.yaml`（workspace glob）、`.gitignore`、4 个包的 `tsconfig.json`、`docs/plans/nest-admin-soybean-migration.md`（路径引用同步）

## 背景

`packages/` 平铺结构在五包阶段（database / redis / health / auth-core / eslint-config）尚可辨认，但前端双 app（`apps/admin`、`apps/web`，当前为空壳）启动后必然催生共享 UI / hooks / api-client 等浏览器专用包，平铺目录无法表达「能否进浏览器产物」这一运行时边界。

风险分级：浏览器产物误引 Node 专用包（如 `@fedstack/redis`）属于**构建期/运行期爆炸**事故（正确性，工程优先级第 1 位）；而包的角色归属不清仅是可维护性问题（第 6 位）。因此以**运行时环境**为第一分层维度，角色（infra / domain / contract / ui）由包命名与本类 ADR 表达，不开第二级目录。

规模前提：按路线图估算 packages 最终 10~20 个（前端 ui/hooks/api-client 三件套 + 后端 P4 沉淀 + 契约包），二维结构的收益在该量级最大，且不产生 Nx 级重型仓维护税。

## 决策

### D1 运行时四层目录分组，包名不加层前缀

```
packages/
  shared/    零环境依赖，前后端皆可 import（auth-core）
  node/      Node/NestJS 专用（database、redis、health）
  web/       浏览器专用（预留：ui、hooks、api-client 等）
  tooling/   构建与 lint 工具链（eslint-config），不进运行时
```

- 包名维持 `@fedstack/<name>` 不变：目录已表达层信息，名字重复层前缀是冗余；且包名不变意味着**零 import 改动**，归位为纯物理移动。
- `pnpm-workspace.yaml` 的 glob 由 `packages/*` 改为 `packages/*/*`（一处改动覆盖四层）。

### D2 边界规则收口于根 `eslint.config.js`，包名清单自动派生

五组规则块（追加在 `base()` 之后）：

| 规则块                      | 作用文件                                     | 禁止内容                                                                                                                                 |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `boundary-shared`           | `packages/shared/**`                         | Node 内置模块（`builtinModules` 全量 + `node:` 前缀形）、node/web/tooling 层包名、apps 包名、指向 node/web/tooling/apps 的相对路径说明符 |
| `boundary-web`              | `packages/web/**`                            | node 层包名、apps 包名及对应相对路径                                                                                                     |
| `boundary-node`             | `packages/node/**`                           | web 层包名、apps 包名及对应相对路径                                                                                                      |
| `boundary-tooling`          | `packages/tooling/**`                        | apps 包名及对应相对路径                                                                                                                  |
| `js-unused-vars-workaround` | 根 `*.config.js`、`packages/tooling/**/*.js` | 见「已知限制 4」                                                                                                                         |

- 各层包名清单在配置加载时**从目录结构自动派生**（读 `packages/<层>/*/package.json` 与 `apps/*/package.json`）：新增包即刻纳入边界，无需手工维护名单。
- 拦截双通道均为 core `no-restricted-imports`：包名通道覆盖 workspace 内跨包引用的正规途径（group 条目自动匹配子路径导入，如 `@fedstack/admin-api/src/*`）；相对路径通道拦截深相对引用（如 `../../../node/database/src/index.js`）。
- 兜底：漏网者由浏览器 bundler / tsc 对 Node builtins 的解析错误在构建期拦截（零配置）。

### D3 前后端契约共享形态（访谈结论备忘）

- 常量 / 枚举 / 权限码：走 shared 层包（`auth-core` 模式，已验证三消费方：后端鉴权声明、数据库播种、前端按钮显隐）。
- API 请求/响应契约：走 **OpenAPI 生成客户端**（落 shared 层 contract 角色包），与既有 `docs/plans/contracts/phase-X.json` 验收快照同一管道；前端不 import 后端 DTO 类。
- 不引入 zod 双端复用：避免 Prisma / class-validator / zod 三份 schema 真相源并存（违反「不制造重复数据源」准则）。

### D4 构建产物策略按层分化，web 层选型推迟

- node / tooling / shared 维持 `tsc` 出 dist 不动：shared 层保持「纯 TS、零环境依赖」纪律（`auth-core` 为样板），tsc 的 ESM 产物天然浏览器安全，单 `import` 条件即可，无需 dual publish。
- web 层构建工具（tsup / rolldown / 源码导出）由**第一个真实 UI 包的需求**驱动选型（CSS / 资源处理需求未定时不预选）。

## 备选方案

- **平铺 + 包名层前缀（`@fedstack/node-redis`）**：包名即文档，但 5 个存量包的所有消费方 import 与 package.json 依赖名全量改，成本全仓扩散；且目录依旧平铺，不解决原始痛点。
- **平铺 + package.json 自定义元数据**：边界只存在于元数据，文件系统观感不变，lint 规则需读取并信任脆弱的手工标注。
- **dependency-cruiser / Nx module-boundaries**：规则表达力最强，但对 10~20 个包是杀鸡用牛刀，多一份工具链维护税。
- **zod schema 双端复用**：见 D3，第三 schema 源。

## 已知限制与跟进项

1. **相对路径通道按说明符字面量匹配**：antfu 9.x 集成的 `eslint-plugin-import-lite@0.6` 无 `no-restricted-paths` zone 规则（已核实其 dist 仅 4 条 no-* 规则），故 `'../**/node/**'` 类模式对「包内出现与层同名目录（node/web/apps）」的相对引用会误判。属可接受防护面，触发时改名目录即可。
2. **redis / health 自管 lint**（根配置 ignores，DI 令牌擦除问题见 ADR-003 修订）：边界规则不覆盖其包内文件。两包无跨层依赖需求，接受此缺口；如需同等约束，在其包级 `eslint.config.js` 追加相同 rules 块。
3. **apps 端边界未落地**：浏览器 app 禁引 node 层包的规则需写入 `apps/admin` / `apps/web` 未来的 `eslint.config.js`（root 配置按分层 lint 架构不覆盖 apps）。落地时点：前端脚手架建立时。
4. **`eslint-plugin-unused-imports` × ESLint 10 兼容性误报**：JS 文件内所有 `const` 绑定被误判为 "only used as a type"（最小探针已复现；TS 文件免疫；core `no-unused-vars` 在 JS 上工作正常）。`js-unused-vars-workaround` 块在根级配置文件与 tooling 包 JS 文件上关闭该插件规则，core 规则兜底。升级 eslint / 插件后应复查移除。
5. **历史文档旧路径不回改**：ADR-001~014 及 `docs/guide/` 中的 `packages/database` 等路径为当时记录；living 路线文档（`docs/plans/nest-admin-soybean-migration.md`）已同步新路径。

## 存量包归位清单

| 包                        | 新位置                           | 层      | 归位理由                                                          | 消费方改动     |
| ------------------------- | -------------------------------- | ------- | ----------------------------------------------------------------- | -------------- |
| `@fedstack/auth-core`     | `packages/shared/auth-core`      | shared  | 纯常量+类型、零运行时依赖，出口注释声明三消费方（后端/播种/前端） | 无（包名不变） |
| `@fedstack/database`      | `packages/node/database`         | node    | Prisma + `@prisma/adapter-mariadb`，Node 专用                     | 无             |
| `@fedstack/redis`         | `packages/node/redis`            | node    | peerDeps 挂 `@nestjs/*`、`@keyv/redis`                            | 无             |
| `@fedstack/health`        | `packages/node/health`           | node    | peerDeps 挂 `@nestjs/terminus`                                    | 无             |
| `@fedstack/eslint-config` | `packages/tooling/eslint-config` | tooling | 构建期 lint 配置，不进运行时                                      | 无             |

配套改动：`pnpm-workspace.yaml` glob、4×`tsconfig.json` extends 深度（`../../` → `../../../`）、`.gitignore` 生成物路径、redis/health 包级 eslint 注释、路线文档 3 处引用、根 `eslint.config.js` ignores 路径。执行侧记录：`git mv` 对 3 个含包级 eslint 配置的目录报 Permission denied（IDE eslint-server watch 句柄），改用 `Move-Item` 完成；git 全部识别为 rename（55 个），历史保留。

## 验证

| 项                         | 命令                                                                      | 结果                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 四包构建                   | `turbo run build --filter=@fedstack/{auth-core,database,redis,health}`    | 4/4 成功（Prisma Client 正常生成）                                                                      |
| 消费方类型检查             | `turbo run typecheck --filter=@fedstack/admin-api --filter=@fedstack/api` | 6/6 任务成功                                                                                            |
| 边界规则误报               | `eslint .`（全仓）                                                        | 0 条 `no-restricted-imports` 触发；总错误 123 均为既有基线（pnpm-workspace.yaml / md 文件），与本次无关 |
| 边界规则有效性（tripwire） | 临时违规文件 ×2 后删除                                                    | 5/5 命中：Node builtins、node 层包名、app 包名（含子路径）、深相对路径、node→app 方向                   |
| 配置文件自洁               | `eslint eslint.config.js`                                                 | 0 问题                                                                                                  |
