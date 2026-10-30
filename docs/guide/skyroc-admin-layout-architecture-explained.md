# Skyroc apps/admin 布局壳架构调研 · 源码出处与 fedstack 阶段 3 迁移映射

> 本文面向执行「阶段 3：布局壳（侧边栏 / 顶栏 / 标签页 Keep-Alive / 菜单）」的同学，讲清楚两件事：
> **skyroc 上游的后台布局壳实际怎么组织的（每条结论带源码出处）、各环节映射到 fedstack 时该复用还是改写。**
>
> 调研对象：<https://github.com/Ohh-889/skyroc> master（2026-10-30 抓取）。
> 迁移目标形态：`.scratch/admin-migration-plan.md` 阶段 3。
> 引用格式：`仓库内相对路径:行号范围` 或「模块路径」。
> 配套执行清单：`.scratch/admin-phase3-layout-checklist.md`。

---

## 0. 前置：三个必须先讲清的事实

### 0.1 skyroc 的布局壳不在 app 里，在壳包里

`apps/admin/src/` 下**没有** `layouts/` 目录（已核实，GitHub 目录树返回 404）。布局壳位于：

```
packages/web/admin/layouts/
```

由 `apps/admin` 通过 `@shell/*` 别名消费（commit `dfc41ac2e` "refactor(apps): 三个 app 与根配置接入 @shell 别名"）。

skyroc 曾经把这套东西拆成 9 个 npm 包，后由 commit `ce84582a` **「admin shell 零包化」** 合并为单一目录，其 commit message 原文给出理由：

> 「后台 shell 不是通用库，是一套绑死 admin 形态、消费者必然要修改的系统——按 shadcn 模型改为『仓库内单一副本 + 生成时复制进项目』，不再作为 npm 包分发。」

**这条结论直接支持 fedstack 的阶段 3 决策 Q2**：布局壳放 `packages/web/admin/layouts/` 是对的，且不应包装成可独立发布的 npm 包。

### 0.2 阶段 3 的 Q3 / Q4 已裁决为「A 方案」

skyroc 用 `GET /route/getReactUserRoutes` 拉后端路由表，前端**运行时动态注册路由**。fedstack 已裁决**不跟**，理由是：

- fedstack 的路由由 `@tanstack/router-plugin` 在**编译期**生成 `routeTree.gen.ts`（`apps/admin/rsbuild.config.ts:67-85`），`features/router/index.ts:4` 直接 `import { routeTree } from './routeTree.gen'`；
- 动态注册必须放弃静态生成，连带失去 `Link to` 类型校验与 autoCodeSplitting；
- fedstack 的 `GET /menus/available` 返回 `MenuResponseDto`，**不是** RuoYi 路由表结构；其 `component` 字段仅 `@MaxLength(200)` 透传，**无路径语义约定**（`apps/admin-api/src/modules/menu/dto/create-menu.dto.ts:48-51`、`menu.service.ts:120`）。

因此 fedstack 采用：**文件式静态路由 + 菜单树只做导航 UI**，`routePath` 与文件路由路径做字符串匹配。skyroc 的「动态路由注册」留到阶段 5 评估。

### 0.3 tabs 的缓存机制**未完全确认**（如实声明）

skyroc 的 tabs 三个文件为 `state/tabs/{index.ts, shared.tsx, use-admin-tab.ts}`。本次两次抓取（raw + blob 页面）均被爬虫拦截返回空内容，**未能读到源码**。

已确认的间接证据：

- `state/AdminTabEffect.tsx` 存在，职责是「路由 ↔ 标签」同步副作用；
- `state/use-admin-state.ts` 持有 `reloadFlag` 与 `reloadPage()`（见 §5），即 skyroc 的「刷新当前页」= **翻转 `reloadFlag` 让内容区重挂载**；
- `layouts/modules/admin-tab/` 是标签条 UI。

**未确认**：内容区是否真做了组件级缓存（如 `react-activation` / 自研 CachedOutlet），还是仅靠 `reloadFlag` 做「刷新」而无跨标签缓存。

> ⚠️ 执行 SK-3.5 前必须 clone 源码补齐这一环，**不得凭本文推断实现缓存层**。

---

## 1. 概览：一张图看懂布局壳

