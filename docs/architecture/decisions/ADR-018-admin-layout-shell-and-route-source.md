# ADR-018：后台布局壳与路由来源

- 状态：已采纳（2026-10-30）
- 影响范围：`packages/web/admin/src/layouts/`（新建）、`packages/web/admin/src/styles/`、`apps/admin/src/pages/(admin)/layout.tsx`、`apps/admin/src/store/`、`apps/admin/src/service/api/menu.ts`
- 相关规范：`AGENTS.md` §5（架构分层）、`docs/rules/stack/frontend.md`
- 相关文档：`.scratch/admin-migration-plan.md` 阶段 3、`.scratch/admin-phase3-layout-checklist.md`、`docs/guide/skyroc-admin-layout-architecture-explained.md`
- 前置 ADR：`ADR-008`（权限模型，菜单三级进库）

---

## 1. 背景（事实依据）

- 阶段 3 目标为「布局壳（侧边栏 / 顶栏 / 标签页 Keep-Alive / 菜单）」，迁移对象为 `skyroc/apps/admin` 的布局壳（证据：`.scratch/admin-migration-plan.md` 阶段 3）。
- skyroc 的布局壳**不在 app 内**，位于 `packages/web/admin/layouts/`，由 commit `ce84582a`「admin shell 零包化」把原 9 个 npm 包合并为单目录，其 commit message 明确：「后台 shell 不是通用库，是一套绑死 admin 形态、消费者必然会修改的系统」（证据：GitHub commit message 原文）。
- skyroc 的菜单与路由来自后端路由表 `GET /route/getReactUserRoutes`，前端**运行时动态注册**路由（证据：`docs/guide/skyroc-admin-auth-flow-explained.md` §2.5、§3）。
- 本仓路由由 `@tanstack/router-plugin` **编译期**生成 `routeTree.gen.ts`（证据：`apps/admin/rsbuild.config.ts:67-85`），`apps/admin/src/features/router/index.ts:4` 直接静态 import。
- 本仓 admin-api **无**路由表接口，只有 `GET /menus/available` 返回 `MenuResponseDto`（证据：`apps/admin-api/src/modules/menu/menu.controller.ts:46-51`）。
- `MenuResponseDto.component` 仅 `@MaxLength(200)` 透传、无路径格式约束（证据：`apps/admin-api/src/modules/menu/dto/create-menu.dto.ts:48-51`、`menu.service.ts:120`）。
- 本仓壳包 `@fedstack/web-admin-shell` 已有 `theme` / `ui` / `styles` 域，**无 `layouts` 域**，且无 `exports` 字段与构建产物；`apps/admin` 当前**未依赖**该包（证据：`packages/web/admin/package.json`、`apps/admin/package.json:15-28`）。

## 2. 问题

1. 布局壳代码放哪里、以什么形式被消费方引用？
2. 侧边栏菜单与路由的关系：跟 skyroc 做后端路由表 + 动态注册，还是保留本仓文件式静态路由？
3. 六种布局模式是否全做，复杂度如何收敛？
4. 布局壳的客户端状态如何划分，菜单数据放哪一层？
5. 布局壳与尚未实现的主题系统（阶段 4）如何解耦？

## 3. 决策

### D1 布局壳放壳包，源码直引，不构建、不发布

- 位置：`packages/web/admin/src/layouts/`。
- 引用方式：`apps/admin` 通过 tsconfig `paths` 以**源码直引**（`@fedstack/web-admin-shell/layouts` → `packages/web/admin/src/layouts/index.ts`），壳包**不加** `exports` 字段、**不加**构建链。
- 壳包内**禁止** `import '@/...'`（app 别名），由 eslint `no-restricted-imports` 守卫。
- `react` / `antd` / `@tanstack/react-router` / `zustand` 在壳包为 **peerDependencies**，避免双份实例。

**取舍**：不走「壳包构建成 dist 再被 app 消费」的路径。skyroc 的零包化结论与本仓现状（壳包无构建产物、无 exports）都指向源码直引；构建层会让壳包改动的热更新多一跳，且阶段 3 无多消费者，构建收益为零。

