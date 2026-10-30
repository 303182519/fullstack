import type { LayoutMode } from '../constant';
import type { AdminLayoutScrollMode } from '../materials/types';

/**
 * 侧栏尺寸配置。
 *
 * 五个宽度值是六模式宽度纯函数（`utils/sider-width.ts`）的全部尺寸输入，
 * 与调研文档 §2.1 的分支一一对应。
 */
export interface LayoutSiderConfig {
  /** 侧栏展开宽度（vertical / horizontal 之外的基础模式） */
  width: number;
  /** 侧栏折叠宽度 */
  collapsedWidth: number;
  /** mix 类模式（vertical-mix / top-hybrid-sidebar-first / vertical-hybrid-header-first）的展开宽度 */
  mixWidth: number;
  /** mix 类模式的折叠宽度 */
  mixCollapsedWidth: number;
  /** mix 类模式固定子菜单栏时追加的子栏宽度 */
  mixChildMenuWidth: number;
}

/**
 * 布局静态配置的完整形状。
 *
 * 阶段 3（Q7 裁决）不接主题系统：skyroc `useSettingsTheme()` 消费的布局字段收敛为本对象。
 * 阶段 4 接入主题时只需把本对象换成响应式 theme store（形状保持 `LayoutSettings`），
 * 布局组件零改动。
 */
export interface LayoutSettings {
  layout: {
    /** 六种布局模式之一，见 `../constant` 的 `LAYOUT_MODE` */
    mode: LayoutMode;
    /** 内容区滚动方式，透传给 materials 骨架 */
    scrollMode: AdminLayoutScrollMode;
  };
  sider: LayoutSiderConfig;
  header: {
    height: number;
  };
  tab: {
    height: number;
    visible: boolean;
  };
  footer: {
    height: number;
    visible: boolean;
    /** 是否固定在视口底部 */
    fixed: boolean;
    /** 是否随内容区右侧对齐（不占侧栏宽度） */
    right: boolean;
  };
  /** 顶栏 + 标签条是否吸顶 */
  fixedHeaderAndTab: boolean;
}

/**
 * 布局静态配置（阶段 3 的唯一事实源）。
 *
 * 默认值与 `styles/global.css` 的 `:root --layout-*` 变量同名同义：
 * 这里是装配层（modules/）的输入，CSS 变量是渲染层的兜底，二者不各自演化。
 */
export const layoutSettings: LayoutSettings = {
  layout: { mode: 'vertical', scrollMode: 'wrapper' },
  sider: { width: 240, collapsedWidth: 64, mixWidth: 80, mixCollapsedWidth: 48, mixChildMenuWidth: 160 },
  header: { height: 56 },
  tab: { height: 40, visible: true },
  footer: { height: 48, visible: false, fixed: false, right: false },
  fixedHeaderAndTab: true,
};
