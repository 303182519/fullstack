/**
 * `@fedstack/utils` 平台无关主入口。
 *
 * 这里只允许出现 Node / 浏览器 / React Native 三端都能跑的代码 —— 不得直接引用 `window`、`document`、`navigator`、`localStorage` 等宿主全局。 该约束由
 * tsconfig 强制：本入口所属的 TS 项目 `lib` 只有 `ES2023`，没有 DOM。
 *
 * 浏览器专用工具在 `@fedstack/web-utils`（web 层），不从这里导出。
 */

export * from './array';
export * from './cn';
export * from './createSubject';
export * from './date';
export * from './emitter';
export * from './klona';
export * from './nanoid';
export { diff as diffObject, isEventObject, isObjectType, shallowEqual } from './object';
export * from './path';
export * from './priority-queue';
export * from './query';
export * from './radash';
export * from './reg';
export * from './scheduler';
export * from './singleflight';
export type * from './type';
export * from './utils';
