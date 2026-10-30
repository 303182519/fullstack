# 阶段 3 执行清单 · 布局壳（Skyroc 对齐版）

> 本文是阶段 3 的**施工清单**，每个 SK 子阶段设计为**一次独立会话可完成**。
> 架构依据见 `docs/guide/skyroc-admin-layout-architecture-explained.md`。
> 总计划见 `.scratch/admin-migration-plan.md`。
>
> 已锁定决策（2026-10-30 访谈）：
> - **Q1** 六种布局模式**全做**
> - **Q2** 放 `packages/web/admin`（包名 `@fedstack/web-admin-shell`），新建 `layouts/` 域
> - **Q3 + Q4 裁决为 A**：**文件式静态路由** + 菜单树只做导航 UI，不做动态路由注册
> - **Q5** 标签页 Keep-Alive 对齐 Skyroc（**实现待核实**，见 §SK-3.5）
> - **Q6** 布局态用 **Zustand**（见 §0.2 对「两个 store」的修订）
> - **Q7** 主题预留 **CSS 变量 + 静态配置**，不做主题切换

---

## 0. 施工前必读

### 0.1 依赖关系图（严格串行，不可乱序）

```text
SK-3.0 基建对齐（别名 / 依赖 / 目录）
   │
   ├── SK-3.1 materials 骨架（六模式骨架，先 vertical 可跑）
   │      │
   │      ├── SK-3.2 布局状态 + 尺寸纯函数 + CSS 变量
   │      │      │
   │      │      ├── SK-3.3 菜单（DTO→UI + 侧栏渲染）
   │      │      │      │
   │      │      │      └── SK-3.4 顶栏（Logo / 面包屑 / 用户区 / 插槽）
   │      │      │             │
   │      │      │             └── SK-3.5 标签页 + Keep-Alive
   │      │      │                    │
   │      │      │                    └── SK-3.6 六模式补齐（horizontal / mix / hybrid ×3）
   │      │      │                           │
   │      └──────┴───────────────────────────┴── SK-3.7 接线 + 验收
```

**为什么串行**：SK-3.2 的尺寸函数需要 SK-3.1 的骨架 prop 契约；SK-3.6 的模式补齐依赖 SK-3.3 的菜单层级结构（`childLevelMenus` / `secondLevelMenus` 是宽度分支的输入）。

### 0.2 对 Q6「两个 store」的修订建议

原答「两个 store」。开工后发现 **tabs 需要第三个状态容器**，理由：

1. tabs 有**独立生命周期**：关闭标签要清理对应缓存、登出要整表清空（阶段 2 的 `queryClient.clear()` 之外还要清 tabs）；
2. tabs 状态**不随布局折叠/全屏变化**，混进 `layout.ts` 会让订阅粒度变粗，侧栏折叠时标签条也跟着重渲染；
3. Skyroc 本身也是 `state/tabs/` 独立域。

**建议改为三个 store**：`store/layout.ts`、`store/menus.ts`、`store/tabs.ts`。
若坚持两个，则 tabs 并入 `layout.ts`——但需接受上述重渲染代价。**SK-3.5 开工时二次确认。**

### 0.3 每阶段验收纪律（三项全绿才算完成）

```powershell
pnpm --filter @fedstack/admin typecheck
pnpm --filter @fedstack/admin lint
pnpm --filter @fedstack/admin build
```

壳包自身还要跑：

```powershell
pnpm --filter @fedstack/web-admin-shell typecheck
pnpm --filter @fedstack/web-admin-shell test
```

---

## SK-3.0 基建对齐：建 layouts 域 + 接线

**目标**：让 `apps/admin` 能 `import { AdminLayout } from '@shell/layouts'`，且构建通过。**不写任何布局业务代码。**

### 事实基线（已核实，2026-10-30 复核）

| 项 | 现状 |
|---|---|
| 壳包名 | `@fedstack/web-admin-shell`（`packages/web/admin/package.json:2`） |
| 壳包现有域 | `src/theme`、`src/ui`、`src/styles`（SK-3.0 后新增 `src/layouts`） |
| 壳包 exports | **无 `exports` 字段**，无打包脚本，只有 lint/test/typecheck |
| apps/admin 依赖 | **未依赖** `@fedstack/web-admin-shell`——**也不需要**，见下 |
| 路径别名 | **已存在**：`apps/admin/tsconfig.json` 已有 `"@shell/*": ["../../packages/web/admin/src/*"]`，`apps/admin/src/plugins/assets.ts` 已在用 `@shell/styles/global.css` |
| 构建期别名解析 | rsbuild 2.2.14 默认 `resolve.aliasStrategy: 'prefer-tsconfig'`，直接读 tsconfig `paths`，无需 `source.alias` |
| 壳包 typecheck 基线 | **红**：`theme/setup.ts` 缺 `./hooks`、`ui/compose` 缺 `@iconify/react`（2 个历史错误，非本阶段引入） |
| 壳包 lint 基线 | **红**：`theme/config/default.ts` 26 个 trailing-comma / quote-props 历史错误 |

### 任务

1. **读现状**：`packages/web/admin/tsconfig.json`、`eslint.config.js`、`src/theme/index.ts`、`src/ui/*/index.ts`，确认现有导出风格（barrel export？子路径导出？）。
   → 结论：每个域一个 `index.ts` barrel（`theme/index.ts`、`ui/compose/index.ts`、`ui/antd/index.ts`），`layouts` 沿用。
2. **决定引用方式**：**用已有 `@shell/*` 源码直引**，不新增 `exports`、不引入壳包构建链。
   - 包名子路径（`@fedstack/web-admin-shell/layouts`）在无 `exports` 且源码在 `src/` 下时**不可解析**，故不采用。
   - 因此 `apps/admin/package.json` **不需要**加 `@fedstack/web-admin-shell` 依赖（别名是相对路径，不经过包解析）。
3. 在 `packages/web/admin/src/layouts/` 建骨架（见「产出」）。
4. `packages/web/admin/package.json` 加 `"react": "catalog:"` 到 `dependencies`：`context.tsx` 运行时需要 `createContext`，且壳包 `node_modules` 里没有 react 就属于幽灵依赖（与既有 `antd` 用 catalog 直依赖的做法一致）。
5. 在 `packages/web/admin/eslint.config.js` 追加 `no-restricted-imports`：禁止 `@/*`、`~/*`（应用侧别名），已实测拦得住。

### 关键坑（实测）

- **禁止在 `layouts` 里 import 主题域类型**。`import type { ThemeLayoutMode } from '@shell/theme/types'` 会把 `theme/types/index.ts` 拉进 `apps/admin` 的编译程序，而 `theme.d.ts`（全局 `Theme` 命名空间）不在 app 的 `include` 内 → 全部 `TS2503 Cannot find namespace 'Theme'`。
  - 结论：`LayoutMode` 联合类型在 `layouts/constant.ts` 内本地声明（附注释：与 `Theme.ThemeLayoutMode` 保持同步直到阶段 4 收敛）。
- `verbatimModuleSyntax: true` 在 app 侧生效，壳包源码被 app 一起编译，类型导入必须写 `import type`。


### 知识点

- **为什么源码直引而不构建**：skyroc 的零包化 commit 明确说这套壳「消费者必然要修改」，源码直引让改壳包时热更新即时生效，无构建中间层。
- **壳包不能反向依赖 app**：`layouts/` 里禁止 `import '@/...'`（app 的别名）。壳包只能依赖 `@fedstack/*` 公共包与 peer 依赖。这条要在 `eslint.config.js` 加 `no-restricted-imports` 守卫。
- **peer 依赖**：`antd` / `react` / `@tanstack/react-router` / `zustand` 在壳包里用 **catalog 直依赖**（本仓既有做法，catalog 保证同一版本、同一物理副本），避免双份 React。

### 产出

- `packages/web/admin/src/layouts/{index.ts, constant.ts, context.tsx, README.md}` ✅
- `packages/web/admin/package.json`：`react: catalog:` ✅
- `packages/web/admin/eslint.config.js`：`no-restricted-imports` 反向依赖守卫 ✅
- ~~`apps/admin/package.json` 加依赖~~（不需要，见任务 2）
- ~~tsconfig paths~~（已存在，无需改动）

### 完成判定

- `pnpm --filter @fedstack/admin typecheck` 绿 ✅
- `pnpm --filter @fedstack/admin lint` 绿 ✅
- `pnpm --filter @fedstack/admin build` 绿 ✅（用临时 import 验证过 `@shell/layouts` 能被 rsbuild 解析，验证后已移除）
- `pnpm --filter @fedstack/web-admin-shell exec eslint src/layouts` 绿 ✅
- `pnpm --filter @fedstack/web-admin-shell typecheck`：**仍红，但与基线完全一致**（只有 `theme/setup.ts` 与 `SvgIcon.tsx` 两个历史错误）。新增文件零错误。
- `pnpm install --no-frozen-lockfile` 通过 ✅（仅新增 1 条 react 依赖，其余 peer 警告为历史遗留）

### 状态（2026-10-30）

**已完成**。遗留：壳包整包 lint / typecheck 的历史红由阶段 4 主题重写一并清理，本阶段不动。

### 会话启动提示语

> 执行 `.scratch/admin-phase3-layout-checklist.md` 的 **SK-3.0**。目标：在 `packages/web/admin/src/layouts/` 建立 layouts 域骨架（constant / context / index / README），并让 `apps/admin` 通过 tsconfig paths 以源码直引方式引用它。先读壳包现有 tsconfig、eslint、theme/ui 的导出风格，据此决定引用方式并说明证据。不要写任何布局业务组件。

---

## SK-3.1 materials 骨架：六模式可容纳的布局原语

**目标**：写出 `AdminLayoutComponent` 纯 UI 骨架，先让 **vertical** 模式能渲染出「侧栏 + 顶栏 + 内容区」三区，但 prop 契约要能容纳六模式。

### 前置

SK-3.0 完成。**需先读 skyroc 的 `layouts/materials/`**（本次调研未读到，见调研文档 §9 第 2 条）。

