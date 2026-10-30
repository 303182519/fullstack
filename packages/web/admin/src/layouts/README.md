# layouts —— 后台布局壳域

admin 专属的框架层：装配侧栏、顶栏、标签页与内容区，支持六种布局模式。
**不是通用库**，消费者（`apps/admin`）必然会修改它，因此不做发布、不做构建。

## 引用方式

应用侧通过 tsconfig `paths` 源码直引，不走包名导入：

```ts
import { LAYOUT_MODE } from '@shell/layouts';
```

映射关系见 `apps/admin/tsconfig.json` 的 `"@shell/*"`。
壳包没有 `exports` 字段也没有产物，包名子路径（`@fedstack/web-admin-shell/layouts`）不可解析。

## 目录规划（分阶段落地）

| 路径                                                    | 阶段                     |
| ------------------------------------------------------- | ------------------------ |
| `index.ts` / `constant.ts` / `context.tsx`              | SK-3.0 已完成            |
| `materials/` 纯 UI 骨架（只认 vertical / horizontal）   | SK-3.1 / SK-3.1.5 已完成 |
| `config/`、`utils/sider-width.ts`、`store/`、CSS 变量   | SK-3.2 已完成            |
| `modules/admin-menu/`、`utils/menu-*`、`store/menus.ts` | SK-3.3 已完成            |
| `modules/admin-header/`                                 | SK-3.4 已完成            |
| `modules/admin-tab/`、`store/tabs.ts`                   | SK-3.5 已完成            |
| `utils/menu-levels.ts`、`VerticalMixSider`、六模式分发   | SK-3.6 / SK-3.7 已完成   |

## materials 约定

- 骨架是**纯受控 UI**：尺寸、可见性、折叠态全部由调用方算好传入，不读 store、不读主题。
- 六种布局模式在骨架层收敛为 `vertical` / `horizontal`；模式差异由 `siderWidth` 与菜单挂载位置表达。
- 菜单的 portal 挂载点（`GLOBAL_SIDER_MENU_ID` / `GLOBAL_HEADER_MENU_ID`）由 `modules/` 层渲染，不在骨架里。
- 滚动容器 id 由 `LAYOUT_SCROLL_EL_ID` 导出：`wrapper` 模式挂外层容器，`content` 模式挂内容区，交给 router 的 `scrollRestoration`。
- 样式用 **Tailwind 工具类**（SK-3.1.5 起），尺寸只消费根节点上的 `--layout-*` 变量（`h-[var(--layout-header-height)]` 这类任意值）。
  入口在壳包 `styles/tailwind.css`，其中 `@source` 显式声明扫描壳包源码——Tailwind 的自动内容检测只覆盖应用构建目录。
- 壳包的 `reset.css` 整体收进 `@layer base`：留在无层样式里会压过 `@layer utilities`（例如 `h1` 上的 `text-xl` / `font-bold`）。
  antd 的 CSS-in-JS 是无层样式，仍然优先级最高，组件外观不受 Tailwind 影响。

## 状态与配置约定（SK-3.2）

- `config/layout-settings.ts` 是布局静态配置的唯一事实源（阶段 4 换主题 store 时形状保持 `LayoutSettings`）。
- `utils/sider-width.ts` 是六模式宽度计算的唯一入口：纯函数，单测在壳包根 `__tests__/layouts/`（沿用仓库 `TEST_PATTERNS` 约定，不与源码同目录）。
- `store/layout.ts` 用 Zustand + `persist`，白名单只落 `siderCollapse` / `mixSiderFixed`（纯 UI 偏好）；`reloadKey` 自增触发内容区重挂载，不持久化。
- 尺寸默认值同时存在于 `layout-settings.ts`（装配层输入）与 `styles/global.css` 的 `:root --layout-*`（渲染层兜底），二者同名同义，不允许各自演化。

## 菜单约定（SK-3.3）

- 菜单树的唯一事实源是 `GET /menus/available` 的 React Query 缓存（app 侧 `menuQueryOptions`），**不复制进 Zustand**；`store/menus.ts` 只存 `openKeys` / `activeKey` / `activeSecondKey` 三个交互 UI 态，且不持久化。
- `utils/menu-mapper.ts` 的 `MenuDto` 是映射的最小输入契约：app 的 `MenuResponseDto` 结构化兼容后直接传入，壳包不反向依赖 app 类型。
- 过滤规则：`BUTTON` / `visible=false` / `status=DISABLED` 不渲染；子级被滤尽的 DIRECTORY 一并丢弃；同级按 `sort` 升序。
- 图标一律走 `MenuIconRegistry` 静态注册表（`utils/menu-icons.ts` 提供默认值），**禁止动态 import 拼路径**（Rspack 无法静态分析）。
- `AdminMenu`（portal 到 `GLOBAL_SIDER_MENU_ID`）与 `SiderMenuMount`（挂载点容器）配对使用，菜单实例与内容区互为兄弟节点；选中态由 `useLocation` 实时派生（精确 + 最长前缀匹配），不落任何 store。
- portal 容器可能**晚于菜单出现**（混合模式首帧菜单数据未到 → `siderWidth=0` → 侧栏不渲染），`AdminMenu` 因此用 `MutationObserver`（`document.body` 的 `childList` + `subtree`）持续同步容器：出现即挂、被条件渲染移除即置空。只解析一次会让 `container` 永久为 `null`。
- `AdminMenu` 的 `menuMode='horizontal'` 时不得带 `inlineCollapsed`（antd 会告警），该 prop 用条件展开而不是传 `undefined`。
- 菜单指向未注册路由时由 app 侧 `(admin)/$.tsx` 通配路由在布局内兜底，root 级 404 不得替换整棵布局树。

