import type { RedisClientType } from '@keyv/redis';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from './cache.tokens.js';
import { withTimeout } from './promise.js';

const PING_TIMEOUT_MS = 1000;

/**
 * 缓存健康三态：
 * - up：Redis 已配置且 PING 成功
 * - degraded：Redis 未配置（系统以内存 store 运行，业务可用）
 * - down：Redis 已配置但不可达
 */
export type CacheHealthStatus = 'up' | 'degraded' | 'down';

@Injectable()
export class CacheHealthIndicator {
  private readonly logger = new Logger(CacheHealthIndicator.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClientType | null,
  ) {}

  /**
   * 三态健康检查，是 Redis 健康语义的唯一口径：
   * 启动自检（ping）与就绪探针（@fedstack/health 的 RedisHealthIndicator）都从这里派生。
   */
  async check(): Promise<CacheHealthStatus> {
    if (!this.redisClient)
      return 'degraded';

    try {
      if (this.redisClient.isOpen === false) {
        await withTimeout(
          this.redisClient.connect(),
          PING_TIMEOUT_MS,
          'Redis CONNECT timeout',
        );
      }

      const result = await withTimeout(
        this.redisClient.ping(),
        PING_TIMEOUT_MS,
        'Redis PING timeout',
      );

      return result === 'PONG' ? 'up' : 'down';
    }
    catch (err) {
      this.logger.warn(
        `Redis PING 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'down';
    }
  }

  /**
   * 启动自检语义：degraded（内存降级）允许继续启动，仅 down 判失败。
   */
  async ping(): Promise<boolean> {
    return (await this.check()) !== 'down';
  }
}