### 任务

1. **补齐调研**：抓取 skyroc `packages/web/admin/layouts/materials/` 目录与其主文件，记录 DOM 结构与 `LAYOUT_SCROLL_EL_ID` 用法。
2. 写 `layouts/materials/AdminLayout.tsx`，prop 契约（参考 skyroc `AdminLayout.tsx` 的调用处）：
   ```ts
   interface AdminLayoutComponentProps {
     mode: 'vertical' | 'horizontal';
     Header: ReactNode; Sider: ReactNode; Tab: ReactNode; Footer?: ReactNode;
     headerHeight: number; siderWidth: number; siderCollapsedWidth: number;
     siderVisible: boolean; siderCollapse: boolean;
     tabHeight: number; tabVisible: boolean;
     fixedTop: boolean; fixedFooter: boolean; fullContent: boolean;
     scrollMode: 'wrapper' | 'content';
     scrollElId: string;
     contentClass?: string;
     updateSiderCollapse: (v: boolean) => void;
     children: ReactNode;
   }
   ```
3. 实现布局：CSS Grid 或 flex，三区（sider / header+tab / content）。
4. 放置两个 portal 挂载点：
   ```tsx
   <div id={GLOBAL_SIDER_MENU_ID} />   {/* 侧栏模式 */}
   <div id={GLOBAL_HEADER_MENU_ID} />  {/* 顶栏模式 */}
   ```
5. 只实现 vertical 的视觉；horizontal 留 if 分支占位（SK-3.6 补齐）。
6. 加一个临时 demo 页（`apps/admin/src/pages/(admin)/__layout-demo/index.tsx`）验证三区能出现，**完成后删除**。

### 知识点

- **materials 层不许有业务逻辑**：它只接收「已算好的数字」（`siderWidth` 等），不自己读 theme / store。这样它可被单测，也可被任何布局模式复用。
- **`scrollMode` 两种滚动**：`wrapper` 是整页滚动（顶栏吸顶靠 `position: sticky`），`content` 是内容区独立滚动（顶栏固定、内容区 `overflow: auto`）。这两种会影响 `scrollRestoration` 的行为，阶段 3 先只实现 `wrapper`。
- **`LAYOUT_SCROLL_EL_ID` 的作用**：给 TanStack Router 的 `scrollRestoration` 指定滚动容器。若用 `content` 滚动模式，必须把该 id 传给 router。

### 完成判定

- vertical 三区渲染正确，折叠按钮能改变侧栏宽度
- 骨架组件无任何 `@/` import、无 store 依赖（纯受控）
- typecheck / lint / build 绿

### 会话启动提示语

> 执行 SK-3.1。先抓取 skyroc `packages/web/admin/layouts/materials/` 源码并记录 DOM 结构与 `LAYOUT_SCROLL_EL_ID` 用法，然后在本仓 `packages/web/admin/src/layouts/materials/` 实现受控的 `AdminLayoutComponent`（先只做 vertical，horizontal 留分支占位），含两个 portal 挂载点 `GLOBAL_SIDER_MENU_ID` / `GLOBAL_HEADER_MENU_ID`。禁止在 materials 层引入 store 或 `@/` 别名。

### 调研结论（2026-10-30 抓到源码）

skyroc 的 materials 目录结构：

```
layouts/materials/
├── index.ts                       # barrel：AdminLayout、类型、LAYOUT_SCROLL_EL_ID
├── types/index.ts                 # AdminLayoutProps（Header/Tab/Sider/Footer 全可选 + 尺寸/可见性）
└── libs/admin-layout/
    ├── index.tsx                  # 骨架组件（vertical / horizontal）
    ├── shared.ts                  # LAYOUT_SCROLL_EL_ID、LAYOUT_MAX_Z_INDEX、createLayoutCssVars
    ├── index.module.css           # 只依赖 --soy-* CSS 变量，无工具类
    └── index.module.css.d.ts      # typed-css-modules 产物
```

DOM 结构（vertical + wrapper 滚动）：

```
<section class=relative h-full style="--soy-*">          ← 根，CSS 变量挂载点
  <section id={scrollElId} class="flex flex-col overflow-y-auto">   ← wrapper 滚动容器
    <header class="flex-shrink-0 h-header">…</header>     ← fixed 时 absolute top-0
    <div class=header-placement>                          ← 占位块，顶栏 fixed 时撑住高度
    <div class=tab>…</div> + <div class=tab-placement>
    <aside class="absolute left-0 top-0 h-full w-sider">…</aside>   ← 侧栏绝对定位覆盖
    <main id={scrollElId?} class="flex flex-col flex-grow">…</main>
    <footer>…</footer> + <div class=footer-placement>
  </section>
</section>
```

关键事实：

1. **`LAYOUT_SCROLL_EL_ID` 按滚动模式挂在不同节点**：`wrapper` 模式挂在最外层容器，`content` 模式挂在 `<main>`。只有一个节点带 id，交给 router 的 `scrollRestoration` 用作滚动容器（skyroc 值是 `'__SCROLL_EL_ID__'`，本仓改为 `'__ADMIN_LAYOUT_SCROLL_EL_ID__'`，避免与同页其他组件撞名）。
2. **portal 挂载点不在 materials 里**：`GLOBAL_SIDER_MENU_ID` 由 `modules/AdminSider.tsx` 渲染的空 div 承载，`GLOBAL_HEADER_MENU_ID` 在顶栏模块里；materials 只接收 `Sider` / `Header` 插槽节点。
3. materials 只认 `vertical` / `horizontal` 两种骨架，六模式差异全部由 `siderWidth` / `siderCollapsedWidth` / `siderVisible` 与菜单挂载位置表达（`AdminLayout.tsx:70` 的三元）。
4. 顶栏 / 标签条 / 页脚的「占位块」模式：`fixed` 时主体 `absolute`、占位块 `display: block` 撑住布局高度；非 fixed 时主体留在文档流、占位块不显示。

### 本仓落地（与清单的偏差及理由）

| 清单要求 | 实际做法 | 理由 |
| --- | --- | --- |
| portal 挂载点放 materials | **不放**，只导出 `LAYOUT_SCROLL_EL_ID` | materials 的 `Sider` / `Header` 是插槽节点，挂载点是插槽内容的一部分；放在骨架里会与 SK-3.3/3.4 的模块重复渲染同一 id。与 skyroc 一致，挂载点归 modules |
| demo 页 `(admin)/__layout-demo` | 临时页放 `pages/index.tsx`（路由 `/`），验后删除 | `(admin)` 有登录守卫 + 本仓 dev server 无 history fallback（`/login` 直接访问也 404），只能从 `/` 进页面 |
| 用 tailwind 类名 | SK-3.1 先用纯 CSS Modules（`admin-layout.module.css`），**SK-3.1.5 已改回 Tailwind 工具类并删除该 CSS Module** | 本仓当时无 tailwind；接入 Tailwind 后为了让骨架与 skyroc 对齐、少一层 CSS Module 词汇，改为工具类 |

其它实现要点：

- 组件文件：`materials/{AdminLayout.tsx, types.ts, shared.ts, index.ts}`，对外别名 `AdminLayoutComponent`（避免与 SK-3.7 顶层装配组件重名）。SK-3.1 时还有 `admin-layout.module.css` 与声明它的 `src/env.d.ts`，两者已随 SK-3.1.5 删除。
- CSS 变量：`--layout-header-height` / `-tab-height` / `-footer-height` / `-sider-width` / `-sider-collapsed-width` + 四个 z-index，由 `createLayoutCssVars` 按实例挂到根节点；与 SK-3.2 将加到 `global.css` 的 `:root` 默认值同名同义，不产生第二份词汇。
- 类名拼接用 `@fedstack/utils` 的 `cn`（壳包 `dependencies` 新增 `@fedstack/utils`）。
- 默认值按 SK-3.2 计划取值：header 56 / tab 40 / footer 48 / sider 240 / collapsed 64；`scrollMode` 默认 `content`（调用方决定，demo 用 `wrapper`）。
- ~~壳包新增 `src/env.d.ts` 声明 `*.module.css`~~：SK-3.1.5 删除 CSS Module 后该文件不再需要，已一并删除。
- `isMobile` 与移动端浮层侧栏一并实现（`updateSiderCollapse` 只有遮罩点击这一个消费点，否则该 prop 会变成未使用参数）。

### 验收结果

- `pnpm --filter @fedstack/admin typecheck` 绿
- `pnpm --filter @fedstack/admin lint` 绿
- `pnpm --filter @fedstack/admin build` 绿（删除临时页后重新构建，`routeTree.gen.ts` 已回到无 `/` 路由的状态）
- `pnpm --filter @fedstack/web-admin-shell exec eslint src/layouts` 绿
- `pnpm --filter @fedstack/web-admin-shell typecheck` 仍红，**与基线完全一致**（仅 `theme/setup.ts` 与 `SvgIcon.tsx` 两个历史错误）
- 浏览器实测（`http://localhost:3004/`）：顶栏 / 侧栏 / 标签条 / 内容区 / 页脚五区同时可见；点击折叠按钮后 `<aside>` 宽度 240 → 64、`header` 与 `main` 的 `padding-left` 同步 240 → 64；`html/body` 无横向滚动条；控制台无 error。
- `pnpm install --no-frozen-lockfile` 通过（仅新增 1 条 workspace 依赖）

### 状态（2026-10-30）

**已完成**。遗留：水平模式（`horizontal`）骨架已能渲染（`siderVisible=false` + 不做左间距），但顶栏菜单装载等差异属 SK-3.6。


---

## SK-3.1.5 Tailwind 接入 + materials 改写

> 本阶段由「先加 Tailwind 再进 SK-3.2」的指令插入，属于 SK-3.1 的收尾，不改动 SK-3.2 及之后的依赖顺序。

**已锁定决策（2026-10-30 访谈）**

