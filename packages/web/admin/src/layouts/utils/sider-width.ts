import type { LayoutSiderConfig } from '../config/layout-settings';
import type { LayoutMode } from '../constant';

import { LAYOUT_MODE } from '../constant';

/** 侧栏宽度计算的全部输入（菜单层级状态由调用方从菜单树派生） */
export interface SiderWidthParams {
  /** 侧栏是否折叠 */
  isCollapsed: boolean;
  /** 六种布局模式之一 */
  mode: LayoutMode;
  /** 侧栏尺寸配置（见 `config/layout-settings.ts`） */
  sider: LayoutSiderConfig;
  /** 当前激活的一级菜单是否有子级 */
  isActiveFirstLevelMenuHasChildren: boolean;
  /** 二级菜单数量（vertical-mix 子栏显隐依据） */
  secondLevelMenusLength: number;
  /** 子级菜单数量（vertical-hybrid-header-first 子栏显隐依据） */
  childLevelMenusLength: number;
  /** mix 类模式下子菜单栏是否固定展开 */
  mixSiderFixed: boolean;
}

/**
 * 计算侧栏实际宽度（六模式唯一的分支密集逻辑，对齐 skyroc `AdminLayout.tsx` 的
 * `getSiderAndCollapsedWidth`）。
 *
 * 分支规则（调研文档 §2.1）：
 * 1. `top-hybrid-header-first` 且一级菜单无子级 → 0（顶栏优先，无二级菜单就不出侧栏）；
 * 2. `vertical-hybrid-header-first` 且一级菜单无子级 → 0（同上）；
 * 3. mix 类模式 = `vertical-mix` / `top-hybrid-sidebar-first` / `vertical-hybrid-header-first`，
 *    基础宽度取 `mixWidth` / `mixCollapsedWidth`，其余模式取 `width` / `collapsedWidth`；
 * 4. `vertical-mix` 且子栏固定且有二级菜单 → 追加 `mixChildMenuWidth`；
 * 5. `vertical-hybrid-header-first` 且子栏固定且有子级菜单 → 追加 `mixChildMenuWidth`。
 *
 * 纯函数：不读 store、不读 DOM，调用方（modules 装配层）负责把菜单树折算成三个布尔/数量输入。
 */
export function getSiderAndCollapsedWidth(params: SiderWidthParams): number {
  const {
    childLevelMenusLength,
    isActiveFirstLevelMenuHasChildren,
    isCollapsed,
    mixSiderFixed,
    mode,
    secondLevelMenusLength,
    sider,
  } = params;

  const isVerticalMix = mode === LAYOUT_MODE.VERTICAL_MIX;
  const isVerticalHybridHeaderFirst = mode === LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST;

  // 分支 1 / 2：顶栏优先类模式，一级菜单无子级时不渲染侧栏
  if ((mode === LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST || isVerticalHybridHeaderFirst) && !isActiveFirstLevelMenuHasChildren) {
    return 0;
  }

  // 分支 3：mix 类模式使用 mix 系列宽度
  const isMixMode = isVerticalMix
    || mode === LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST
    || mode === LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST
    || isVerticalHybridHeaderFirst;
  let width = isCollapsed
    ? (isMixMode ? sider.mixCollapsedWidth : sider.collapsedWidth)
    : (isMixMode ? sider.mixWidth : sider.width);

  // 分支 4：vertical-mix 固定子栏
  if (isVerticalMix && mixSiderFixed && secondLevelMenusLength > 0) {
    width += sider.mixChildMenuWidth;
  }

  // 分支 5：vertical-hybrid-header-first 固定子栏
  if (isVerticalHybridHeaderFirst && mixSiderFixed && childLevelMenusLength > 0) {
    width += sider.mixChildMenuWidth;
  }

  return width;
}