### D2 文件式静态路由 + 菜单树只做导航 UI（**否决动态路由注册**）

- 保留 `@tanstack/router-plugin` 的编译期 `routeTree.gen.ts`；
- 侧边栏渲染 `GET /menus/available` 的 `MenuResponseDto` 树，前端做 DTO → UI 模型映射，过滤 `BUTTON` / 不可见 / 禁用；
- 菜单的 `routePath` 与文件路由路径做**字符串匹配**，仅用于高亮与 `navigate`，**不用于注册路由**；
- 不消费 `MenuResponseDto.component`；
- 动态路由注册留到阶段 5 评估。

**取舍**：拒绝 skyroc 的「后端路由表 → 前端动态注册」。原设想中「后端改菜单即改前端路由」的热更新能力被放弃，换取：`Link to` 编译期类型校验保留、autoCodeSplitting 保留、阶段 1 路由层不被推翻。更关键的是**本仓后端根本没有路由表接口**，`component` 字段无路径语义约定，强行动态加载需要前端维护一份组件注册表，等于把「后端驱动路由」的收益用额外约定成本抵消。

### D3 六种布局模式全支持，materials 层只认 vertical / horizontal 两骨架

- 六模式：`horizontal` / `vertical` / `vertical-mix` / `vertical-hybrid-header-first` / `top-hybrid-sidebar-first` / `top-hybrid-header-first`；
- `materials/`（纯 UI 原语）只实现 `vertical` 与 `horizontal` 两种骨架，六模式的差异**全部**由「侧栏宽度计算 + 菜单 portal 挂载位置」表达；
- 侧栏宽度计算抽成纯函数 `getSiderAndCollapsedWidth` + vitest 覆盖 6 模式分支；
- 菜单组件**只存在一个实例**，通过 `createPortal` 挂到 `GLOBAL_SIDER_MENU_ID` 或 `GLOBAL_HEADER_MENU_ID`。

**取舍**：不用「为每种模式写一套布局组件」。skyroc 已验证两骨架 + 宽度分支足以表达六模式；每模式一套组件会让菜单状态在切换模式时重建。

### D4 客户端状态三个 store，菜单树不进 store

- `layouts/store/layout.ts`：`siderCollapse` / `fullContent` / `contentXScrollable` / `mixSiderFixed` / `reloadKey`（自增触发重挂载），持久化白名单仅布局偏好；
- `layouts/state/menus.ts`：仅 UI 态（`openKeys` / `activeKey`），**菜单树数据走 React Query**；
- `store/tabs.ts`：标签列表与激活项（独立于布局态，事件：关闭需丢缓存、登出需清空）。

**取舍**：菜单是服务端数据，按 AGENTS.md §5 分层由 React Query 管；再存一份进 Zustand 会产生第二个事实源。tabs 从「两个 store」中拆出为第三个：它有独立生命周期且订阅粒度不同，混入 `layout.ts` 会让侧栏折叠触发标签条重渲染。

### D5 主题只预留 CSS 变量 + 静态配置，不做主题切换

- 天空布局尺寸/颜色收敛为 `layouts/config/layout-settings.ts` 静态对象；
- 组件内用 CSS 变量（`var(--layout-sider-width)` 等），**不写死数字**；
- 不引入主题 Provider、不做暗黑模式、不做主题色选择器（阶段 4）。

**取舍**：主题耦合字段有 11 项（sider 五档宽度、header/tab/footer 高度、scrollMode、fixedHeaderAndTab、page.animate）。若阶段 3 硬编码，阶段 4 要改遍所有组件；用 CSS 变量 + 静态对象做缝，阶段 4 只换注入源，壳组件零改动。