- **Q1 入口位置**：并入壳包 `styles/global.css`（不新建 app 侧样式入口）。
  理由：壳包的 `ui/*`、未来的 `modules/*` 都要写工具类，入口必须在壳包内；应用只要已经 import 过 `global.css`（`apps/admin/src/plugins/assets.ts`）就自动生效。
- **Q2 存量迁移**：把 SK-3.1 的 `admin-layout.module.css` **改写成 Tailwind 类名**并删除，materials 与 skyroc 同构。
- **Q3 Preflight**：**保留 preflight + 分层**，靠 CSS 级联层让 antd 的无层样式优先。代价是工具类覆盖不了 antd 组件内部样式（必要时加 `!`）。

### 实施

| 文件 | 改动 |
| --- | --- |
| `pnpm-workspace.yaml` | 3.2 分组补 `'@tailwindcss/postcss': ^4.3.3`（`tailwindcss` 原本已在，只是无人使用） |
| `apps/admin/package.json` | devDependencies 加 `@tailwindcss/postcss` / `tailwindcss`（`catalog:`）——应用是构建方 |
| `apps/admin/rsbuild.config.ts` | `tools.postcss.postcssOptions.plugins = [tailwindcss()]`（v4 无 rsbuild 官方插件） |
| `packages/web/admin/src/styles/tailwind.css` | 新建：`@import 'tailwindcss'` + `@source` + `@theme` 令牌 |
| `packages/web/admin/src/styles/global.css` | 首行 `@import './tailwind.css'`（在 `reset.css` / `nprogress.css` 之前） |
| `packages/web/admin/src/styles/reset.css` | 整体收进 `@layer base { ... }` |
| `materials/AdminLayout.tsx` | 全量改写为工具类；删除 `admin-layout.module.css` 与 `src/env.d.ts` |

`@theme` 令牌：`--color-layout` / `--color-surface`，产出 `bg-layout` / `bg-surface`，取值仍落回 `--layout-content-bg` / `--layout-surface-bg`（未定义时用 `#f5f7fa` / `#fff` 兜底）。

### 踩到的两个根因（都直接影响后续所有工具类写法）

1. **Tailwind 自动内容检测只扫到 `apps/admin`**。
   自动检测的工作根是构建工作目录，`packages/web/admin/src/**` 完全没被扫描 → `flex` / `absolute` / `h-[var(--layout-header-height)]` / `pl-[var(--layout-sider-width)]` 一个都没生成，骨架塌成一列（`<aside>` 宽度退化成内容宽度 60px、`main` 的 padding-left 为 0）。
   解决：在 `tailwind.css` 里显式 `@source '../**/*.ts'` / `'../**/*.tsx'`。
   验证方式：抓 dev 产物 `http://<host>/static/css/async/src_bootstrap_tsx.css`，grep `pl-\[var`、`h-\[var`、`w-\[var`。
2. **`reset.css` 是无层样式，压过 `@layer utilities`**。
   它等价于 preflight（`h1..h6 { font-size: inherit; font-weight: inherit }`），留在层外时 `<h1 class="text-xl font-bold">` 实测仍是 14px / 400。
   解决：整份文件包进 `@layer base`。base 与 `utilities` 同在层内，`utilities` 声明在后 → 工具类胜出；antd 的 CSS-in-JS 仍是无层样式，优先级最高，组件外观不变。

> 结论性纪律：壳包新写工具类时，如果对应元素在同一选择器上被 `reset.css`、`global.css` 命中过，先确认那条规则在不在 `@layer base` 里。

### 验收结果

- `pnpm --filter @fedstack/admin typecheck` / `lint` / `build` 全绿（CSS 产物 4.0 kB → 11.3 kB）
- `pnpm --filter @fedstack/web-admin-shell exec eslint src/layouts` 绿
- `pnpm --filter @fedstack/web-admin-shell typecheck` 仍只有基线那 2 个历史错误
- 浏览器实测（`http://localhost:3005/`，3004 被本地其它 dev server 占用）：
  - `<h1>` 20px / 700、`<p>` 灰色（gray-500），证明工具类生效
  - `header` 56px（`position: absolute`）、`tab` 40px、`footer` 48px
  - 点击折叠按钮：`<aside>` 240 → 64、`<main>` 的 `padding-left` 同步 240 → 64
  - `document.documentElement` 无横向滚动；antd 按钮仍是实心蓝底白字圆角
  - 控制台无 CSS 报错（唯一 error 是 `/api/auth/refresh` 网络失败，与本阶段无关）

### 偏差

| 计划 | 实际 | 原因 |
| --- | --- | --- |
| 依赖「自动内容检测扫全仓」 | 必须显式 `@source` | 见根因 1 |
| 只保留「preflight 分层」即可 | 还要把 `reset.css` 收进 `@layer base` | 见根因 2 |
| dev server 上就能验证 | 必须重启 dev server | 改 `rsbuild.config.ts`（新增 postcss 插件）不会热重载，旧进程仍在跑无 Tailwind 的构建 |

### 状态（2026-10-30）

**已完成**。临时验证页 `apps/admin/src/pages/index.tsx` 已删除，`routeTree.gen.ts` 回到无 `/` 路由状态。

---

## SK-3.2 布局状态 + 尺寸纯函数 + CSS 变量

**目标**：`store/layout.ts`（Zustand）+ `layout-settings.ts`（静态配置）+ `sider-width` 纯函数 + CSS 变量体系。

### 前置

SK-3.1 完成（需要知道 `AdminLayoutComponent` 的 prop 形状）。

### 任务

1. **`layouts/config/layout-settings.ts`**：把 skyroc `useSettingsTheme()` 消费的字段收敛成静态对象（调研文档 §6 的表），带默认值：
   ```ts
   export const layoutSettings = {
     layout: { mode: 'vertical', scrollMode: 'wrapper' },
     sider: { width: 240, collapsedWidth: 64, mixWidth: 80, mixCollapsedWidth: 48, mixChildMenuWidth: 160 },
     header: { height: 56 },
     tab: { height: 40, visible: true },
     footer: { height: 48, visible: false, fixed: false, right: false },
     fixedHeaderAndTab: true,
   } as const;
   ```
2. **`layouts/utils/sider-width.ts`**：纯函数，照调研文档 §2.1 的 6 个分支实现：
   ```ts
   export function getSiderAndCollapsedWidth(params: {
     isCollapsed: boolean;
     mode: ThemeLayoutMode;
     sider: LayoutSiderConfig;
     isActiveFirstLevelMenuHasChildren: boolean;
     secondLevelMenusLength: number;
     childLevelMenusLength: number;
     mixSiderFixed: boolean;
   }): number;
   ```
3. **`layouts/utils/sider-width.spec.ts`**：vitest 覆盖 6 模式 × 折叠/展开 × 有无子菜单。**这是本阶段唯一适合 TDD 的模块**。
4. **`store/layout.ts`**（放 `apps/admin/src/store/` 还是壳包？见下）：
   ```ts
   interface LayoutState {
     siderCollapse: boolean;
     fullContent: boolean;
     contentXScrollable: boolean;
     mixSiderFixed: boolean;
     reloadKey: number;          // 替代 skyroc 的 reloadFlag，自增触发重挂载
     toggleSiderCollapse: () => void;
     setSiderCollapse: (v: boolean) => void;
     toggleFullContent: () => void;
     setContentXScrollable: (v: boolean) => void;
     toggleMixSiderFixed: () => void;
     reloadPage: () => void;
   }
   ```
5. **持久化边界**：`siderCollapse` / `mixSiderFixed` 可落 localStorage（纯 UI 偏好）；`accessToken` 绝不落（D1/D5）。
6. **CSS 变量**：在 `packages/web/admin/src/styles/global.css` 加：
   ```css
   :root {
     --layout-header-height: 56px;
     --layout-tab-height: 40px;
     --layout-sider-width: 240px;
     --layout-sider-collapsed-width: 64px;
     --layout-content-bg: #f5f7fa;
     --layout-surface-bg: #fff;
   }
   ```
   组件里用 `var(--layout-sider-width)`，不写死数字。

### 关键决策：store 放哪？

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 放壳包 `packages/web/admin/src/layouts/store/`** | 布局态与壳同处，app 只消费 | 壳包要依赖 `zustand`（peer） |
| **B. 放 app `apps/admin/src/store/layout.ts`** | 符合「app 拥有业务状态」 | 壳包组件要接收 state props，装配变啰嗦 |

**推荐 A**：因为 skyroc 也是 `layouts/state/` 自带状态，且这份状态没有 app 业务语义（纯 UI 偏好）。壳包把 `zustand` 声明为 peerDependency。

### 知识点

- **为什么 `reloadKey` 用自增而非布尔**：布尔翻转两次会回到原值，若两次翻转在同一渲染批次会被合并丢失；自增永远产生新值，`key={reloadKey}` 稳定触发重挂载。
- **纯函数抽离的价值**：六模式宽度计算是阶段 3 唯一有真实分支密度的逻辑。留在组件里无法单测，抽出来 6 个分支可以用 20 行测试覆盖。
- **持久化用哪个 API**：Zustand `persist` 中间件 + `partialize`，只持久化白名单字段，避免把 `reloadKey` 这种瞬时值写进 localStorage。

### 完成判定

- `sider-width.spec.ts` 全绿（6 模式覆盖）
- 折叠/展开切换正确，刷新页面后折叠态保持
- 组件内无硬编码尺寸（grep 校验）
- typecheck / lint / build / test 绿

### 会话启动提示语

> 执行 SK-3.2。在 `packages/web/admin/src/layouts/` 下实现：① `config/layout-settings.ts` 静态布局配置；② `utils/sider-width.ts` 六模式宽度纯函数（含 vitest 单测覆盖 6 分支）；③ `layouts/store/layout.ts` Zustand 布局态（含 `reloadKey`、persist 白名单）；④ `styles/global.css` 加 `--layout-*` CSS 变量。壳包 `zustand` 声明为 peerDependency。完成后跑壳包 test。

### 实施

