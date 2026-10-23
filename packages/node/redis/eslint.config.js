import { node } from '@fedstack/eslint-config/node';

// 本包是 NestJS 基础设施库：装饰器 + DI 需要 node() 的放宽规则
// （尤其 ts/consistent-type-imports: off，否则 import type 会擦除 DI 运行时令牌）。
// root eslint.config.js 已忽略 packages/node/redis，本包由 turbo run lint 触发。
export default node();