## 4. 备选方案与取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| A. 跟 skyroc 做后端路由表 + 动态注册路由 | **否决** | 本仓无该接口；`component` 无路径语义；放弃类型校验与 autoCodeSplitting；需重写阶段 1 |
| B. 静态 + 动态双模式并存 | **否决** | 两套路由树合并有路径冲突风险，实施成本最大，阶段 3 无收益 |
| C. 布局壳构建成 dist 包被 app 消费 | **否决** | 壳包无构建链；源码直引热更新更快；无多消费者 |
| D. 只做 vertical 一种模式 | **否决（用户裁决全做）** | 用户明确要求六模式；但用两骨架 + 宽度分支控制复杂度 |
| E. 每种模式一套独立布局组件 | **否决** | 模式切换会重建菜单树、丢失展开态 |
| F. 全套 jotai 状态照搬 skyroc | **否决** | D1 已锁定 Zustand（`docs/rules/stack/frontend.md` §2） |
| G. 阶段 3 顺带做主题系统 | **否决** | 会让阶段 3 复杂度翻倍；主题是阶段 4 交付项 |

## 5. 后果

**正面**

- 阶段 1 的路由成果（类型安全、autoCodeSplitting、search 序列化适配层）完整保留。
- 壳包与 app 边界清晰：壳只留插槽，用户信息/登出等业务留在 app。
- 六模式用一份菜单实例 + 宽度纯函数表达，逻辑密度集中在可单测的纯函数里。
- 主题缝预留到位，阶段 4 不返工布局组件。

**负面 / 风险**

- **放弃后端驱动路由**：菜单增删需同步改前端文件路由（新增页面必须写 `pages/` 文件）。缓解：阶段 5 若确有强需求再评估动态注册，届时须重写路由层，成本已记录。
- **源码直引的耦合**：壳包改动直接影响 app 编译，壳包出错会同时打断两个包的 typecheck。缓解：壳包自身保留 `typecheck` / `test` 脚本，CI 分开跑。
- **六模式的宽度分支易回归**：5 个分组常量 × 折叠态 × 子菜单有无，分支组合多。缓解：纯函数 + 单测覆盖，SK-3.2 强制 TDD。
- **portal 挂载的时序风险**：portal 目标节点首帧可能不存在。缓解：`useLayoutEffect` + 就绪标志，未就绪时不渲染菜单。
- **tabs 缓存机制未确认**：skyroc 的 `state/tabs/use-admin-tab.ts` 两次抓取失败，是否真做组件级缓存未知。缓解：SK-3.5 第一步 clone 源码核实，核实前不实现缓存层；若为「仅标签导航」，降级方案零第三方依赖、无内存泄漏。
- **菜单树接口无分页/无增量**：`/menus/available` 一次拉全树，租户菜单规模大时首屏有压力。当前规模可接受，记录为后续观察项。

## 6. 验证

**自动化**

| 校验 | 命令 | 阶段 |
|---|---|---|
| 六模式宽度分支 | `pnpm --filter @fedstack/web-admin-shell test`（`sider-width.spec.ts`） | SK-3.2 |
| DTO 映射规则 | 同上（`menu-mapper.spec.ts`） | SK-3.3 |
| 菜单层级派生 | 同上（`menu-levels.spec.ts`） | SK-3.6 |
| 类型 / 规范 / 构建 | `pnpm --filter @fedstack/admin {typecheck,lint,build}` | 每阶段 |
| 壳包独立校验 | `pnpm --filter @fedstack/web-admin-shell {typecheck,test}` | 每阶段 |

**行为验收（SK-3.7 逐项执行并留证）**

| 场景 | 预期 |
|---|---|
| 登录后进入 `/home` | 侧栏出现菜单树，BUTTON 类型不出现 |
| 刷新页面 | 静默续签成功，布局与菜单恢复，折叠态保持 |
| 打开 3 页 → 关闭中间标签 | 跳转到右邻标签 |
| 退出登录 | 先调 `POST /auth/logout`，再清本地，标签清空，回 `/login` |
| 切换六种模式 | 菜单出现在正确位置，展开态不丢失 |
| 视口 `<sm` | `isMobile` 生效，侧栏自动折叠或转抽屉 |
| 菜单接口失败 | 布局仍可用（侧栏空），不白屏 |