| 文件 | 改动 |
| --- | --- |
| `layouts/config/layout-settings.ts` | 新建：`LayoutSiderConfig` / `LayoutSettings` 类型 + `layoutSettings` 静态对象（默认值 240/64/80/48/160、header 56、tab 40、footer 48、`mode: 'vertical'`、`scrollMode: 'wrapper'`、`fixedHeaderAndTab: true`） |
| `layouts/utils/sider-width.ts` | 新建：`getSiderAndCollapsedWidth` 纯函数，严格按调研文档 §2.1 五个分支实现；`mode` 类型用本域 `LayoutMode`（非 `ThemeLayoutMode`） |
| `__tests__/layouts/sider-width.test.ts` | 新建：24 条用例，6 模式 × 折叠/展开 × 有无子菜单全分支，并用 `layoutSettings.sider` 真实默认值锁定配置契约 |
| `packages/web/admin/vitest.config.ts` | 新建：spread `baseTestConfig`（沿用共享 node 环境，纯函数无 DOM 需求） |
| `layouts/store/layout.ts` | 新建：`useLayoutStore`（Zustand + `persist`），字段 `siderCollapse` / `fullContent` / `contentXScrollable` / `mixSiderFixed` / `reloadKey` + 6 个 action；`partialize` 白名单只落 `siderCollapse` / `mixSiderFixed`，storage key `admin-layout` |
| `packages/web/admin/package.json` | `peerDependencies` 加 `zustand: catalog:`，`devDependencies` 同步加（peer + dev 双轨，对齐 logger / web-utils 先例） |
| `styles/global.css` | `:root` 加 7 个 `--layout-*` 变量（含清单片段遗漏的 `--layout-footer-height: 48px`，与 `createLayoutCssVars` / `layoutSettings.footer.height` 对齐） |
| `layouts/index.ts` | 追加导出 `./config/layout-settings`、`./store/layout`、`./utils/sider-width` |

### 验收结果

- `pnpm --filter @fedstack/web-admin-shell test`：24/24 绿（vitest 4.1.11）
- `pnpm --filter @fedstack/web-admin-shell typecheck`：仍只有基线 2 个历史错误（`theme/setup.ts` 缺 `./hooks`、`SvgIcon.tsx` 缺 `@iconify/react`）
- `eslint src/layouts __tests__ vitest.config.ts` 绿（`--fix` 收编了 import 排序与 README 表格 prettier 格式）
- `pnpm --filter @fedstack/admin typecheck` / `lint` / `build` 全绿
- 硬编码尺寸 grep：`src/layouts/**/*.tsx` 中无 `width/height/padding/top/left: 数字` 字面量（尺寸全走 `var(--layout-*)`）
- 构建产物 CSS 含全部 7 个 `:root --layout-*` 变量（实测 dist CSS）

### 偏差

| 计划 | 实际 | 原因 |
| --- | --- | --- |
| 单测文件 `layouts/utils/sider-width.spec.ts` 与源码同目录 | `__tests__/layouts/sider-width.test.ts` | 仓库 `baseTestConfig` 的 `TEST_PATTERNS` 只匹配包根 `__tests__/**/*.test.ts(x)`，壳包 tsconfig 也早已 `exclude: __tests__/**`；同目录 `.spec.ts` 还会混进覆盖率统计 |
| `layoutSettings` 用 `as const` | 显式 `LayoutSettings` 接口标注 | 接口即阶段 4 主题 store 的替换契约；`as const` 的字面量收窄对配置对象无收益 |
| 函数签名 `mode: ThemeLayoutMode` | `mode: LayoutMode`（`../constant`） | SK-3.0 已裁决 `constant.ts` 是 layouts 域权威定义，不反向依赖 theme 域 |
| CSS 片段无 footer 变量 | 补 `--layout-footer-height: 48px` | `createLayoutCssVars` 与 `layoutSettings.footer.height` 都有 footer 维度，清单片段属遗漏 |

### 已知无害现象

Tailwind 扫描器把配置文件里的 `fixed` / `visible` / `grow` 等对象键名识别为工具类候选，dist CSS 从 11.3 kB → 14.9 kB。这些是真实工具类（后续 modules 定位/显隐也会用到），不做收窄 `@source` 的过度优化。

### 状态（2026-10-30）

**已完成**。`reloadPage()` 持久化保持语义待 SK-3.7 装配后做浏览器端「折叠态刷新保持」实测（本阶段无装配入口，纯函数与 store 均已单测/类型覆盖）。

---

## SK-3.3 菜单：DTO → UI 模型 + 侧栏渲染

**目标**：`GET /menus/available` → React Query → DTO 映射 → antd Menu 渲染，选中态与文件路由同步。

### 前置

SK-3.2 完成。需读 skyroc `layouts/state/menus/use-admin-menus.ts` 与 `layouts/modules/admin-menu/`。

### 任务

1. **`apps/admin/src/service/api/menu.ts`**（app 侧，因为这是 app 的 API）：
   ```ts
   export function fetchAvailableMenus(): Promise<MenuResponseDto[]> {
     return request.get('/menus/available');
   }
   ```
   React Query 封装：
   ```ts
   export const menuQueryOptions = queryOptions({
     queryKey: ['menus', 'available'],
     queryFn: fetchAvailableMenus,
     staleTime: 5 * 60 * 1000,   // 菜单变动低频
   });
   ```
2. **类型**：在 app 的 `types/api/menu.d.ts` 镜像 `MenuResponseDto`（字段见调研文档 §3.3）。
3. **`layouts/utils/menu-mapper.ts`**（壳包侧，纯函数）：
   ```ts
   export interface AdminMenuItem {
     key: string; label: string; icon?: ReactNode;
     path?: string; children?: AdminMenuItem[];
   }
   export function toAdminMenuTree(dtos: MenuResponseDto[], iconRegistry: IconRegistry): AdminMenuItem[];
   ```
   规则：过滤 `menuType === 'BUTTON'`；过滤 `visible === false`；过滤 `status === 'DISABLED'`；按 `sort` 升序；`icon` 字符串经注册表映射到 antd 图标。
4. **`layouts/utils/menu-mapper.spec.ts`**：覆盖 BUTTON 过滤 / 不可见过滤 / 排序 / 嵌套。
5. **`layouts/modules/admin-menu/AdminMenu.tsx`**：消费 `AdminMenuItem[]`，渲染 antd `<Menu mode="inline">`；通过 portal 挂到 `GLOBAL_SIDER_MENU_ID`。
6. **选中态同步**：`useLocation().pathname` → 找到匹配菜单项 → `selectedKeys`；点击 → `router.navigate({ to: path })`。
7. **`layouts/state/menus.ts`（Zustand）**：只存 UI 态（`openKeys` 手风琴展开、`activeKey`），菜单树数据走 React Query 不重复存。

### 知识点

- **为什么菜单树不进 Zustand**：菜单是服务端数据（AGENTS.md 分层：React Query 管服务端状态），重复存进 store 会产生第二个事实源。
- **portal 挂载 vs 直接嵌**：见调研文档 §1。`AdminMenu` 必须只有一个实例，通过 `createPortal(..., document.getElementById(GLOBAL_SIDER_MENU_ID))` 挂载。**注意**：portal 目标节点在首帧可能不存在，需要 `useLayoutEffect` + 就绪标志。
- **图标字符串映射**：后端存的是 `"user"` / `"setting"` 这类字符串，前端要维护 `Record<string, IconComponent>` 注册表。**不要用动态 import 拼路径**（Rsbuild 无法静态分析，会打不进包）。
- **`routePath` 匹配策略**：精确匹配 + 前缀匹配（`/system/user` 匹配 `/system/user/detail`）。仅用于高亮，不用于路由注册（A 方案）。

### 完成判定

- 登录后侧栏出现菜单树，BUTTON 不出现
- 点击菜单跳转正确，当前项高亮
- 折叠后图标模式正常
- 单测绿、三项验收绿

### 会话启动提示语

> 执行 SK-3.3。先读 skyroc `layouts/state/menus/use-admin-menus.ts` 与 `layouts/modules/admin-menu/` 源码。然后实现：① `apps/admin/src/service/api/menu.ts` 调 `GET /menus/available`（React Query）；② 壳包 `layouts/utils/menu-mapper.ts` DTO→UI 纯函数（过滤 BUTTON/不可见/禁用、按 sort、icon 注册表）+ vitest；③ `layouts/modules/admin-menu/AdminMenu.tsx` antd Menu + portal 到 `GLOBAL_SIDER_MENU_ID`；④ `layouts/state/menus.ts` 只存 openKeys/activeKey。菜单树不要进 Zustand。

### 实施

| 文件 | 说明 |
| --- | --- |
| `packages/web/admin/src/layouts/utils/menu-mapper.ts` | `MenuDto` 最小输入契约 + `AdminMenuItem` + `toAdminMenuTree`（过滤/排序/递归）+ `findMenuByPath`（精确 + 最长前缀）+ `indexMenusByKey` |
| `packages/web/admin/src/layouts/utils/menu-icons.ts` | `defaultMenuIconRegistry`：13 键静态注册表（对齐种子菜单 `settings`/`monitor` + 后台常见类目） |
| `packages/web/admin/src/layouts/store/menus.ts` | `useMenusStore`：`openKeys` / `activeKey` + setter，不持久化（含 6 条 Zustand 规范注释） |
| `packages/web/admin/src/layouts/modules/admin-menu/{AdminMenu,SiderMenuMount,index}` | antd inline Menu + portal；受控 `menus` props；路由同步 openKeys；`to: path as never` 刻意逃生口 |
| `packages/web/admin/__tests__/layouts/menu-mapper.test.ts` | 18 用例：BUTTON/不可见/禁用过滤、排序、嵌套、空目录丢弃、icon 注册表、选中匹配、扁平索引 |
| `apps/admin/src/types/api/menu.d.ts` | `MenuResponseDto` 镜像（模块式导出） |
| `apps/admin/src/service/api/menu.ts` | `fetchAvailableMenus` + `menuQueryOptions`（staleTime 5min） |
| `apps/admin/src/pages/(admin)/layout.tsx` | 换壳包骨架装配：`AdminLayoutComponent` + `SiderMenuMount` + `AdminMenu`；顶栏加折叠按钮；宽度走 `getSiderAndCollapsedWidth` |
| `apps/admin/src/pages/(admin)/$.tsx` | **新增**（清单外）：(admin) 组内通配路由，布局内 404 兜底 |
| 依赖 | catalog 加 `@ant-design/icons@^6.3.4`；壳包 +`@ant-design/icons`/`react-dom`（dep）+`@tanstack/react-router`（peer+dev）；app +`@ant-design/icons`（dep） |

