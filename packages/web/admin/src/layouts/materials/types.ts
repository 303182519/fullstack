import type { ReactNode } from 'react';

/**
 * 布局骨架模式。
 *
 * 六种布局模式在 materials 层收敛为两种：模式差异由 sider 宽度计算与菜单挂载位置表达，
 * 骨架本身只区分「侧栏主导」与「顶栏主导」。对齐 skyroc `materials/types` 的 `LayoutMode`。
 */
export type AdminLayoutMode = 'vertical' | 'horizontal';

/**
 * 滚动模式。
 *
 * - `wrapper`：布局外层容器滚动（顶栏吸顶靠 absolute + 占位块）
 * - `content`：内容区独立滚动，外层不滚
 */
export type AdminLayoutScrollMode = 'content' | 'wrapper';

/**
 * 布局骨架的受控契约。
 *
 * 所有尺寸与可见性都由调用方算好再传进来：materials 不读 store、不读主题、不做业务判断，
 * 因此可被任意布局模式复用，也可被单测直接渲染。
 */
export interface AdminLayoutProps {
  /** 布局骨架模式，默认 `vertical` */
  mode?: AdminLayoutMode;
  /** 是否固定顶栏与标签条，默认 `true` */
  fixedTop?: boolean;
  /** 是否移动端布局：侧栏改为浮层 + 遮罩，默认 `false` */
  isMobile?: boolean;
  /** 滚动模式，默认 `content` */
  scrollMode?: AdminLayoutScrollMode;
  /** 滚动容器的 DOM id（供 router 的 scrollRestoration 定位） */
  scrollElId?: string;
  /** 内容区附加 class */
  contentClass?: string;
  /** 层级上限，顶栏 / 标签 / 侧栏 / 页脚的 z-index 都由它派生，默认 100 */
  maxZIndex?: number;

  /** 顶栏内容 */
  Header?: ReactNode;
  /** 顶栏高度，默认 56px */
  headerHeight?: number;
  /** 顶栏是否可见，默认 `true` */
  headerVisible?: boolean;

  /** 侧栏内容 */
  Sider?: ReactNode;
  /** 侧栏展开宽度，默认 240px */
  siderWidth?: number;
  /** 侧栏折叠宽度，默认 64px */
  siderCollapsedWidth?: number;
  /** 侧栏是否可见，默认 `true`（horizontal 模式由调用方传 false） */
  siderVisible?: boolean;
  /** 侧栏是否折叠，默认 `false` */
  siderCollapse?: boolean;

  /** 标签条内容 */
  Tab?: ReactNode;
  /** 标签条高度，默认 40px */
  tabHeight?: number;
  /** 标签条是否可见，默认 `true` */
  tabVisible?: boolean;

  /** 页脚内容 */
  Footer?: ReactNode;
  /** 页脚高度，默认 48px */
  footerHeight?: number;
  /** 页脚是否可见，默认 `true` */
  footerVisible?: boolean;
  /** 页脚是否固定在视口底部，默认 `false` */
  fixedFooter?: boolean;
  /** 页脚是否随内容区右侧对齐（不占侧栏宽度），默认 `false` */
  rightFooter?: boolean;

  /** 全屏内容模式：隐藏顶栏 / 标签条 / 侧栏 / 页脚，只留内容区 */
  fullContent?: boolean;

  /** 请求切换侧栏折叠态（移动端点击遮罩时触发） */
  updateSiderCollapse: () => void;

  /** 内容区内容 */
  children?: ReactNode;
}
