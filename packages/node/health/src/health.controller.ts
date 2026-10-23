import type { HealthModuleOptions, ReadinessCheck } from './health.options.js';
import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { HEALTH_MODULE_OPTIONS } from './health.tokens.js';
import { RedisHealthIndicator } from './redis.health.js';

/**
 * 健康探针控制器（共享底座）。
 *
 * - GET /health       存活探针：进程级，不查任何依赖（k8s livenessProbe）。
 * - GET /health/ready 就绪探针：Redis（内置）+ 各 app 装配的检查项（k8s readinessProbe）；
 *   任一 down → 503；degraded → HTTP 200 且整体状态 degraded（terminus 语义）。
 *
 * 探针路径由各 app 在 setGlobalPrefix 的 exclude 中声明，不进入 /api 业务前缀：
 * 探针是基础设施契约（编排骨架 + 网关 ACL 消费），不属于版本化业务 API 契约。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redis: RedisHealthIndicator,
    @Inject(HEALTH_MODULE_OPTIONS)
    private readonly options: HealthModuleOptions,
  ) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    const checks: ReadinessCheck[] = [
      () => this.redis.pingCheck('cache'),
      ...(this.options.readinessChecks ?? []),
    ];
    return this.health.check(checks);
  }
}