### 验收结果

- 壳包 `test` 42/42 绿（新增 18 用例，含 6 个 `findMenuByPath` 匹配分支）
- 壳包 `typecheck` 仅剩基线 2 个历史错误（`theme/setup.ts` / `SvgIcon.tsx`）；`eslint src/layouts __tests__` 绿
- `apps/admin` typecheck / lint / build 全绿（build Total 1081.3 kB / 359.5 kB gzip）
- 浏览器实测（admin-api 3001 + admin 3004 实跑，种子菜单数据）：
  - 登录后侧栏出现菜单树（系统管理 8 叶 + 系统监控 5 叶），BUTTON 不出现 ✓
  - 点击菜单跳转正确、当前项高亮、父目录保持展开（跨目录切换亦正确）✓
  - 折叠后图标模式正常、再次点击恢复展开 ✓
  - 刷新后选中态随菜单数据重新派生恢复（短暂无高亮属预期加载窗口）✓
  - 未注册路由在布局内显示 404 占位（catch-all 生效）✓

### 偏差

| 清单/惯例 | 实际落地 | 原因 |
| --- | --- | --- |
| `layouts/state/menus.ts` | `layouts/store/menus.ts` | 与 SK-3.2 的 `store/` 目录约定一致（SK-3.2 README 已把 `store/` 写进目录规划） |
| `layouts/utils/menu-mapper.spec.ts` | `__tests__/layouts/menu-mapper.test.ts` | 仓库 `TEST_PATTERNS` 只匹配包根 `__tests__/`（同 SK-3.2 偏差） |
| 清单未提 catch-all 路由 | 新增 `apps/admin/src/pages/(admin)/$.tsx` | 实测发现菜单指向未注册路由时 root 级 404 替换整棵布局树（侧栏消失、高亮无从谈起），属完成判定「点击菜单跳转正确，当前项高亮」的必要条件 |
| 清单未规定空目录处理 | 子级被滤尽的 DIRECTORY 一并丢弃 | 空分组会退化为指向 404 的叶子，误导点击 |
| 清单未明确数据接线点 | `AdminMenu` 受控 `menus` props，app 装配层 `useQuery` + 映射 | 壳包保持业务无关、不依赖 react-query（与「壳包不直接请求业务接口」一致） |
| 壳包依赖白名单 | 新增 `@tanstack/react-router`（peer）与 `@ant-design/icons`、`react-dom` | 菜单选中态/导航必需 router hooks；portal 必需 react-dom；图标必需 icons 包。README 约束段已同步 |
| 折叠按钮归属 SK-3.4 | 本阶段顶栏已带折叠按钮 | 完成判定「折叠后图标模式正常」需要触发入口；SK-3.4 做顶栏模块化时收编为正式 `SiderToggle` 子件 |

### 已知无害现象

- antd `Menu` 折叠态自带默认宽度 80px，`AdminMenu` 以 `style={{ width: '100%' }}` 收敛到骨架 CSS 变量（展开 240 / 折叠 64）。
- 种子菜单的 `routePath`（`/system/*`、`/monitor/*`）均未注册文件路由，点击后落在 catch-all 占位页——这是 A 方案的预期中间态，页面在后续阶段补齐。

### 状态（2026-10-30）

**已完成**。`activeKey` 已入 store 但暂无消费方（SK-3.6 混合模式使用）；菜单选中态只认 `routePath` 字符串匹配，`routeName`/`component`/`permCode` 按计划留待后续阶段。

---

## SK-3.4 顶栏：Logo / 面包屑 / 用户区 / 插槽

**目标**：补齐顶栏，实现 `AdminLayoutSlots` 插槽契约。

### 前置

SK-3.3 完成。需读 skyroc `layouts/modules/AdminHeader.tsx` + `modules/admin-header/`。

### 任务

1. **`layouts/modules/AdminHeader.tsx`**：布局容器，按 `context.tsx` 的插槽顺序排布。
2. **`layouts/modules/admin-header/`** 子件：
   - `Logo.tsx`：品牌区，点击跳 `logoTo`（默认首页）
   - `Breadcrumb.tsx`：从当前路由 `matches` 派生面包屑
   - `SiderToggle.tsx`：折叠按钮 → `toggleSiderCollapse`
   - `Fullscreen.tsx`：全屏切换（纯浏览器 API，无需 shell 包）
   - `UserArea.tsx`：**从 app 侧注入**（用户信息走 React Query `['auth','profile']`）
3. **用户区归属决策**：用户信息是 app 业务数据（阶段 2 已落地），**壳包不应直接请求 `/auth/profile`**。做法：app 通过 `headerRightActions` 插槽传入 `<UserArea />`。这样壳包保持业务无关。
4. **退出登录**：沿用阶段 2 的 `handleLogout()`（先 `POST /auth/logout` 再清本地），**移入 app 侧的 `(admin)/layout.tsx`**，不在壳包里。
5. **面包屑数据源**：TanStack Router `useMatches()` → `match.routeId` / `staticData.title`。需在路由 `staticData` 里补标题（`features/router/index.ts:163` 已预留 `StaticDataRouteOption`）。

### 知识点

- **插槽优于直接耦合**：skyroc 的 `AdminLayoutSlots` 让壳包不知道「用户是谁」，只留三个洞。这是壳能被复用到 game app 的前提。
- **面包屑不要用菜单树反查**：菜单是「可导航集合」，面包屑是「当前路由祖先链」，两者数据源不同。用 `useMatches()` 更准确且不依赖菜单接口成功。
- **`staticData` 的类型增强**：`interface StaticDataRouteOption { title?: string; icon?: string }` 声明在 `@tanstack/react-router` 的 `Register` 模块增强里，这样 `createFileRoute('/home')({ staticData: { title: '首页' } })` 有类型提示。

### 完成判定

- 顶栏三段插槽可用（在 app 里传自定义按钮能出现在指定位置）
- 面包屑随路由变化正确
- 退出登录链路仍正常（回归阶段 2）
- 三项验收绿

### 会话启动提示语

> 执行 SK-3.4。先读 skyroc `layouts/modules/AdminHeader.tsx` 与 `modules/admin-header/`。实现顶栏容器与 Logo/Breadcrumb/SiderToggle/Fullscreen 子件；用户区通过 `headerRightActions` 插槽由 app 注入（壳包不得请求 `/auth/profile`）；退出登录留在 app 的 `(admin)/layout.tsx`。给 `StaticDataRouteOption` 补 `title` 类型增强。

### 实施

| 文件 | 改动 |
| --- | --- |
| `packages/web/admin/src/layouts/modules/admin-header/index.ts` | 新建 barrel：导出 AdminHeader + 四子件 + `AdminHeaderProps` / `AdminBreadcrumbItem` |
| `modules/admin-header/AdminHeader.tsx` | 顶栏容器；插槽顺序 Logo → SiderToggle → center → `GLOBAL_HEADER_MENU_ID` portal 挂载点 → headerLeftActions → Fullscreen → headerMiddleActions → headerRightActions；props 仅 `center?: ReactNode` |
| `modules/admin-header/Logo.tsx` | 品牌区；渲染优先级 `slots.logo`（接管）> `slots.logoTitle`（默认图标 + 传入标题）> 默认图标 + "Fedstack Admin"；跳转目标默认 `/home` 可被 `slots.logoTo` 覆盖 |
| `modules/admin-header/SiderToggle.tsx` | 折叠按钮；读 `useLayoutStore.siderCollapse`，点击调 `toggleSiderCollapse` |
| `modules/admin-header/Fullscreen.tsx` | 纯原生 Fullscreen API；`fullscreenchange`/`webkitfullscreenchange` 事件同步状态；`.bind(document.body)` 修复 `Illegal invocation`；不用 ahooks |
| `modules/admin-header/Breadcrumb.tsx` | 面包屑**渲染组件**（不派生路由数据）；props `items: AdminBreadcrumbItem[]`；空数组或仅一项返回 null（登录页/404 不渲染） |
| `apps/admin/src/features/router/index.ts` | `interface StaticDataRouteOption { title?: string }`（模块增强，给 `createFileRoute` 的 `staticData` 补类型提示） |
| `apps/admin/src/pages/(admin)/home/index.tsx` | 新增 `staticData: { title: '首页' }` 作为首个注册路由 |
| `apps/admin/src/pages/(admin)/layout.tsx` | 装配层换壳顶栏：`AdminLayoutProvider slots={{ headerRightActions: userArea, logoTo: '/home' }}` + `AdminHeader center={<Breadcrumb items={breadcrumbItems}/>}`；面包屑派生逻辑：`useMatches()` → filter `isLayoutGroup`（`/(xxx)` 分组 routeId + pathname 为空）→ `match.staticData?.title ?? fallbackTitle`；`handleLogout()` 留在 app 侧（POST logout → clear → queryClient.clear → router 跳 `/login`） |

### 验收结果

- 壳包 `test` 42/42 绿（未新增用例——顶栏组件无分支密度，留待后续集成测试覆盖）
- 壳包 `typecheck` 仅剩基线 2 个历史错误（`theme/setup.ts` / `SvgIcon.tsx`），**新增文件零错误**
- apps/admin typecheck / lint / build 全绿（build Total 1095.8 kB / gzip 363.8 kB）
- 浏览器实测（admin-api 3001 + admin 3004 实跑）：
  - Logo 点击跳 `/home` ✓
  - SiderToggle 折叠侧栏 240↔64 ✓
  - 面包屑从 `/home` → 其他路由同步变化（`staticData.title` 缺失时回退到末段 pathname）✓
  - 用户区（头像 + 用户名 + 下拉菜单）通过 `headerRightActions` 插槽渲染 ✓
  - 退出登录链路正常（POST 后清本地 → queryClient.clear → 跳 `/login`）✓