```text
apps/admin/src/pages/(admin)/layout.tsx   ← 路由层的布局路由（beforeLoad 守卫）
        │  component: <AdminLayout>      ← 消费 @shell/layouts
        ▼
packages/web/admin/layouts/AdminLayout.tsx（顶层装配）
        │
        ├── context.tsx        AdminLayoutProvider：插槽下发（logo/content/footer/header*Actions）
        ▼
   AdminLayoutContent（内部组件，读 state + theme 后装配）
        │
        ├── materials/        纯 UI 原语，无业务逻辑
        │     └── AdminLayoutComponent（六模式骨架；LAYOUT_SCROLL_EL_ID）
        │
        ├── modules/          拼装件
        │     ├── AdminHeader.tsx       顶栏容器
        │     ├── admin-header/         顶栏内部件（面包屑/搜索/全屏/语言/主题/用户）
        │     ├── AdminSider.tsx        侧栏容器
        │     ├── AdminMenu.tsx         菜单挂载点（portal 到 header 或 sider）
        │     ├── admin-menu/           菜单渲染器
        │     ├── AdminTab.tsx          标签条
        │     ├── admin-tab/            标签内部件（关闭/刷新/右键菜单）
        │     ├── admin-search/         全局搜索
        │     ├── theme-drawer/         主题配置抽屉（lazy）
        │     ├── AdminContent.tsx      内容区 → TanStack Router Outlet
        │     └── AdminFooter.tsx / AdminLogo.tsx
        │
        └── state/            状态与副作用
              ├── use-admin-state.ts   本地布局态（jotai atomWithPartial）
              ├── menus/               菜单树 + useAdminMenus
              ├── tabs/                标签态（未读到源码）
              ├── AdminEffect.tsx      全局副作用（lazy）
              └── AdminTabEffect.tsx   路由 ↔ 标签同步
```

**关键设计：菜单与内容区是兄弟节点。**

`AdminLayout.tsx` 末尾的 children 同时渲染 `<GlobalContent />` 与 `<AdminMenu />`：

```tsx
<AdminLayoutComponent ...>
  <GlobalContent />   {/* 内容区 */}
  <AdminMenu />       {/* 菜单 */}
  <Suspense fallback={null}><ThemeDrawer /></Suspense>
  <Suspense fallback={null}><AdminEffect /></Suspense>
</AdminLayoutComponent>
```

菜单不在 sider 内部，而是通过 `constant.ts` 的两个 DOM id 常量做 **portal 挂载**：

```ts
export const GLOBAL_HEADER_MENU_ID = '__GLOBAL_HEADER_MENU__';   // 顶栏模式下的菜单挂载点
export const GLOBAL_SIDER_MENU_ID  = '__GLOBAL_SIDER_MENU__';    // 侧栏模式下的菜单挂载点
```

**为什么这样设计**：同一份菜单树在 6 种布局模式下要出现在不同位置（horizontal 放顶栏、vertical 放侧栏、hybrid 两者都要）。若菜单嵌死在 sider 里，切换模式就得整棵树重建，状态（展开项、选中项）会丢。用 portal + 固定 id，菜单组件只有一个实例，切换模式只是换 DOM 挂载目标。

> 📌 fedstack 迁移时这条**必须保留**，否则六模式切换会出状态丢失 bug。

---

## 2. 六种布局模式

`packages/web/admin/layouts/constant.ts` 定义：

| 常量 | 值 | 视觉形态 |
|---|---|---|
| `LAYOUT_MODE.HORIZONTAL` | `horizontal` | 无侧栏，菜单在顶栏 |
| `LAYOUT_MODE.VERTICAL` | `vertical` | 经典左菜单 + 顶栏 |
| `LAYOUT_MODE.VERTICAL_MIX` | `vertical-mix` | 左栏一级菜单 + 二级菜单子栏 |
| `LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST` | `vertical-hybrid-header-first` | 顶栏一级菜单 + 侧栏二级菜单 |
| `LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST` | `top-hybrid-sidebar-first` | 顶栏含侧栏折叠入口 + 侧栏二级菜单 |
| `LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST` | `top-hybrid-header-first` | 顶栏一级 + 侧栏二级（顶栏优先） |

源码还导出 5 个**分组常量**，用于「当前模式属于哪一类」的判定：

