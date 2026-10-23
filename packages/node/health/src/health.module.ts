import type { DynamicModule, Provider } from '@nestjs/common';
import type { HealthModuleAsyncOptions } from './health.options.js';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { HEALTH_MODULE_OPTIONS } from './health.tokens.js';
import { RedisHealthIndicator } from './redis.health.js';

/**
 * 健康检查模块（共享基础设施，见 ADR-004）。
 *
 * 边界：
 * - 包内提供双探针骨架 + Redis 三态指标（@fedstack/redis 适配）；
 * - 各 app 的就绪检查项（如数据库 ping）经 forRootAsync 显式装配，
 *   包不认识任何 app 的 PrismaService / 业务依赖；
 * - 未接入 RedisCacheModule 的 app 探针 degraded 而非装配失败（见 RedisHealthIndicator）。
 *
 * 消费方职责（见 README）：
 * - 在 setGlobalPrefix 的 exclude 中声明 'health'、'health/ready'；
 * - 网关层对探针路径做内网 ACL，不对公网开放。
 */
@Module({})
export class HealthModule {
  static forRootAsync(asyncOptions: HealthModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: HEALTH_MODULE_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject ?? [],
    };

    return {
      module: HealthModule,
      imports: [TerminusModule, ...(asyncOptions.imports ?? [])],
      controllers: [HealthController],
      providers: [optionsProvider, RedisHealthIndicator],
    };
  }
}
