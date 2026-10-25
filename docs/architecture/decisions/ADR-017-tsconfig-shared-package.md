# ADR-017：tsconfig 抽离为 @fedstack/tsconfig 共享包

- 状态：已接受
- 日期：2026-10-25
- 影响范围：`packages/tooling/tsconfig/`（新增）、全部 tsconfig 消费方（2 apps + 8 packages 的 tsconfig.json 与 package.json）、`turbo.json`；删除根 `tsconfig.base.json` 与 `packages/web/tsconfig.base.json`

> **2026-10-25 修订（遗留问题收口）**：验证节记录的两个既有问题均已处置——①`prisma generate` 竞态：拆为独立 turbo 任务 `db:generate`（`outputs: ["generated/prisma/**"]`），`@fedstack/database#build` / `#typecheck` 均 `dependsOn: ["db:generate"]`，包脚本不再自带 generate，每轮只跑一次，竞态从根上消除；②实时推送 env 测试：按用户决策删除该 describe 块（实现侧为 `jobs.controller.ts` 硬编码常量，不违反 ADR-013「需显式配置」字面约束），admin-api 测试 346/346 全绿。

## 背景

TS 基座以根 `tsconfig.base.json` + `packages/web/tsconfig.base.json` 两层相对路径继承存在，三个问题：

- **形态不统一**：同为共享配置，ESLint 已是 `@fedstack/eslint-config` 包（exports 子路径映射），tsconfig 却是裸文件相对引用；新包继承时要数 `../` 层级，决策成本随四层分组（ADR-015）加深。
- **环境语义泄漏**：`emitDecoratorMetadata` / `experimentalDecorators` 是 NestJS DI 专属开关，却挂在根 base 被 web 层包白继承；`declaration` 同理（只有构建产物的包需要）。
- **根目录整洁**：base 文件占住仓库根，与「根只放宪法级文件」的收口方向冲突。

## 决策

### D1 落位 `packages/tooling/tsconfig`，包名 `@fedstack/tsconfig`

对齐 `@fedstack/eslint-config` 形态先例：纯 JSON + README，无 src / 无构建 / 无测试脚本（turbo 自动跳过）；`exports` 暴露 `./base.json` / `./node.json` / `./web.json` 三个子路径。消费方经 `extends: "@fedstack/tsconfig/<preset>.json"` 包名引用——extends 经 node_modules 符号链接解析，故各消费方需声明 `"@fedstack/tsconfig": "workspace:*"` devDependency。

### D2 三 preset 划分，装饰器与 declaration 下放

| Preset      | 内容                                                            | 消费方                             |
| ----------- | --------------------------------------------------------------- | ---------------------------------- |
| `base.json` | 环境无关最小公共集（target / strict 家族 / interop 等）         | 不直接消费，仅作 node/web 共同父级 |
| `node.json` | base + nodenext 解析 + 装饰器两开关 + `declaration`             | apps、node / shared / tooling 层包 |
| `web.json`  | base + bundler 解析 + DOM lib + `declaration`（rslib dts 消费） | web 层包                           |

轻治理原则：

- 装饰器两开关与 `declaration` 从旧根 base 挪入对应 preset，web 包不再白继承装饰器开关——web 包无装饰器源码，零行为变化。
- 严格度开关（strict 家族）一律保持现状值逐字搬运，不做顺手收紧。
- 不拆 node-lib / node-app：apps 继承 `declaration: true` 是现状无害行为；细分需求出现时经 ADR 新增 preset，不预留空 preset。

### D3 旧文件全删，缓存依赖改写

根 `tsconfig.base.json` 与 `packages/web/tsconfig.base.json` 删除；`turbo.json` 的 `globalDependencies` 把 `tsconfig.base.json` 替换为 `packages/tooling/tsconfig/base.json`。ADR-001 与 ADR-016 中「extends 根 tsconfig.base.json / packages/web/tsconfig.base.json」的描述为决策时点快照，不回改，继承路径以本文为准。

## 备选方案

- **保留根 base 现状**：零迁移成本，但形态分裂与环境语义泄漏持续累积，每新增一个包都重复付一次决策成本。
- **更细 preset（node-lib / node-app / web-app）**：四份起步是过度设计；三份已覆盖全部现状消费方，细分收益抵不上维护面。
- **并进 @fedstack/config**：config 包定位是「裸 TS 源码直出的运行时无关常量」，tsconfig 是纯 JSON 构建配置，混入会污染其形态。

## 已知限制与跟进项

1. **apps 继承 `declaration: true`**：nest build 不经 tsc -p 读取该开关，现状无害；如未来为 apps 定制 preset 再剥离。
2. **`base.json` 保留被注释掉的 `incremental` 参考块**：沿用旧根 base 的参考注释风格，未启用。
3. **turbo 缓存键**：preset 内容变更通过 workspace 依赖图使下游包缓存失效，`base.json` 另在 `globalDependencies` 兜底。

## 验证

| 项       | 命令                                        | 结果                                                                                                          |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 依赖链接 | `pnpm install --no-frozen-lockfile`         | 15 个 workspace 项目（新增 @fedstack/tsconfig），lockfile 更新                                                |
| 类型检查 | `pnpm run typecheck`                        | 15/15 通过（extends 经 node_modules 符号链接解析生效）                                                        |
| 构建     | `pnpm run build`                            | 9/9 通过（node 层 tsc 直建、web 层 rslib dts，产物齐全）                                                      |
| 测试     | `pnpm run test`                             | 除 admin-api 2 个既有失败外全绿（见下）                                                                       |
| Lint     | 根 `eslint .` + `turbo run lint --continue` | 新包与全部改动文件 0 问题；既有基线（pnpm-workspace.yaml yaml/sort-keys、api 52、admin-api 43+1）与迁移前一致 |

测试例外说明：admin-api `test/unit/config/env.validation.spec.ts` 实时推送段 2 个用例断言 `REALTIME_MAX_CONNECTIONS` / `REALTIME_HEARTBEAT_MS`，而 src 全目录无这两个键（测试提交于 bf6a554，基线 HEAD 即红），与本次 tsconfig 迁移无关（admin-api 迁移前后有效 compilerOptions 逐字段一致）。