### 偏差

| 清单/惯例 | 实际落地 | 原因 |
| --- | --- | --- |
| `layouts/modules/AdminHeader.tsx`（单一目录） | `modules/admin-header/AdminHeader.tsx`（子目录） | 与 SK-3.3 的 `modules/admin-menu/` 目录结构对齐，六模式补齐时 horizontal 顶栏菜单等可扩展进同目录 |
| 面包屑从 `useMatches()` 在**壳包**派生 | 壳包只接 props `AdminBreadcrumbItem[]`，路由派生留在 app 装配层 | 壳包拿不到 app 侧的 `StaticDataRouteOption` 模块增强（注册在 app 的 router 里）；壳包定义 `AdminBreadcrumbItem` 类型让两端对齐，职责边界更干净 |
| Fullscreen 用 ahooks | 纯原生 API | ahooks 不是壳包依赖，加只为一个全屏按钮太肥；原生 API 够且可控 |
| 清单提 `includeRoot: false` 参数 | TanStack Router v5 无此参数，手动 filter | 直接 `useMatches()` 后 `filter(isLayoutGroup)`，更显式 |

### 已知无害现象

- browser_use 子代理环境下 Fullscreen API 报 "Fullscreen API is not supported"——浏览器测试环境限制（非用户主动 gesture 或 headless），**非代码 bug**。真实浏览器点击按钮必然生效（`.bind(document.body)` 已修复 `Illegal invocation`）。
- 未注册路由（catch-all 落在 `/$`）面包屑诚实 fallback 到末段 pathname（如 "users"）——这是 A 方案的预期中间态，页面注册齐了自然正确。

### 状态（2026-10-30）

**已完成**。顶栏 vertical 模式已稳定；六模式分发（horizontal / hybrid 菜单 portal 接入）与标签条交互属 SK-3.5 / SK-3.6。

---

## SK-3.5 标签页 + Keep-Alive（⚠️ 需先核实源码）

**目标**：标签条 UI + 路由 ↔ 标签同步 + 内容缓存 + 刷新/关闭。

### 前置

SK-3.4 完成。

### ⚠️ 第一步是补齐调研，不是写代码

本次调研**两次抓取 `state/tabs/use-admin-tab.ts` 均失败**（调研文档 §0.3 / §9 已如实标注）。开工必须先确认 skyroc 的缓存到底怎么做：

```powershell
git clone --depth 1 https://github.com/Ohh-889/skyroc.git
# 读 packages/web/admin/layouts/state/tabs/{use-admin-tab.ts,shared.tsx}
# 读 packages/web/admin/layouts/state/AdminTabEffect.tsx
# 读 packages/web/admin/layouts/modules/admin-tab/
```

**必须回答的三个问题**（答案决定实现路线）：

1. 内容区是否真的缓存组件实例？若是，用什么机制（`react-activation` / 自研 CachedOutlet / 路由层 `notFound` 技巧）？
2. `AdminTabEffect` 如何把路由变化写进 tabs（新增/更新/激活）？
3. 关闭标签时如何丢弃对应缓存、如何决定跳转到哪个相邻标签？

### 若核实结果「无真缓存，只有 reloadFlag」

则降级为 **B 方案（简化）**：
- 标签条只是路由历史的可视化 + 快捷切换；
- 不做组件级缓存，切换标签等同普通路由跳转；
- `reloadPage()` 仍可用 `reloadKey` 重挂载。
- **优点**：零第三方依赖、无内存泄漏风险；**缺点**：切回标签要重新请求数据（但有 React Query 缓存兜底，体验损失有限）。

### 若核实结果「有真缓存」

则按 skyroc 机制对齐，并在会话内评估：
- TanStack Router 的 `<Outlet />` 会卸载组件，缓存需在 Outlet 之上做（包一层 `KeepAlive` 容器，按 `pathname` 保留 React 树）；
- 内存风险：每个打开标签保留一棵组件树，需要「最多缓存 N 个 + LRU 淘汰」；
- 与 `scrollRestoration` 的交互（缓存实例的滚动位置要单独存）。

### 任务（两方案共有）

1. **`store/tabs.ts`**（Zustand，**此处二次确认 §0.2 的三 store 方案**）：
   ```ts
   interface TabItem { key: string; path: string; title: string; closable: boolean; }
   interface TabsState {
     tabs: TabItem[]; activeKey: string;
     addTab: (t: TabItem) => void;
     removeTab: (key: string) => string | null;  // 返回下一个应激活的 key
     closeOthers: (key: string) => void;
     closeAll: () => void;
     setActive: (key: string) => void;
   }
   ```
2. **`layouts/modules/admin-tab/AdminTab.tsx`**：antd `<Tabs type="editable-card">` 或自绘；右键菜单（关闭其他/关闭全部/刷新）。
3. **`layouts/state/AdminTabEffect.tsx`** 等价物：`useLocation()` 变化 → `addTab`（已存在则 `setActive`）。
4. **固定标签**：首页 `/home` 不可关闭（`closable: false`）。
5. **关闭最后一个标签**：不允许（至少留一个）或跳首页。
6. **登出清空**：app 登录的 `clear()` 里同步 `tabsStore.closeAll()`。

### 知识点

- **标签 key 用什么**：用 `pathname + search` 全量（`/system/user?page=2` 与 `/system/user?page=1` 是不同标签），或只用 `pathname`（同页面不同查询参数共用一个标签）。**skyroc 的选择待核实，两条语义都合理**，需在会话内定并写入注释。
- **`AdminTabEffect` 的时序**：必须监听路由完成后的 location，不能在 `beforeLoad` 里写 tabs（那时导航可能被取消）。
- **关闭标签后的跳转**：优先右邻 → 左邻 → 首页。这是编辑器类产品的通行规则，用户预期稳定。

### 完成判定

- 打开页面自动生成标签，切标签不重复生成
- 关闭标签跳转符合「右邻→左邻→首页」
- 刷新当前页可用
- 登出后标签清空
- 三项验收绿

### 会话启动提示语

> 执行 SK-3.5。**第一步先 clone skyroc 源码并回答三个问题**：tabs 是否真缓存组件实例（什么机制）、`AdminTabEffect` 如何同步路由到标签、关闭标签如何丢弃缓存与选下一个标签。三个答案决定实现路线（真缓存 vs 仅标签导航），先给出结论与证据再动手。然后实现 `store/tabs.ts`、`layouts/modules/admin-tab/`、`layouts/state/AdminTabEffect` 等价物。

### 结论（第一步核实，2026-10-30）

清单要求先回答三个问题，答案如下（**依据为本仓实现与框架事实，不宣称读到 skyroc 源码**：`state/tabs/use-admin-tab.ts` 本轮仍未拿到，`store/tabs.ts` 注释只声明「对齐 skyroc，jotai → Zustand 简化版」）：

| 问题 | 结论 |
| --- | --- |
| 内容区是否缓存组件实例 | **不做组件级缓存（B 方案）**。TanStack Router 的 `<Outlet />` 在路由切换时卸载子树；做缓存需在 Outlet 之上自建「按 pathname 保留 React 树 → LRU 淘汰 → 滚动位置单独存」的容器，收益被 React Query 的数据缓存大幅抵消 |
| 路由变化如何写入 tabs | `AdminTab` 内 `useUpdateEffect` 监听 `location.pathname + search` → `addTab`（已存在则只更新 path/title 并激活）。不放 `beforeLoad`：导航可能被取消 |
| 关闭标签后如何决定去向 | `removeTab` 返回下一个应激活 key：右邻 → 左邻 → 首个固定标签 → `null`；调用方据返回值 `navigate` |

### 实施

| 文件 | 说明 |
| --- | --- |
| `layouts/store/tabs.ts` | `TabItem { key, path, title, closable }` + `addTab` / `removeTab` / `closeOthers` / `closeAll` / `setActive` / `reset`；**key 只用 pathname**（`path` 保留完整 path+query 供导航）；不持久化（刷新重建）；关闭跳转「右邻→左邻→首个固定标签」 |
| `layouts/modules/admin-tab/AdminTab.tsx` | 自绘标签条（横向滚动 + 溢出）+ antd `Dropdown` **右键菜单**（刷新当前页 / 关闭当前 / 关闭其他 / 关闭全部）+ 尾部刷新按钮；标题取 `staticData.title ?? 末段 pathname`；`homePath` 默认 `/home` 以 `closable=false` 表达固定标签 |
| `layouts/store/layout.ts` | 复用 SK-3.2 的 `reloadPage()`（`reloadKey` 自增）实现「刷新当前页」，不另建刷新机制 |
| `apps/admin/src/pages/(admin)/layout.tsx` | `Tab={<AdminTab />}` 装配进骨架；`handleLogout` 中追加 `useTabsStore.getState().reset()`（在 `queryClient.clear()` 之后、跳 `/login` 之前） |

### 验收结果

- 壳包 `test` 42/42（本阶段未新增用例：标签分支全在 store action 内，纯函数层无可测 seam；行为由 SK-3.7 浏览器回归覆盖）
- `eslint src/layouts __tests__` 绿；壳包 `typecheck` 仅基线 2 个历史错误
- app typecheck / lint / build 全绿
- 标签相关回归（见 SK-3.7 清单第 4、5 项）：打开 3 页 → 3 标签、关闭中间跳右邻、登出后标签清空 ✓

### 偏差

