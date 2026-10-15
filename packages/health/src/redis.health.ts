import { CacheHealthIndicator } from '@fedstack/redis';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

/**
 * Redis 缓存健康指标（Terminus 适配层）。
 *
 * 三态语义由 @fedstack/redis 的 CacheHealthIndicator 统一收口：
 * - up：Redis 已配置且 PING 成功
 * - degraded：Redis 未配置（系统降级为内存 store，业务可用，不就绪判死）
 * - down：Redis 已配置但不可达（HTTP 503）
 *
 * CacheHealthIndicator 标 @Optional：未注册 RedisCacheModule 的 app
 * （如尚未接入缓存基础设施的服务）视为 degraded 而非装配期报错，
 * 与「未配置 ≠ 故障」的健康语义一致；已注册但不可达仍是 down。
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Optional()
    @Inject(CacheHealthIndicator)
    private readonly cacheHealth: CacheHealthIndicator | null,
  ) {}

  async pingCheck(key: string) {
    const check = this.indicator.check(key);

    if (!this.cacheHealth) {
      return check.degraded({ message: 'redis module not registered' });
    }

    const status = await this.cacheHealth.check();

    if (status === 'up') {
      return check.up();
    }
    if (status === 'degraded') {
      return check.degraded({ message: 'not configured' });
    }
    return check.down({ message: 'unreachable' });
  }
}
