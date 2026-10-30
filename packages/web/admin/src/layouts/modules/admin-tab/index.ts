/**
 * 标签条模块（B 方案：简化版，无 Keep-Alive 组件缓存）。
 *
 * 路由 → 标签同步由 AdminTab 内部的 useUpdateEffect 监听 location.pathname 完成；
 * 标签数据存 Zustand store（`layouts/store/tabs.ts`）。Keep-Alive 缓存接口预留但暂不实现——
 * skyroc 也仅在路由 `staticData.keepAlive=true` 时才启用，默认不缓存。
 */

export { default as AdminTab } from './AdminTab';
export type { AdminTabProps } from './AdminTab';