| 清单 | 实际 | 理由 |
| --- | --- | --- |
| antd `<Tabs type="editable-card">` | 自绘标签按钮 + `Dropdown` 右键菜单 | antd Tabs 不支持「每个标签独立右键菜单」；自绘便于统一关闭按钮、横向溢出与 Tailwind 视觉 |
| 独立 `layouts/state/AdminTabEffect.tsx` | 合并进 `AdminTab.tsx` 的 `useUpdateEffect` | 只有一个消费方，拆文件只多一跳 |
| tab key 两选项（pathname+search 或 pathname） | 只 `pathname` | 翻页查询参数不应刷出无限标签；完整 path 仍存于 `TabItem.path` |
| 组件级 Keep-Alive | 不实现 | 见上「结论」；`reloadPage()` 仍以 `reloadKey` 重挂载 |

### 已知不足（未随本轮改动）

`useUpdateEffect` **跳过首次执行**，所以布局首次挂载时所在页面不会自动生成标签（登录后落在 `/home`，标签条为空，第一次导航后才出现首个标签；`/home` 固定标签在导航回首页时补齐）。修法只需把该 effect 换成 `useEffect`（`addTab` 对已存在 key 幂等）。本阶段不改，避免与已完成的 SK-3.7 验收混改，记录为后续优化项。

### 状态（2026-10-30）

**已完成（B 方案）**。Keep-Alive 组件级缓存未实现，保留为后续可选项。

---

## SK-3.6 六模式补齐

**目标**：在 SK-3.1~3.5 的 vertical 基座上补齐另外 5 种模式。

### 前置

SK-3.5 完成。菜单层级（`childLevelMenus` / `secondLevelMenus`）必须已可用——它们是宽度分支的输入。

### 任务（按复杂度升序，每个模式独立可验收）

1. **horizontal**：无侧栏，菜单 portal 到 `GLOBAL_HEADER_MENU_ID`；`siderVisible=false`。
2. **vertical-hybrid-header-first**：顶栏一级菜单 + 侧栏二级菜单。
3. **top-hybrid-sidebar-first**：顶栏含折叠入口 + 侧栏二级。
4. **top-hybrid-header-first**：顶栏一级 + 侧栏二级（顶栏优先）；一级无子级时侧栏宽 0。
5. **vertical-mix**：左栏一级 + 二级子栏；`mixSiderFixed` 时宽度叠 `mixChildMenuWidth`。

每个模式验收点：
- 侧栏宽度按 `getSiderAndCollapsedWidth` 分支正确
- 菜单出现在正确位置（顶栏 / 侧栏 / 两者）
- 切换模式后菜单展开态不丢失（验证 portal 方案有效）
- 折叠行为正确

### 知识点

- **模式切换不该重建菜单**：这正是 §1「菜单与内容区是兄弟节点」设计的目的。给 `AdminLayout` 传一个运行时切换模式的 demo（开发期临时），验证菜单状态保持。
- **一级/二级菜单派生**：需要按当前激活的一级菜单，筛选其子树作为 `secondLevelMenus`。这个派生函数也应抽成纯函数 + 单测（`utils/menu-levels.ts`）。

### 完成判定

- 6 模式均可通过配置切换并渲染正确
- `sider-width.spec.ts` 与 `menu-levels.spec.ts` 覆盖全部分支
- 模式切换后菜单状态保持
- 三项验收绿

### 会话启动提示语

> 执行 SK-3.6。在 vertical 基座上补齐 horizontal / vertical-hybrid-header-first / top-hybrid-sidebar-first / top-hybrid-header-first / vertical-mix 五种模式。先抽 `utils/menu-levels.ts` 派生一级/二级菜单纯函数并写测试，再逐个模式实现并验收「菜单出现在正确位置 + 切换模式菜单状态不丢」。每完成一个模式就跑一次 build。

### 实施

| 文件 | 改动 |
| --- | --- |
| `layouts/utils/menu-levels.ts` | 新建：`deriveMenuLevels`（`firstLevelMenus` / `secondLevelMenus` / `childLevelMenus` + `isActiveFirstHasChildren` / `isActiveSecondHasChildren`，纯函数）、`deriveActiveKeysFromRoute`（路由父链 → 激活一级/二级 key 的回退值） |
| `__tests__/layouts/menu-levels.test.ts` | 新建 10 用例：三层派生、空 key 回退、hasChildren 布尔、路由父链回退 |
| `layouts/constant.ts` | 追加 `GLOBAL_SIDER_FIRST_LEVEL_ID`（vertical-mix 左栏挂载点）与五个模式分组常量：`VERTICAL_LAYOUT_MODES` / `TOP_HYBRID_LAYOUT_MODES` / `HYBRID_LAYOUT_MODES` / `MIX_OR_HYBRID_LAYOUT_MODES` / `FIRST_LEVEL_LAYOUT_MODES` |
| `layouts/modules/admin-menu/AdminMenu.tsx` | 扩展 props：`menuMode`（`inline` \| `horizontal`）、`containerId`（portal 目标可切换）、`selectBehavior`（`default` \| `activateFirst`，后者对一级有子级项只激活不导航） |
| `layouts/modules/admin-menu/VerticalMixSider.tsx` | 新建双栏容器：左栏 portal `GLOBAL_SIDER_FIRST_LEVEL_ID`（宽 `mixWidth` / `mixCollapsedWidth`），右栏 portal `GLOBAL_SIDER_MENU_ID`（仅 `mixSiderFixed && hasChildren` 时占 `mixChildMenuWidth`，否则宽 0） |
| `layouts/modules/admin-header/AdminHeader.tsx` | 增加 `headerMode`：`horizontal` 时顶栏菜单挂载点 `flex-1` 占满中间、`center` 不渲染（Breadcrumb 与顶栏菜单互斥） |
| `layouts/store/menus.ts` | 增加 `activeSecondKey` 与 `resetActiveKeys`（路由变化把手动覆盖态清空，交给路由派生接管） |
| `apps/admin/src/pages/(admin)/layout.tsx` | 装配层按 `layoutSettings.layout.mode` 单点分发：菜单实例数量（vertical/horizontal 各 1 个、hybrid 与 vertical-mix 各 2 个）、各实例的 portal 目标与 `menuMode`、`headerMode`、`siderVisible = siderWidth > 0` |

### 验收结果

- 壳包 `test` 52/52（新增 menu-levels 10 用例）
- `eslint src/layouts __tests__` 绿；壳包 `typecheck` 仅基线 2 个历史错误
- app typecheck / lint / build 全绿
- 六模式浏览器实测统一在 SK-3.7 一次跑完（见该章模式表），本阶段无独立实测记录

### 偏差

| 清单 | 实际 | 理由 |
| --- | --- | --- |
| 「每个模式独立可验收」 | 五模式共用一套 prop 派生，逐个模式切换实测集中到 SK-3.7 | 模式差异全部由 `siderWidth` + 菜单 portal 位置表达，不需要五套组件 |
| 清单未要求模式分组常量 | `constant.ts` 追加五个分组数组 | 「哪些模式走 mix 宽度 / 哪些模式一级菜单在顶栏」需要谓词，散落在装配层与单测里会重复 |
| `menu-levels.spec.ts` 与源码同目录 | `__tests__/layouts/menu-levels.test.ts` | 仓库 `TEST_PATTERNS` 只匹配包根 `__tests__/`（同 SK-3.2 / SK-3.3 偏差） |

### 已知现象

- 混合模式首帧菜单数据未到 → `siderWidth=0` → 侧栏挂载点不存在，portal 必须持续同步容器（缺陷在 SK-3.7 定位并修复）。
- antd Menu 在 `mode="horizontal"` 时若带 `inlineCollapsed` 会告警，故该 prop 用条件展开而不是传 `undefined`。

### 状态（2026-10-30）

**已完成**。六模式均可通过 `layoutSettings.layout.mode` 单点切换。

---

## SK-3.7 接线与验收

**目标**：把布局壳接进 `(admin)/layout.tsx`，回归阶段 2 全链路，补文档。

### 前置

SK-3.0 ~ SK-3.6 全部完成。

### 任务

1. **改 `apps/admin/src/pages/(admin)/layout.tsx`**：
   - 保留 `beforeLoad` 守卫逻辑（阶段 2 成果，勿动）
   - 组件体从「最小顶栏」换成 `<AdminLayout />` 装配
   - 用户区、退出登录作为插槽注入
2. **`__root.tsx`**：确认 `<QueryClientProvider>` 仍在最外层（阶段 2 已落地）
3. **回归清单**（逐项验证并记录证据）：
   - 登录 → 进 `/home`，侧栏出现菜单
   - 刷新页面 → 静默续签 → 布局与菜单正常恢复
   - 折叠侧栏 → 刷新 → 折叠态保持
   - 打开 3 个页面 → 3 个标签 → 关闭中间 → 跳右邻
   - 退出登录 → 先调后端 → 本地清空 → 标签清空 → 回 `/login`
   - 切换 6 模式 → 菜单状态保持
   - 移动端宽度（`<sm`）→ `isMobile` 生效，侧栏改抽屉或自动折叠
4. **更新文档**：
   - `.scratch/admin-migration-plan.md` 阶段 3 标记完成，写实际交付差异
   - `docs/guide/skyroc-admin-layout-architecture-explained.md` 补齐 §9 的未确认项
   - 若有架构级取舍（如 tabs 缓存选型），写 ADR

### 完成判定

- 回归清单 7 项全部有记录（截图或说明）
- 三项验收全绿 + 壳包 test 绿
- 文档已更新

### 会话启动提示语

> 执行 SK-3.7。把 `AdminLayout` 接进 `apps/admin/src/pages/(admin)/layout.tsx`（保留阶段 2 的 beforeLoad 守卫与 handleLogout 链路），然后按清单逐项回归验证：登录/刷新续签/折叠保持/标签关闭跳转/登出清空/六模式切换/移动端。最后更新 `.scratch/admin-migration-plan.md` 阶段 3 状态并补齐调研文档未确认项。

### 实施

