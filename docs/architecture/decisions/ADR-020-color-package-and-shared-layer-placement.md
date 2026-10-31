# ADR-020：@fedstack/color 落地与 shared 层归属

- 状态：已接受
- 日期：2026-10-31
- 影响范围：新增 `packages/shared/color`（`@fedstack/color`）；`pnpm-workspace.yaml` catalog；`pnpm-lock.yaml`

## 背景

需要把 `@skyroc/color` v2.6.1（`https://github.com/Ohh-889/skyroc/tree/master/packages/%40core/color`，快照 commit `10ddd27`）迁移进本仓库，并符合本仓架构。

上游资产：

1. 三套色板生成算法：Ant Design HSV、推荐算法（deltaE 匹配内置 Tailwind 色板）、OKLCH 感知均匀算法。
2. WCAG 对比度检测、暗色模式色板、1500+ 色名匹配、颜色格式转换与混合工具。
3. 内置 Tailwind 风格色板数据（22 个色族 × 11 档），以及 6 个 vitest 测试文件（146 个用例）。

已核实：上游源码只依赖 `colord` 与 `culori`，零 DOM / BOM 全局引用，零 Node 内置模块引用；`src/shared/colord.ts` 在模块加载时通过 `extend()` 注册 colord 插件，属于模块级副作用。

本仓现状：`packages/` 按 shared/node/web/tooling 四层分组（ADR-015）；catalog 中此前没有 colord / culori；`@fedstack/web-admin-shell` 的主题配置存在 `recommendColor` 字段，但尚无实现；全仓无任何色板生成能力。

## 决策

### D1 新增 `packages/shared/color`，包名 `@fedstack/color`

- 归属 shared 层：源码平台无关，前端应用与未来的 Node 侧脚本（设计 token 生成、对比度校验）皆可 import。
- 中立 tsconfig（`lib: ES2023`、`types: []`）把「零宿主依赖」从口头约定变成编译期约束。
- 全量迁移上游能力，避免主题系统后续补 OKLCH / WCAG 时二次改动。

### D2 `tsc` 产出 `dist`，单入口、私有包

- 对齐 `@fedstack/auth-core` 的 shared 层范式（ADR-015 D4）：`private: true`，`tsc` 出 ESM + d.ts。
- 单入口 `"."` 与上游一致；命名导入由消费方 bundler tree-shake。
- `sideEffects` 固定为 `["./dist/shared/colord.js"]`，防止 bundler 删除 colord 插件注册这一必要的模块级副作用。

### D3 依赖由 catalog 单一管理

- shared 分组新增：`colord: ^2.9.3`、`culori: ^4.0.2`，dev `@types/culori: ^4.0.1`；包内一律写 `catalog:`。
- `colord` 2.9.3 是该库当前终版，caret 实际等同于锁定，同时避免在包内出现第二处版本声明。

### D4 对外 API 与上游保持一致

- 保留 `@deprecated` 的 `generateOklchPaletteEx` 别名、`getColorPalette` 的双形态入参，以及 `src/{types,shared,constant,palette}` 目录结构。
- 目的：迁移结果可回归、可持续对照上游 diff；删除别名与重排目录属于与迁移无关的清理。

### D5 测试按上游基线移植

- 6 个测试文件原样迁移，改用 `@fedstack/config/vitest` 的 node 环境基础配置；不设覆盖率门槛（无历史基线，凭空阈值会制造虚假的完成信号）。

### D6 保留 MIT 声明并补齐本仓文档

- 包根 `NOTICE` 记录来源 URL、版本、快照 commit、修改点与 MIT 全文；包自身许可仍为 `UNLICENSED`。
- `README.md` 迁移上游内容并标注本仓差异；包级 `AGENTS.md` 记录命令与边界。

### D7 本次不接入 admin 主题

- `recommendColor` / 主题色板接入涉及主题状态、`Theme.ThemeSetting` 契约与 antd 主题算法，属独立功能变更，另立任务。
- 不给 `@fedstack/web-admin-shell` 添加未使用的依赖。

## 备选方案

- **放 web 层**：当前消费方只有浏览器端，但会把「平台无关」的能力锁死在 web 层；未来 Node 侧复用需要挪包。
- **源码直出（无 build）**：省一个构建步骤，但 node 侧 tsc 消费方无法直接消费 workspace 内的 TS 源码。
- **rslib bundleless**：与 `@fedstack/utils` 一致，但对本包没有额外收益，且多一套构建配置。
- **可发布包**：本仓无发布意图，`private` 更明确。
- **直接依赖 npm 上的 `@skyroc/color`**：引入外部供应链与版本漂移，且无法按本仓规范适配 lint / TS 严格性。

## 相对上游的修改（无行为变化）

1. `@fedstack/tsconfig` 基线开启 `noUncheckedIndexedAccess`：在 `antd.ts` / `palette/index.ts` / `oklch.ts` 及测试中补充非空断言（索引值由固定 11 档结构保证存在）。
2. 本仓 eslint 要求显式返回类型：为全部导出函数与内部工具函数补充返回类型注解。
3. `eslint --fix` 统一了引号、尾逗号、import 排序、箭头函数括号与 README 代码块格式。
4. 包名、构建方式、依赖声明、测试与 lint 配置按本仓约定调整。
5. `src` 内相对导入统一补 `.js` 扩展名（目录导入写全 `./x/index.js`）：`tsc` 不改写导入路径，Node ESM 无法解析扩展名缺省或目录导入；这是本仓 ESM 产物的既有约定（同 `@fedstack/auth-core`、`@fedstack/utils`）。

## 已知风险与跟进项

1. **无 admin 消费方**：本次只交付包，`recommendColor` 仍是未实现配置；接入时需单独评估主题 store 与 antd token 的改动面。
2. **中性 tsconfig 的依赖类型**：`@types/culori` 若未来版本间接引用 DOM 类型，会在 typecheck 阶段暴露；届时按需调整，不用放宽 `lib` 掩盖。
3. **色名表体积**：`constant/name.ts` 约 44KB，只有调用 `getColorName` 时才会进入依赖图；若未来出现包体积问题，再评估子路径导出，不在本次提前拆分。

## 验证

| 项         | 命令                                              | 结果                          |
| ---------- | ------------------------------------------------- | ----------------------------- |
| 安装       | `pnpm install --no-frozen-lockfile`               | 成功，锁文件已更新            |
| 构建       | `pnpm --filter @fedstack/color build`             | 成功（tsc 产出 dist）         |
| 类型检查   | `pnpm --filter @fedstack/color typecheck`         | 成功（src + tests）           |
| 测试       | `pnpm --filter @fedstack/color test`              | 6 个文件 / 146 个用例全部通过 |
| Lint       | `pnpm --filter @fedstack/color lint`              | 0 问题                        |
| ESM 冒烟   | `node --input-type=module -e "import('./dist/index.js')…"` | 成功（Node 直接加载 dist，三算法返回预期值） |
| 规范索引   | `pnpm docs:check`                                 | 成功                          |
