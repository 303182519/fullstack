/**
 * 后台布局壳域（admin only）。
 *
 * 消费方式：`import { LAYOUT_MODE } from '@shell/layouts'`。
 * 壳包无 `exports` 字段、无构建产物，应用侧通过 tsconfig `paths` 源码直引。
 * 详见同目录 README.md。
 */

export * from './config/layout-settings';
export * from './constant';
export * from './context';
export * from './materials';
export * from './modules/admin-header';
export * from './modules/admin-menu';
export * from './modules/admin-tab';
export * from './store/layout';
export * from './store/menus';
export * from './store/tabs';
export * from './utils/menu-icons';
export * from './utils/menu-levels';
export * from './utils/menu-mapper';
export * from './utils/sider-width';