```ts
VERTICAL_LAYOUT_MODES        = [vertical, vertical-mix, vertical-hybrid-header-first]
TOP_HYBRID_LAYOUT_MODES      = [top-hybrid-sidebar-first, top-hybrid-header-first]
HYBRID_LAYOUT_MODES          = [vertical-hybrid-header-first, top-hybrid-sidebar-first, top-hybrid-header-first]
MIX_OR_HYBRID_LAYOUT_MODES   = [vertical-mix, ...HYBRID_LAYOUT_MODES]
FIRST_LEVEL_LAYOUT_MODES     = [vertical-hybrid-header-first, top-hybrid-sidebar-first, top-hybrid-header-first]
```

`AdminLayout.tsx:70` 只用了一个粗分类：

```ts
const layoutMode = VERTICAL_LAYOUT_MODES.includes(layout.mode)
  ? LAYOUT_MODE_VERTICAL
  : LAYOUT_MODE_HORIZONTAL;
```

**即：materials 层只认 vertical / horizontal 两种骨架，六种模式的差异全部由 sider 宽度计算与菜单挂载位置表达。**

### 2.1 侧栏宽度的分支计算（六模式的真正复杂度所在）

`AdminLayout.tsx:71-100` 的 `getSiderAndCollapsedWidth(isCollapsed)`：

```text
输入：sider.collapsedWidth / mixCollapsedWidth / mixWidth / width / mixChildMenuWidth

1. isTopHybridHeaderFirst && 一级菜单无子级 → 返回 0（顶栏优先模式下无二级菜单就不出侧栏）
2. isVerticalHybridHeaderFirst && 一级菜单无子级 → 返回 0（同上）
3. 计算 isMixMode = isVerticalMix || isTopHybridSidebarFirst || isVerticalHybridHeaderFirst
4. finalWidth = isMixMode ? mixWidth : width
5. isVerticalMix && mixSiderFixed && 有二级菜单 → finalWidth += mixChildMenuWidth
6. isVerticalHybridHeaderFirst && mixSiderFixed && 有子级菜单 → finalWidth += mixChildMenuWidth
```

> 📌 这是六模式里唯一「逻辑密集」的地方。**建议 fedstack 用一个纯函数 + 单测覆盖这 6 个分支**，而不是散在组件里。
> 它是纯函数（输入 theme 配置 + 菜单层级状态 → 输出宽度），非常适合 TDD。

---

## 3. 侧边栏与菜单渲染

### 3.1 Sider 容器

`modules/AdminSider.tsx` —— 消费 materials 的骨架，承载 `AdminMenu` 的 portal 目标（`GLOBAL_SIDER_MENU_ID`）。

### 3.2 菜单渲染器

`modules/admin-menu/` —— 读取 `state/menus/` 的菜单树，转成 antd Menu 的 `items`，并处理：
- 一级/二级菜单分组（mix / hybrid 模式需要）
- 选中态与路由同步
- 折叠态下的图标模式

`useAdminMenus()`（`state/menus/use-admin-menus.ts`）返回 `{ childLevelMenus, isActiveFirstLevelMenuHasChildren, secondLevelMenus }` —— 见 `AdminLayout.tsx:57`，这三个值直接喂给宽度计算与菜单渲染。

### 3.3 菜单数据来源

skyroc：`GET /route/getReactUserRoutes` → RuoYi 路由表 → `initMenus()` 写入 `state/menus`。

**fedstack 改写点**：`GET /menus/available` → `MenuResponseDto[]`，前端做 DTO → UI 模型映射：

| MenuResponseDto 字段 | → UI 模型 | 处理 |
|---|---|---|
| `id` | `key` | 直接 |
| `menuName` | `label` | 直接 |
| `icon` | `icon` | 字符串 → antd 图标组件（需注册表） |
| `routePath` | `path` | 直接（与文件路由路径字符串匹配） |
| `menuType` | — | **过滤 `BUTTON`**，只留 `DIRECTORY` / `MENU` |
| `visible` | — | `false` 不渲染 |
| `status` | — | `DISABLED` 不渲染 |
| `children` | `children` | 递归 |
| `sort` | 排序 | 同级排序 |
| `component` / `permCode` / `routeName` | — | 阶段 3 **不使用**（A 方案不需要；权限留阶段 5） |

---

## 4. 顶栏

`modules/AdminHeader.tsx` + `modules/admin-header/`。由 `AdminLayout.tsx:105` 装配：

```tsx
Header={<AdminHeader />}
headerHeight={header.height}
```

