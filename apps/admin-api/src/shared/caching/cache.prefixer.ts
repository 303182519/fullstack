import type KeyvRedis from '@keyv/redis';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_STORE } from './cache.tokens.js';

/**
 * 统一前缀化工具。
 *
 * 缓存目录下存在两条 Redis 落盘路径：
 *   1. 走 cache-manager → Keyv → KeyvRedis（由 KeyvRedis 在 store 层自动加 namespace 前缀）
 *   2. 直接 REDIS_CLIENT 调用（HashCacheService / LoginAttemptService / RedisLockService / SortedSetCacheService）
 *
 * 第 2 条路径不会自动前缀化，需要由调用方手动 prefix。namespace 与 separator
 * 直接从 KeyvRedis store 实例派生（单一真相源，而非另读一份配置手工对齐），
 * 保证两条路径落盘格式一致：`${namespace}${separator}${业务key}`。
 *
 * Redis 未配置（内存 store）时 prefix 原样返回——此时直连 client 的服务全部为 no-op，
 * 前缀取值不影响行为。
 */
@Injectable()
export class KeyPrefixer {
  private readonly namespace?: string;
  private readonly separator: string;

  constructor(
    @Inject(REDIS_STORE) store: KeyvRedis<unknown> | null,
  ) {
    this.namespace = store?.namespace || undefined;
    this.separator = store?.keyPrefixSeparator ?? ':';
  }

  /** 业务 key → 落盘 key：`${namespace}${separator}${key}`；无 namespace 时原样返回 */
  prefix(key: string): string {
    if (!this.namespace)
      return key;
    return `${this.namespace}${this.separator}${key}`;
  }

  /** SCAN MATCH 模式：`${namespace}${separator}${pattern}` */
  pattern(p: string): string {
    return this.prefix(p);
  }
}
