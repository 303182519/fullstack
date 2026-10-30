/**
 * 后台布局模式（六种）。
 *
 * 本类型是 `layouts` 域的权威定义，不依赖 `theme` 域：主题在阶段 4 会以 CSS 变量重写，
 * 布局壳不能反过来绑在旧主题类型上。
 * 取值必须与 `src/theme/types/theme.d.ts` 的 `Theme.ThemeLayoutMode` 保持一致，
 * 直到阶段 4 把主题类型也收敛到这里为止。
 */
export type LayoutMode
  = | 'horizontal'
    | 'top-hybrid-header-first'
    | 'top-hybrid-sidebar-first'
    | 'vertical'
    | 'vertical-hybrid-header-first'
    | 'vertical-mix';

/** 六种布局模式的常量别名，键名与 `Theme.ThemeLayoutMode` 的取值一一对应 */
export const LAYOUT_MODE = {
  HORIZONTAL: 'horizontal',
  TOP_HYBRID_HEADER_FIRST: 'top-hybrid-header-first',
  TOP_HYBRID_SIDEBAR_FIRST: 'top-hybrid-sidebar-first',
  VERTICAL: 'vertical',
  VERTICAL_HYBRID_HEADER_FIRST: 'vertical-hybrid-header-first',
  VERTICAL_MIX: 'vertical-mix',
} as const satisfies Record<string, LayoutMode>;

/** 侧边栏主导的模式：菜单整体挂在侧栏 */
export const VERTICAL_LAYOUT_MODES: LayoutMode[] = [
  LAYOUT_MODE.VERTICAL,
  LAYOUT_MODE.VERTICAL_MIX,
  LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
];

/** 顶栏主导的混合模式：一级菜单在顶栏，子级菜单在侧栏 */
export const TOP_HYBRID_LAYOUT_MODES: LayoutMode[] = [
  LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
  LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
];

/** 全部混合模式（侧栏混合 + 顶栏混合） */
export const HYBRID_LAYOUT_MODES: LayoutMode[] = [
  LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
  LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
  LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
];

/** 需要「双栏菜单」的模式：vertical-mix 与全部混合模式 */
export const MIX_OR_HYBRID_LAYOUT_MODES: LayoutMode[] = [
  LAYOUT_MODE.VERTICAL_MIX,
  ...HYBRID_LAYOUT_MODES,
];

/** 一级菜单不在主侧栏的模式：一级菜单渲染到顶栏或混合侧栏 */
export const FIRST_LEVEL_LAYOUT_MODES: LayoutMode[] = [
  LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
  LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
  LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
];

/**
 * 侧栏菜单的 portal 挂载点 DOM id。
 *
 * 布局壳在侧栏位置渲染一个空容器并挂上该 id，菜单组件 portal 进去，
 * 使「菜单实例」与「内容区」成为兄弟节点：切换布局模式时菜单实例不重挂载，
 * 展开/高亮状态得以保留。
 */
export const GLOBAL_SIDER_MENU_ID = '__GLOBAL_SIDER_MENU__';

/** 顶栏菜单的 portal 挂载点 DOM id，语义同 {@link GLOBAL_SIDER_MENU_ID} */
export const GLOBAL_HEADER_MENU_ID = '__GLOBAL_HEADER_MENU__';

/** vertical-mix 模式侧栏左栏（一级菜单）的 portal 挂载点 DOM id */
export const GLOBAL_SIDER_FIRST_LEVEL_ID = '__GLOBAL_SIDER_FIRST_LEVEL__';