内置件按插槽顺序排布（`context.tsx:16-24` 定义了三个操作区插槽）：

```
[Logo] [面包屑] [搜索] [headerLeftActions] [语言] [主题] [headerMiddleActions] ... [用户区] [headerRightActions]
```

插槽类型定义（`context.tsx:14-26`）：

```ts
interface AdminLayoutSlots {
  content?: ReactNode;
  footer?: ReactNode;
  headerLeftActions?: ReactNode;    // 位于搜索与全屏之间
  headerMiddleActions?: ReactNode;  // 位于语言切换与主题按钮之间
  headerRightActions?: ReactNode;   // 位于所有内置操作之后
  logo?: ReactNode;
  logoComponent?: (style: CSSProperties) => ReactNode;
  logoTitle?: ReactNode;
  logoTo?: Router.RoutePath;
}
```

**这套插槽机制的价值**：业务方（`apps/admin`）不需要改壳包代码就能往顶栏塞自定义按钮。fedstack 应原样保留，因为它把「壳的职责」与「app 的职责」切得很干净。

---

## 5. 布局状态管理

`state/use-admin-state.ts` 用 jotai `atomWithPartial`，初始值：

```ts
{
  siderCollapse: false,
  themeDrawerVisible: false,
  fullContent: false,
  contentXScrollable: false,
  reloadFlag: true,
  mixSiderFixed: false
}
```

对外暴露的能力：

| 能力 | 说明 |
|---|---|
| `siderCollapse` / `toggleSiderCollapse` / `setSiderCollapse` | 侧栏折叠 |
| `isMobile` | 来自 `ahooks` 的 `useResponsive()`，`!responsive.sm` |
| `verticalMenuWidth` | 复用纯函数 `getVerticalMenuWidth(layoutMode, sider, siderCollapse)` |
| `fullContent` / `toggleFullContent` | 隐藏菜单只留内容（全屏工作区） |
| `contentXScrollable` / `setContentXScrollable` | 内容区横向滚动开关 |
| `reloadFlag` / `setReloadFlag` / `reloadPage` | **刷新当前页** |
| `themeDrawerVisible` / `openThemeDrawer` / `closeThemeDrawer` | 主题抽屉 |
| `mixSiderFixed` / `toggleMixSiderFixed` | mix 模式下固定子菜单栏 |

### 5.1 `reloadPage()` 的实现（重要）

```ts
async function reloadPage(duration = 300) {
  setReloadFlag(false);
  const d = page.animate ? duration : 40;
  await new Promise(resolve => { setTimeout(resolve, d); });
  setReloadFlag(true);
}
```

内容区以 `reloadFlag` 为 `key`（或依赖它做条件渲染），翻转即触发卸载 → 重新挂载。

> 📌 这是「刷新当前标签页」的等价物。**它与 Keep-Alive 是一对矛盾统一体**：有缓存就要有「强制丢弃某个缓存」的出口，`reloadFlag` 就是那个出口。
> fedstack 的 `store/layout.ts` 应保留这个语义（可叫 `reloadKey: number`，自增则重挂载）。

### 5.2 持久化的一处

```ts
useEffect(() => {
  setAdminState({ mixSiderFixed: storage.get('mixSiderFixed') === 'Y' });
}, [setAdminState, storage]);
```

只有 `mixSiderFixed` 落 localStorage。skyroc 用 `getAdminLayoutsOptions().storage`（`setup.ts`）。

> 📌 fedstack D1 要求「客户端状态 Zustand 内存」，但**布局偏好（侧栏是否折叠、mix 是否固定）属于纯 UI 偏好，不涉密**，可以落 localStorage。这条需在阶段 3 明确边界：**token 类不落地，布局偏好可落地**。

---

## 6. 主题耦合点（阶段 4 的前置契约）

`AdminLayout.tsx:53`：

```ts
const { fixedHeaderAndTab, footer: themeFooter, header, layout, sider, tab } = useSettingsTheme();
```

布局壳消费的主题字段清单：