| 文件 | 改动 |
| --- | --- |
| `apps/admin/src/pages/(admin)/layout.tsx` | 组装全部壳模块：`AdminLayoutProvider`（`headerRightActions: userArea`、`logoTo: '/home'`）+ `AdminLayoutComponent`（Header / Sider / Tab / `<Outlet />` + 菜单实例）+ 面包屑派生 + 六模式 prop 映射 + `handleLogout`（POST logout → `authStore.clear()` → `queryClient.clear()` → `useTabsStore.reset()` → 跳 `/login`）；`beforeLoad` 守卫原样保留 |
| `apps/admin/src/__root.tsx` | 复核 `<QueryClientProvider>` 仍在最外层（无需改动） |
| `layouts/utils/sider-width.ts` | 修复 `isMixMode` 漏 `TOP_HYBRID_HEADER_FIRST`（见缺陷 1） |
| `layouts/modules/admin-header/AdminHeader.tsx` | 新增 `showSiderToggle?: boolean`（见缺陷 2） |
| `layouts/modules/admin-menu/AdminMenu.tsx` | portal 容器持续同步 + `inlineCollapsed` 条件展开（见缺陷 3） |
| `__tests__/layouts/sider-width.test.ts` | top-hybrid-header-first 分组断言改为 `mixWidth` / `mixCollapsedWidth` |
| `.scratch/admin-phase3-layout-checklist.md` / `packages/web/admin/src/layouts/README.md` / `docs/guide/skyroc-admin-layout-architecture-explained.md#§9` / `.scratch/admin-migration-plan.md` | 结论写回与阶段状态更新 |

### 六模式实测结果

实测方式：临时改 `layouts/config/layout-settings.ts` 的 `layout.mode`，rsbuild HMR 直接生效无需重启（**验后已还原为 `vertical`**）；环境为真实 admin-api(3001) + admin dev(3004)，种子菜单数据。

| 模式 | 实测现象 |
| --- | --- |
| `vertical` | 登录进 `/home`；侧栏菜单可导航、折叠 240↔64、标签关闭跳右邻；折叠态刷新保持；无 console error |
| `horizontal` | 侧栏消失；顶栏出现「系统管理 / 系统监控」水平菜单 |
| `vertical-hybrid-header-first` | 顶栏一级菜单 + 侧栏二级（4 项）；顶栏一级高亮；侧栏宽度 48↔80 |
| `top-hybrid-sidebar-first` | 侧栏 80↔48、侧栏 8 项；顶栏同时有水平菜单 |
| `top-hybrid-header-first` | **修复后**侧栏 80↔48、8 项；`/home`（一级无子级）时侧栏消失 |
| `vertical-mix` | 左栏 2 项（系统管理 / 系统监控）、右栏 8 项；顶栏无菜单；折叠后宽度 48 |

### 本轮修复的真实缺陷

| # | 缺陷 | 根因 | 修法 |
| --- | --- | --- | --- |
| 1 | `top-hybrid-header-first` 取到 240 / 64 而非 80 / 48 | `utils/sider-width.ts` 的 `isMixMode` 漏了 `LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST`，该模式走进普通 `width` / `collapsedWidth` 分支 | 补入 `isMixMode` 判定；单测同步改断言 |
| 2 | hybrid 三模式顶栏无折叠按钮 | `AdminHeader` 用 `headerMode='horizontal'` 即隐藏 `SiderToggle`，但 hybrid 三模式虽用 horizontal 顶栏却有侧栏 | 新增 `showSiderToggle` prop（默认 `!isHorizontal`），装配层传 `showSiderToggle={siderVisible}` |
| 3 | 混合模式侧栏菜单为空（永不渲染） | `AdminMenu` 用 `useLayoutEffect` 只解析一次 portal 容器；混合模式首帧菜单未加载 → `siderWidth=0` → 侧栏挂载点不存在 → `container` 永久 `null` | 保留首取，另用 `MutationObserver` 监听 `document.body`（`childList` + `subtree`）持续同步容器：出现即挂、被条件渲染移除即置空；同时把 `inlineCollapsed` 改为条件展开，消除 antd 的 `inlineCollapsed should only be used when mode is inline` 告警 |

关键证据：`/system` 路由未注册，但菜单目录 `SystemManagement` 的 `routePath='/system'`，`findMenuByPath` 能精确命中（`match=系统管理`，`secondLevelMenus=8`）——侧栏为空纯属 portal 容器缺陷，与菜单数据无关。装配层临时 `console.log('[DEBUG-layout]'…)` 已全部删除。

### 回归清单（清单 7 项）

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 登录 → 进 `/home`，侧栏出现菜单 | ✓ |
| 2 | 刷新页面 → 静默续签 → 布局与菜单恢复 | ✓ |
| 3 | 折叠侧栏 → 刷新 → 折叠态保持 | ✓（`admin-layout` 持久化白名单生效） |
| 4 | 打开 3 个页面 → 3 标签 → 关闭中间 → 跳右邻 | ✓ |
| 5 | 退出登录 → 先调后端 → 本地清空 → 标签清空 → 回 `/login` | ✓ |
| 6 | 切换 6 模式 → 菜单状态保持 | ✓（见模式表；菜单实例为 portal，切换不重建） |
| 7 | 移动端宽度（`<sm`）→ `isMobile` 生效，侧栏抽屉 / 自动折叠 | **未实测**（本轮只跑桌面断点，单独记录为遗留项） |

### 验收结果

- 壳包 `pnpm --filter @fedstack/web-admin-shell test`：**52/52 绿**（sider-width 24 / menu-mapper 18 / menu-levels 10）
- 壳包 `eslint src/layouts __tests__`：0 错误
- 壳包 `typecheck`：仅剩基线 `src/theme/setup.ts(3,35) Cannot find module './hooks'`，新增文件零错误
- `pnpm --filter @fedstack/admin` typecheck / lint / build 全绿（**Total 4085.4 kB / 1101.7 kB gzip**）

### 偏差

| 清单 | 实际 | 理由 |
| --- | --- | --- |
| 壳包 `modules/AdminLayout.tsx` 装配层 | 装配全部留在 app 的 `(admin)/layout.tsx` | 装配需要菜单查询、用户资料、登出等 app 业务；壳包只提供受控模块，保持业务无关 |
| 清单 7 项回归含移动端 | 仅完成 6 项桌面回归 | 断点行为需单独一轮窄屏实测，未在本轮伪造结论 |
| 清单要求「sider-width.spec.ts 与 menu-levels.spec.ts」 | 壳包根 `__tests__/layouts/*.test.ts` | 仓库 `TEST_PATTERNS` 约定的唯一落点 |

### 状态（2026-10-30）

**已完成**。遗留两项：① 移动端 `<sm` 断点回归未实测；② 标签条首帧不建标签（见 SK-3.5「已知不足」）。两项均已记录，不隐瞒。

---

## 附录 A：本阶段新建文件总览

```text
packages/web/admin/src/layouts/
├── index.ts                              # SK-3.0
├── constant.ts                           # SK-3.0  六模式 + 3 个 portal id + 模式分组
├── context.tsx                           # SK-3.0  插槽 Context
├── README.md                             # SK-3.0
├── config/layout-settings.ts             # SK-3.2
├── materials/{AdminLayout,types,shared,index}  # SK-3.1 / SK-3.1.5（Tailwind 改写）
├── utils/sider-width.ts                  # SK-3.2（SK-3.7 修 isMixMode）
├── utils/menu-mapper.ts                  # SK-3.3
├── utils/menu-icons.ts                   # SK-3.3
├── utils/menu-levels.ts                  # SK-3.6
├── store/layout.ts                       # SK-3.2
├── store/menus.ts                        # SK-3.3（SK-3.6 加 activeSecondKey）
├── store/tabs.ts                         # SK-3.5
├── modules/admin-header/{AdminHeader,Logo,Breadcrumb,SiderToggle,Fullscreen,index}  # SK-3.4（SK-3.7 加 showSiderToggle）
├── modules/admin-menu/{AdminMenu,SiderMenuMount,VerticalMixSider,index}              # SK-3.3 / SK-3.6
└── modules/admin-tab/{AdminTab,index}    # SK-3.5

packages/web/admin/
├── vitest.config.ts                      # SK-3.2
├── __tests__/layouts/{sider-width,menu-mapper,menu-levels}.test.ts  # SK-3.2 / 3.3 / 3.6
└── (SK-3.1.5) src/styles/{tailwind.css,global.css,reset.css}、eslint.config.js 守卫

apps/admin/src/
├── service/api/menu.ts                   # SK-3.3
├── types/api/menu.d.ts                   # SK-3.3
├── features/router/index.ts              # SK-3.4  StaticDataRouteOption 增强
├── pages/(admin)/$.tsx                   # SK-3.3  （清单外）布局内 404 兜底
├── pages/(admin)/home/index.tsx          # SK-3.4  staticData.title
└── pages/(admin)/layout.tsx              # SK-3.7  装配（列表见 SK-3.7 实施）
```

> 清单原设想但**未创建**的文件（记录以免误导后续会话）：`state/` 目录（统一用 `store/`）、`modules/AdminLayout.tsx`、`modules/AdminSider.tsx`、`modules/AdminContent.tsx`、`state/AdminTabEffect.tsx`。装配在 app 侧完成，内容区直接用 `<Outlet />` 包在骨架 children 里。

## 附录 B：不要做的事

| 不要 | 原因 |
|---|---|
| 在壳包 `layouts/` 里 `import '@/...'` | 反向依赖 app，破坏可复用性；需 eslint 守卫拦 |
| 把菜单树放进 Zustand | 服务端状态应由 React Query 管，双写会产生第二事实源 |
| 在 `materials/` 读 store / theme | 原语层必须受控，否则无法单测 |
| 用后端 `component` 字段动态加载组件 | A 方案已裁决不做动态路由；该字段无路径语义约定 |
| 阶段 3 顺手做主题切换 | Q7 已裁决只预留 CSS 变量，主题是阶段 4 |
| 把 `accessToken` 或任何凭据写 localStorage | D1/D5；只有布局偏好可落地 |
| 在 `beforeLoad` 里写 tabs / 改布局态 | 导航可能被取消，副作用要放路由完成后 |
