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

**目标**：让 `apps/admin` 能 `import { AdminLayout } from '@fedstack/web-admin-shell/layouts'`，且构建通过。**不写任何布局业务代码。**

### 事实基线（已核实）

| 项 | 现状 |
|---|---|
| 壳包名 | `@fedstack/web-admin-shell`（`packages/web/admin/package.json:2`） |
| 壳包现有域 | `src/theme`、`src/ui`、`src/styles`（**无 layouts**） |
| 壳包 exports | **无 `exports` 字段**，无打包脚本，只有 lint/test/typecheck |
| apps/admin 依赖 | **未依赖** `@fedstack/web-admin-shell`（`apps/admin/package.json:15-28`） |
| 路径别名 | 未确认，需读 `tsconfig` 与 `eslint.config.js` |

### 任务

1. **读现状**：`packages/web/admin/tsconfig.json`、`eslint.config.js`、`src/theme/index.ts`、`src/ui/index.ts`，确认现有导出风格（barrel export？子路径导出？）。
2. **决定引用方式**（二选一，需在会话内给出证据后再定）：
   - **A. 子路径 + tsconfig paths**：`paths: { "@fedstack/web-admin-shell/layouts": ["../../packages/web/admin/src/layouts/index.ts"] }`。因为壳包无 `exports` 字段、无构建产物，**这是当前唯一可行方式**（源码直引）。
   - **B. 加 `exports` + 构建**：给壳包加 tsup/rslib 构建。**不建议**——阶段 3 没必要引入壳包构建链，会让 dev 变慢。
3. 在 `packages/web/admin/src/layouts/` 建空骨架：
   ```
   layouts/
   ├── index.ts          # barrel，先只导出 AdminLayout 占位
   ├── constant.ts       # 六模式常量 + portal DOM id（照抄 skyroc 值）
   ├── context.tsx       # 插槽 Context（照抄 skyroc 契约）
   └── README.md         # 域说明：本目录是 admin 专属壳，不对外发布
   ```
4. `apps/admin/package.json` 加 `"@fedstack/web-admin-shell": "workspace:*"`。
5. 在 `apps/admin` 的 tsconfig 里配 paths（或确认已由 base tsconfig 覆盖）。

### 知识点

- **为什么源码直引而不构建**：skyroc 的零包化 commit 明确说这套壳「消费者必然要修改」，源码直引让改壳包时热更新即时生效，无构建中间层。
- **壳包不能反向依赖 app**：`layouts/` 里禁止 `import '@/...'`（app 的别名）。壳包只能依赖 `@fedstack/*` 公共包与 peer 依赖。这条要在 `eslint.config.js` 加 `no-restricted-imports` 守卫。
- **peer 依赖**：`antd` / `react` / `@tanstack/react-router` / `zustand` 在壳包里应是 peerDependencies 或由 app 提供，避免双份 React。

### 产出

- `packages/web/admin/src/layouts/{index.ts, constant.ts, context.tsx, README.md}`
- `apps/admin/package.json`（+1 依赖）
- tsconfig paths（若需要）
- eslint 反向依赖守卫

### 完成判定

- `pnpm --filter @fedstack/admin typecheck` 绿
- `pnpm --filter @fedstack/web-admin-shell typecheck` 绿
- 在 `apps/admin` 里临时 `import { LAYOUT_MODE } from '@fedstack/web-admin-shell/layouts'` 能编译（验证后移除）
- `pnpm install` 无警告

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

---

## 附录 A：本阶段新建文件总览

```text
packages/web/admin/src/layouts/
├── index.ts                          # SK-3.0
├── constant.ts                       # SK-3.0  六模式 + portal id
├── context.tsx                       # SK-3.0  插槽 Context
├── README.md                         # SK-3.0
├── config/layout-settings.ts         # SK-3.2
├── utils/sider-width.ts(+spec)       # SK-3.2
├── utils/menu-mapper.ts(+spec)       # SK-3.3
├── utils/menu-levels.ts(+spec)       # SK-3.6
├── store/layout.ts                   # SK-3.2
├── state/menus.ts                    # SK-3.3
├── state/tabs.ts                     # SK-3.5
├── state/AdminTabEffect.tsx          # SK-3.5
├── materials/AdminLayout.tsx         # SK-3.1
├── modules/AdminLayout.tsx           # SK-3.7 装配层
├── modules/AdminHeader.tsx           # SK-3.4
├── modules/admin-header/*            # SK-3.4
├── modules/AdminSider.tsx            # SK-3.1/3.6
├── modules/admin-menu/AdminMenu.tsx  # SK-3.3
├── modules/admin-tab/*               # SK-3.5
└── modules/AdminContent.tsx          # SK-3.1

apps/admin/src/
├── service/api/menu.ts               # SK-3.3
├── types/api/menu.d.ts               # SK-3.3
└── pages/(admin)/layout.tsx          # SK-3.7 接线
```

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
