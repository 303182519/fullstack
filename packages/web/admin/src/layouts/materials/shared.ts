import type { CSSProperties } from 'react';

import type { AdminLayoutMode } from './types';

/**
 * 布局滚动容器的 DOM id。
 *
 * `scrollMode` 为 `wrapper` 时挂在外层容器，为 `content` 时挂在内容区。
 * 使用 `content` 滚动模式时必须把该 id 交给 TanStack Router 的 `scrollRestoration`，
 * 否则路由切换后会去滚动 `window`（不滚动的那个容器）。
 */
export const LAYOUT_SCROLL_EL_ID = '__ADMIN_LAYOUT_SCROLL_EL_ID__';

/** 布局各层的层级上限，顶栏 / 标签 / 侧栏 / 页脚的 z-index 均由它派生 */
export const LAYOUT_MAX_Z_INDEX = 100;

/** 生成本次布局实例 CSS 变量所需的输入 */
export interface LayoutCssVarsParams {
  mode: AdminLayoutMode;
  isMobile: boolean;
  maxZIndex: number;
  headerHeight: number;
  tabHeight: number;
  footerHeight: number;
  siderWidth: number;
  siderCollapsedWidth: number;
}

/**
 * 把受控尺寸折算成布局的 CSS 变量，挂在布局根节点上。
 *
 * 变量命名与 `styles/global.css` 的 `--layout-*` 保持一致：全局变量是默认值，
 * 这里是单实例覆盖值，二者只有一份语义。
 */
export function createLayoutCssVars(params: LayoutCssVarsParams): CSSProperties {
  const { footerHeight, headerHeight, isMobile, maxZIndex, mode, siderCollapsedWidth, siderWidth, tabHeight } = params;

  // 层级从高到低：侧栏 > 顶栏 > 标签条 / 页脚；horizontal 模式下侧栏让位给顶栏
  const siderZIndex = mode === 'vertical' || isMobile ? maxZIndex - 1 : maxZIndex - 4;

  return {
    '--layout-header-height': `${headerHeight}px`,
    '--layout-header-z-index': String(maxZIndex - 3),
    '--layout-mobile-sider-z-index': String(isMobile ? maxZIndex - 2 : 0),
    '--layout-sider-collapsed-width': `${siderCollapsedWidth}px`,
    '--layout-sider-width': `${siderWidth}px`,
    '--layout-sider-z-index': String(siderZIndex),
    '--layout-tab-height': `${tabHeight}px`,
    '--layout-tab-z-index': String(maxZIndex - 5),
    '--layout-footer-height': `${footerHeight}px`,
    '--layout-footer-z-index': String(maxZIndex - 5),
  } as CSSProperties;
}