| 主题字段 | 用途 |
|---|---|
| `layout.mode` | 六模式选择 |
| `layout.scrollMode` | 内容区滚动方式 |
| `sider.width` / `collapsedWidth` | 侧栏宽 / 折叠宽 |
| `sider.mixWidth` / `mixCollapsedWidth` / `mixChildMenuWidth` | mix 模式专用宽度 |
| `header.height` | 顶栏高 |
| `tab.height` / `tab.visible` | 标签条高与显隐 |
| `footer.height` / `visible` / `fixed` / `right` | 页脚 |
| `fixedHeaderAndTab` | 顶栏+标签是否吸顶 |
| `page.animate` | 刷新动画时长 |

**fedstack 阶段 3 的取舍（Q7 已裁决）**：不接主题系统，改为：
1. 上述字段收敛成**一个静态配置对象**（如 `layouts/config/layout-settings.ts`），带默认值；
2. 尺寸/颜色全部写成 **CSS 变量**（Tailwind 4 的 `@theme` 块 + `var(--xxx, fallback)`）；
3. 阶段 4 只需把静态对象换成响应式 theme store + 把 CSS 变量换成动态注入值，**布局组件零改动**。

> 📌 这是本阶段最重要的「为未来留缝」设计。若阶段 3 把 `headerHeight: 56` 硬编码进组件，阶段 4 要改遍所有组件。

---

## 7. 与 fedstack 阶段 3 的差异对照

| 维度 | skyroc | fedstack 阶段 3 | 差异性质 |
|---|---|---|---|
| 放置位置 | `packages/web/admin/layouts/`（零包化） | 同位置（Q2 已裁决） | ✅ 直接对齐 |
| 别名 | `@shell/*` | 需新建（当前 `@fedstack/web-admin-shell` 无 layouts 域、apps/admin 未依赖） | 需补基建 |
| 路由来源 | 后端路由表 + 动态注册 | **文件式静态路由**（Q3/Q4 裁决 A） | 必须改写 |
| 菜单数据 | `/route/getReactUserRoutes` | `GET /menus/available` + DTO 映射 | 必须改写 |
| 菜单挂载 | portal 到 `GLOBAL_*_MENU_ID` | **保留** | ✅ 复用 |
| 六模式 | 全部支持 | 全部支持（Q1 裁决） | ✅ 复用（分支计算要重写为纯函数） |
| 状态库 | jotai `atomWithPartial` | **Zustand**（D1） | 必须改写 |
| 布局态范围 | 6 个字段 + menus + tabs | `store/layout.ts` + `store/menus.ts`（Q6） | 简化（去掉 themeDrawer 等阶段 4 项） |
| 持久化 | `mixSiderFixed` 落 localStorage | 仅布局偏好可落地 | 需明确边界 |
| 主题 | `@shell/theme` 全套 | **CSS 变量 + 静态配置**（Q7） | 必须改写（但留缝） |
| 标签页缓存 | 未确认（见 §0.3） | 对齐 skyroc | ⚠️ 待核实后定 |
| 国际化 | `@shell/i18n` | 阶段 7 | 不迁移 |
| 通知中心 | `notification/` | 阶段 7 | 不迁移 |
| 用户信息 | `context.userInfo`（jotai） | React Query `['auth','profile']`（阶段 2 已落地） | ✅ 复用 |

---

## 8. 迁移映射：skyroc 模块 → fedstack 落点

### 8.1 直接复用的设计（机制不变）

| skyroc 源 | 机制 | fedstack 落点 |
|---|---|---|
| `layouts/context.tsx` | 插槽 Context（logo / header*Actions / content / footer） | `packages/web/admin/src/layouts/context.tsx` |
| `layouts/constant.ts` | 六模式常量 + 分组常量 + portal DOM id | `layouts/constant.ts`（值原样，类型换成本仓 union） |
| `layouts/AdminLayout.tsx` 的装配思路 | Provider + Content 两层，模块化插拔 | `layouts/AdminLayout.tsx` |
| `materials/` 的纯原语定位 | UI 骨架与业务解耦 | `layouts/materials/` |
| `modules/` 的按域拆目录 | header / menu / tab / content / sider 各自独立 | `layouts/modules/` |
| 菜单 portal 挂载 | 一份菜单多布局位置复用 | 保留 |
| `reloadPage()` 语义 | 翻转 key 重挂载 | `store/layout.ts` 的 `reloadKey` |

### 8.2 因 D1 / Q3 / Q4 / Q6 / Q7 必须改写