## 顶栏约定（SK-3.4）

- `AdminHeader` 插槽顺序：Logo → SiderToggle → center → `GLOBAL_HEADER_MENU_ID`（portal 挂载点）→ headerLeftActions → Fullscreen → headerMiddleActions → headerRightActions。
- `headerMode='horizontal'`（horizontal + hybrid 三模式）时挂载点 `flex-1` 占满中间、`center` 不渲染（Breadcrumb 与顶栏菜单互斥）。
- SiderToggle 默认 `!isHorizontal` 显示；hybrid 三模式虽用 horizontal 顶栏但有侧栏，由装配层显式传 `showSiderToggle={siderVisible}`。
- 面包屑**壳包只接渲染 props**（`AdminBreadcrumbItem[]`），路由祖先链派生留在 app 装配层。理由：壳包拿不到 app 侧 `StaticDataRouteOption` 模块增强；壳包定义 `AdminBreadcrumbItem` 类型让两端对齐即可。
- 面包屑数据源是 TanStack Router `useMatches()` 的祖先链（`staticData.title ?? fallbackTitle(pathname/routeId)`），**不反查菜单树**。两者是不同数据源：菜单是"可导航集合"，面包屑是"当前路由祖先链"。
- Fullscreen 走原生 API（不用 ahooks 的 `useFullscreen`），方法调用必须 `.bind(document.body)` 否则抛 `Illegal invocation`。
- 用户区、退出登录等 app 业务一律通过 `AdminLayoutSlots.headerRightActions` 注入，壳包不请求 `/auth/profile`。

## 标签页约定（SK-3.5）

- `store/tabs.ts` 只存路由历史（`tabs` + `activeKey`），**不做组件级 Keep-Alive 缓存**：切换标签等同普通路由跳转，数据由 React Query 缓存兜底。「刷新当前页」复用 `store/layout.ts` 的 `reloadPage()`（`reloadKey` 自增触发内容区重挂载）。
- tab key 只用 `pathname`（`TabItem.path` 保留完整 path+query 供导航），同页不同查询参数共用一个标签。
- 关闭跳转「右邻 → 左邻 → 首个固定标签」；`closable: false` 为固定标签（默认 `/home`），`closeOthers` / `closeAll` 会保留它。
- 登出时 app 侧 `handleLogout` 与 `queryClient.clear()` 并列调用 `useTabsStore.getState().reset()`。
- 标签标题取当前路由 `staticData.title`，缺失时回退末段 pathname。
- **已知不足**：`AdminTab` 用 `useUpdateEffect` 跳过首帧，布局首次挂载所在页面不会生成标签（改 `useEffect` 即可，`addTab` 对已存在 key 幂等）。

## 六模式分发约定（SK-3.6 / SK-3.7）

- 模式只由 `config/layout-settings.ts` 的 `layout.mode` 驱动，**装配层单点派生**（`apps/admin/src/pages/(admin)/layout.tsx`）：菜单实例数量、各实例 portal 目标与 `menuMode`、`headerMode`、`siderVisible`。壳包不按模式分支。
- 菜单实例数量：`vertical` / `horizontal` 各 1 个；hybrid 三模式与 `vertical-mix` 各 2 个（一级 `selectBehavior='activateFirst'` + 二级 `default`）。
- 侧栏容器：`vertical-mix` 用 `VerticalMixSider`（左栏 `GLOBAL_SIDER_FIRST_LEVEL_ID` + 右栏 `GLOBAL_SIDER_MENU_ID`），其余侧栏模式用 `SiderMenuMount`。
- `siderVisible = siderWidth > 0`：`top-hybrid-header-first` / `vertical-hybrid-header-first` 在一级菜单无子级时宽度为 0，侧栏整体不渲染。
- `utils/menu-levels.ts` 是层级拆分的唯一入口（`deriveMenuLevels`）；`deriveActiveKeysFromRoute` 提供「store 手动覆盖态为空 → 路由派生」的回退值。

## 约束

- 本域**禁止**引用应用侧别名 `@/`、`~/`，只能依赖 `@fedstack/*` 公共包与 `react` / `react-dom` / `antd` / `@ant-design/icons` / `ahooks`（标签条 `useUpdateEffect`）/ `@tanstack/react-router`（peer）/ `zustand`（peer）。
  由 `eslint.config.js` 的 `no-restricted-imports` 守卫。
- `react` 之类运行时依赖在 `package.json` 用 catalog 版本声明，保证全仓同一份实例。
