# ADR-010：功能权限码注册表收敛为共享包 `@fedstack/auth-core`

- 状态：已采纳（2026-10-19）
- 日期：2026-10-19
- 影响范围：`packages/auth-core`（新增）、`packages/database/src/seed.ts`、`packages/database/package.json`、`apps/admin-api/package.json`、`apps/admin-api/src/modules/`（user/role/dept/dict/config/monitor 控制器）、`apps/admin-api/src/common/decorators/require-permission.decorator.ts`；删除 `apps/admin-api/src/common/constants/permissions.ts`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`、`.rules/database/AGENTS.md`；前置文档：`ADR-001`（共享持久化层）、`ADR-003`（抽包先例）、`ADR-008`（权限模型）、`ADR-009`（遮蔽与审计）、路线图 `docs/plans/nest-admin-soybean-migration.md`

---

## 1. 背景（事实依据）

- `ADR-008 §5` 曾写明权限码集中登记在 `apps/admin-api/src/common/constants/permissions.ts`，并承诺「**P2 播种脚本 import 同一份常量，不产生二次硬编码**」。
- 该承诺在 P2 落地时**未被实现**：`packages/database/src/seed.ts` 的 `MENU_TREE` 直接硬编码了 25 个 `permCode` 字符串字面量（证据：改动前 `seed.ts` 的按钮节点定义），并在文件头注释自述「与 permissions.ts 保持**人工同步**……review 时必须对照」（证据：改动前 `seed.ts` 第 14–15 行）。
- 漂移是**双向且静默**的：注册表与播种字面量任一侧改动、另一侧漏改，既无编译报错也无测试报错，只能在线上表现为按钮鉴权失灵后才暴露——这正是 `permissions.ts` 头部注释自身警告的场景。
- **根因是落点错误而非疏忽**：`seed.ts` 运行在 `packages/database`，而本仓库依赖方向为 `app → package`（package 禁止反向 import `apps/*`，证据：改动前 `seed.ts` 第 13 行注释）。注册表当时位于 `apps/admin-api` 内，播种脚本**在依赖方向上根本 import 不到**，只能退化为硬编码。
- 注册表是**框架无关的纯字符串常量**，但有横跨进程边界的多个消费方：① admin-api 控制器的 `@RequirePermission` 声明；② 播种脚本写入 `sys_menu.perm_code`；③ 前端按钮显隐判定（将来）。三处均无法互相 `import`。
- 本仓库抽包纪律（`ADR-003` / `ADR-004` 先例）：**框架无关 + ≥2 处复用**即可沉淀为共享包。此处消费方为 2 处（后端 + 播种）且有第 3 处预告，满足条件。
- 路线图 §10「下一步行动」第 1 项本已规划 `packages/auth-core`（JWT 策略、argon2 工具、权限装饰器骨架）为「立即执行」，但未实际创建（证据：改动前 `packages/` 下仅有 `database` / `health` / `redis` / `eslint-config`）。

## 2. 问题

如何让 `sys_menu.perm_code` 的权限码在一处定义、被「无法互相 import 的多个消费方」共同引用，且不破坏既有依赖方向与包边界？（在「不过度抽象」前提下。）

## 3. 决策（最终）

### D1 权限码注册表收敛为共享包 `packages/auth-core`（`@fedstack/auth-core`）

- 注册表（`PERMISSIONS` 常量 + `PermissionCode` 字面量联合类型）迁入 `packages/auth-core/src/permissions.ts`，并从包入口导出。
- 本包**当前只导出框架无关的纯常量**：零运行时依赖、零 `peerDependencies`（不依赖 NestJS / Prisma / 任何库），保证三类消费方都能直接引用，不因宿主框架被绑定。

### D2 播种脚本引用注册表，并以类型收窄兜底

- `seed.ts` 从 `@fedstack/auth-core` 引入 `PERMISSIONS`，25 处硬编码 `permCode` 全部替换为 `PERMISSIONS.*` 引用。
- `MenuSeedNode.permCode` 由 `string` 收窄为 `PermissionCode`：写入库的编码必须来自注册表，**拼错即编译错误**，与 `@RequirePermission` 同一道护栏。

### D3 应用侧引用改向，不保留 re-export 垫片

- 6 个控制器与 `require-permission.decorator.ts` 改为直接从 `@fedstack/auth-core` 引入 `PERMISSIONS` / `PermissionCode`。
- 删除 `apps/admin-api/src/common/constants/permissions.ts`（不留兼容转发层，避免第二处真相源残留）。
- 导入排序由 ESLint（`perfectionist/sort-imports`）归一——`@fedstack/auth-core` 归入外部依赖组，排序在 `@nestjs/*` 之前。

### D4 依赖方向保持单向、无环

- 新增边：`apps/admin-api → @fedstack/auth-core`、`packages/database → @fedstack/auth-core`。
- `@fedstack/auth-core` 为**零依赖叶子包**，不存在与任何包的循环；与 `ADR-001`（database 只导出 Prisma Client 类型/连接工厂）边界不冲突——注册表不再进入持久化包。

### D5 Lint 与构建分层沿用既有先例

- 本包框架无关、无 DI/装饰器，故**不自带** `eslint.config.js`、**不配置** `lint` 脚本，直接由根 `eslint.config.js` 的 `base()` 配置统一 lint（与 `packages/database` 同构）；代码风格遵循 packages 标准（带分号、单引号、2 空格）。
- 构建走 `tsc`，产物 `dist/src/index.js`，`exports` 指向 `./dist/src/index.js`（与 `health` / `redis` 模板一致）；`turbo` 依 `dependsOn: ["^build"]` 保证 `auth-core` 先于消费方构建。

## 4. 备选方案与取舍

- **A. 注册表放进 `packages/database` 并从其入口导出（否决）**：零新包且 admin-api 已依赖 database，但违反 `ADR-001`「database 只导出 Prisma Client 类型/实例能力与连接参数工厂」的公开出口边界，让持久化层承载 RBAC 语义，需同时修订 `ADR-001`，边界不干净。
- **B. 维持双份 + 人工同步（否决，即被修正的现状）**：坦白说这是最省事的方案，但漂移没有任何编译或测试护栏，属「生产事故级风险」（同 `ADR-003` 对双份连接纪律的判定）。
- **C. 维护「路由 ↔ 权限码」映射表或运行期校验（否决）**：绕远且仍需要一个共享来源；`ADR-008 §4 G` 已否决过同类「映射表」思路。
- **D. 暂不抽包，等前端真实需求出现再迁移（否决）**：与 `ADR-003 §4 C` 相反——当前上下文最完整、消费方刚落地、迁移成本最低；等第二/第三个消费方火烧眉毛时在时间压力下做架构变更，质量风险更高。

## 5. 后果

**正面**

- `sys_menu.perm_code` 全局单一真相源：注册表改动一处，鉴权声明与播种数据同步生效，不存在漂移窗口。
- 「拼错即编译错误」护栏从 `@RequirePermission` 扩展到播种脚本（`MenuSeedNode.permCode: PermissionCode`），错字不再可能写入数据库。
- 前端将来的按钮显隐判定可直接复用同一份常量（框架无关，无宿主绑定）。
- `ADR-008` 的原承诺（播种脚本 import 同一份常量）由本次变更**真正兑现**，文档与实现重新对齐。

**负面 / 风险**

- `@fedstack/auth-core` 当前只含常量，包名预留了路线图 §10 规划的后继内容（JWT 策略、argon2 工具、权限装饰器骨架）。届时引入 Node/NestJS 专属依赖会改变本包的依赖边界，必须重新评估（尤其若前端已开始消费本包，需拆分框架无关常量与运行时实现）并补充 ADR。**当前零依赖，无此风险**。
- 新增 `packages/auth-core` 使参与构建的 workspace 包由 8 增至 9，构建时间与 `pnpm install` 链接开销略增（可忽略）。
- 种子数据本身不在自动化校验范围内（`prisma db seed` 需真实数据库），本次以「类型收窄 + 全量 typecheck」替代运行期断言；播种的行为验收仍依赖 P2 既有的集成/联调环境。

## 6. 验证（2026-10-19 实测）

| 校验                    | 命令                                                                       | 结果                                                        |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 依赖安装（workspace 链接） | `pnpm install --no-frozen-lockfile`                                        | 通过，scope 由 8 → 9 个 workspace 项目                      |
| 新包构建 / 类型         | `pnpm --filter @fedstack/auth-core build` / `typecheck`                    | 通过                                                        |
| 全量类型检查            | `pnpm typecheck`                                                           | 10/10 通过                                                  |
| 全量构建                | `pnpm build`                                                               | 6/6 通过                                                    |
| 全量测试                | `pnpm test`                                                                | 8/8 通过（admin-api 22 文件 / 230 用例全绿）                |
| Lint（改动文件）        | `eslint packages/auth-core packages/database/src/seed.ts`；admin-api 改动文件 | 0 问题                                                      |
| 导入排序                | `eslint --fix`（6 控制器）                                                 | 已归一，复查 0 问题                                          |

> 说明：`packages/auth-core` 为纯常量包，无需单元测试；其正确性由消费方的类型检查（`PermissionCode` 收窄）与全量构建/测试覆盖。