| skyroc 源 | 改写点 | fedstack 落点 |
|---|---|---|
| `state/use-admin-state.ts` | jotai → Zustand；去掉 themeDrawer / theme 依赖 | `store/layout.ts` |
| `state/menus/use-admin-menus.ts` | 数据源改 `/menus/available`；jotai → Zustand + React Query | `store/menus.ts` + `service/api/menu.ts` |
| `modules/admin-menu/` | 菜单树来自 MenuResponseDto，需 DTO→UI 映射；过滤 BUTTON/不可见/禁用 | `layouts/modules/admin-menu/` |
| `AdminLayout.tsx` 的 `useSettingsTheme()` | 改为读静态 `layout-settings.ts` + CSS 变量 | `layouts/config/layout-settings.ts` |
| `getSiderAndCollapsedWidth` | 抽成纯函数 + 单测 | `layouts/utils/sider-width.ts` |
| `modules/theme-drawer/` | 阶段 4 才做 | 不迁移 |
| `modules/admin-search/` | 非阶段 3 范围（全局搜索） | 暂不迁移 |
| `state/tabs/*` | 需先核实缓存实现，再改写为 Zustand | `store/tabs.ts` + `layouts/modules/admin-tab/` |

### 8.3 不迁移

| skyroc 内容 | 原因 |
|---|---|
| `theme/` 全套 + `theme-drawer/` | 阶段 4 |
| `notification/` | 阶段 7 |
| `i18n/` + `locales/` | 阶段 7 |
| 后端路由表动态注册 | 阶段 5 评估（当前 A 方案） |
| `@shell/devtools` 调试面板 | 非本仓需求 |
| `admin-search/` 全局搜索 | 非阶段 3 交付项 |

---

## 9. 未能从源码确认的事项（诚实清单）

1. **tabs 的缓存实现**：`state/tabs/use-admin-tab.ts` 两次抓取均返回空，未读到。SK-3.5 开工前必须 clone 源码核实，**不能推断**。
2. **`materials/AdminLayoutComponent` 的 DOM 结构**：仅知导出 `LAYOUT_SCROLL_EL_ID`，未读到其内部 grid/flex 布局细节。SK-3.1 需补。
3. **`modules/admin-menu/` 的菜单数据结构**：`childLevelMenus` / `secondLevelMenus` 的派生规则未读到（`use-admin-menus.ts` 未抓取）。
4. **`features/` 子目录内容**：`layouts/features/` 目录存在但未展开，职责未知。
5. **skyroc 配套后端的路由表契约**：前端只见 RuoYi 风格类型，后端不在仓库内，语义无法验证。

---

## 附：源码文件索引（skyroc 仓库相对路径）

| 文件 | 职责 | 读取状态 |
|---|---|---|
| `packages/web/admin/layouts/AdminLayout.tsx` | 顶层装配 + 宽度分支 | ✅ 已读全文 |
| `packages/web/admin/layouts/constant.ts` | 六模式常量 + portal id | ✅ 已读全文 |
| `packages/web/admin/layouts/context.tsx` | 插槽 Context | ✅ 已读全文 |
| `packages/web/admin/layouts/state/use-admin-state.ts` | 布局本地态 | ✅ 已读全文 |
| `packages/web/admin/layouts/state/tabs/use-admin-tab.ts` | 标签态 | ❌ 抓取失败 |
| `packages/web/admin/layouts/state/tabs/shared.tsx` | 标签共享件 | ❌ 未读 |
| `packages/web/admin/layouts/state/AdminTabEffect.tsx` | 路由↔标签同步 | ❌ 未读 |
| `packages/web/admin/layouts/modules/AdminContent.tsx` | 内容区 | ❌ 未读 |
| `packages/web/admin/layouts/modules/AdminSider.tsx` | 侧栏容器 | ❌ 未读 |
| `packages/web/admin/layouts/modules/admin-menu/` | 菜单渲染 | ❌ 未读 |
| `packages/web/admin/layouts/modules/admin-tab/` | 标签条 | ❌ 未读 |
| `packages/web/admin/layouts/materials/` | 六模式骨架原语 | ❌ 未读 |
| `packages/web/admin/layouts/setup.ts` | 全局配置读取 | ❌ 未读 |
| `packages/web/admin/layouts/options.tsx` | 布局选项 | ❌ 未读 |
| `apps/admin/src/pages/(admin)/layout.tsx` | 路由层布局 + 守卫 | ✅ 已读全文（fedstack 侧） |
