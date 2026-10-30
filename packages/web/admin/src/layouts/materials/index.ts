/**
 * 布局骨架原语。
 *
 * 对外只暴露骨架组件（别名 `AdminLayoutComponent`，避免与后续顶层装配组件 `AdminLayout` 重名）
 * 与滚动容器 id 常量。骨架是纯受控 UI：不读 store、不读主题。
 */

export { default as AdminLayoutComponent } from './AdminLayout';

export { LAYOUT_SCROLL_EL_ID } from './shared';

export type { AdminLayoutMode, AdminLayoutProps, AdminLayoutScrollMode } from './types';
