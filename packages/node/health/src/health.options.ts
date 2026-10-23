import type { DynamicModule, Type } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';

/**
 * 就绪探针检查项。
 * 与 terminus 的 HealthIndicatorFunction 兼容：pingCheck 系列返回的
 * HealthCheckAttempt 实现了 PromiseLike<HealthIndicatorResult>，可直接作为检查项。
 */
export type ReadinessCheck = () => PromiseLike<HealthIndicatorResult> | HealthIndicatorResult;

export interface HealthModuleOptions {
  /**
   * 就绪探针的额外检查项（如数据库 ping），在内置 Redis 检查之后按序执行。
   * 任一检查 down → 整体 503；degraded 不影响 HTTP 状态（terminus 语义）。
   */
  readinessChecks?: ReadinessCheck[];
}

export interface HealthModuleAsyncOptions {
  imports?: Array<Type<any> | DynamicModule>;
  // NestJS 异步模块 useFactory 签名用 any[]（never[] 与上游 any[] 逆变不兼容）
  inject?: any[];
  useFactory: (...args: any[]) => HealthModuleOptions | Promise<HealthModuleOptions>;
}
