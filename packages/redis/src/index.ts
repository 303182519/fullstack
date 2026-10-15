// 共享缓存基础设施的公开出口（见 ADR-003）。
//
// 边界：
// - 只导出「任何 app 都一致」的连接纪律、封装服务与注入令牌；
// - 不导出任何业务 key / 业务策略（如各 app 的 CacheKeys、登录锁定），那些属于消费方应用层；
// - REDIS_STORE / REDIS_MODULE_OPTIONS 为模块内部令牌，刻意不导出。

export { CacheHealthIndicator } from './cache.health.js';
export type { CacheHealthStatus } from './cache.health.js';
export { KeyPrefixer } from './cache.prefixer.js';
export { CacheService } from './cache.service.js';
export { REDIS_CLIENT } from './cache.tokens.js';
export { HashCacheService } from './hash-cache.service.js';
export { hashCacheToken } from './hash-token.js';
export { withRedis } from './redis-fallback.js';
export { RedisLockService } from './redis-lock.service.js';
export { RedisCacheModule } from './redis.module.js';
export type {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
} from './redis.options.js';
export { SortedSetCacheService } from './sorted-set-cache.service.js';

// 直连场景的类型 re-export：消费方注入 REDIS_CLIENT 时用此类型标注，
// 无需为类型层面单独直接依赖 @keyv/redis。
export type { RedisClientType } from '@keyv/redis';
