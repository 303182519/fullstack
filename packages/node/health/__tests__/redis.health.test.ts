import type { CacheHealthIndicator, CacheHealthStatus } from '@fedstack/redis';
import { HealthIndicatorService } from '@nestjs/terminus';
import { describe, expect, it, vi } from 'vitest';
import { RedisHealthIndicator } from '../src/redis.health.js';

function createIndicator(cacheHealth: CacheHealthIndicator | null) {
  return new RedisHealthIndicator(new HealthIndicatorService(), cacheHealth);
}

function mockCacheHealth(status: CacheHealthStatus): CacheHealthIndicator {
  return {
    check: vi.fn().mockResolvedValue(status),
  } as unknown as CacheHealthIndicator;
}

describe('redisHealthIndicator.pingCheck', () => {
  it('cacheHealthIndicator 缺席（未注册 RedisCacheModule）→ degraded', async () => {
    const result = await createIndicator(null).pingCheck('cache');
    expect(result.cache.status).toBe('degraded');
  });

  it('redis 已配置且 PING 成功 → up', async () => {
    const result = await createIndicator(mockCacheHealth('up')).pingCheck('cache');
    expect(result.cache.status).toBe('up');
  });

  it('redis 未配置 → degraded（不触发 503）', async () => {
    const result = await createIndicator(mockCacheHealth('degraded')).pingCheck('cache');
    expect(result.cache.status).toBe('degraded');
  });

  it('redis 已配置但不可达 → down（触发 503）', async () => {
    const result = await createIndicator(mockCacheHealth('down')).pingCheck('cache');
    expect(result.cache.status).toBe('down');
  });
});
