/**
 * 平台中立的类型工具出口，由主入口 `export type *` 转出。
 *
 * 这里只放不依赖任何宿主环境的纯类型。依赖 DOM 的表单元素类型（`FieldElement` / `CustomElement`）随浏览器入口留在二期。
 *
 * 该边界由 tsconfig 强制：本目录所属的 TS 项目 `lib` 只有 `ESNext`，没有 DOM， 一旦泄漏 DOM 全局类型会直接编译失败。
 */
export type * from './fn';

export type * from './misc';

export type * from './object';

export type * from './path';

export type * from './primitive';
