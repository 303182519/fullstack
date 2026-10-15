// 共享健康检查底座的公开出口（见 ADR-004）。
//
// 边界：
// - 只导出探针骨架、就绪检查契约与 Redis 指标适配；
// - HEALTH_MODULE_OPTIONS 为模块内部令牌，刻意不导出；
// - 各 app 的就绪检查项（DB / 第三方依赖）在应用层装配，包不认识任何业务依赖。

export { HealthController } from './health.controller.js';
export { HealthModule } from './health.module.js';
export type {
  HealthModuleAsyncOptions,
  HealthModuleOptions,
  ReadinessCheck,
} from './health.options.js';
export { RedisHealthIndicator } from './redis.health.js';
