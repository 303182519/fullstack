import type { CacheService } from '@fedstack/redis';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { scopeKeyOf } from '@/shared/scope/scope-resolver.service.js';

/**
 * 字典缓存失效：删除指定作用域 + 类型键的消费端选项缓存（写时失效，ADR-009）。
 * CacheService.del 在 Redis 故障时降级为 no-op，由 TTL 与下次回源自愈，此处无需兜底。
 */
export function invalidateDictOptions(
  cache: CacheService,
  tenantId: bigint | null,
  dictType: string,
): Promise<boolean> {
  return cache.del(CacheKeys.DICT_OPTIONS(scopeKeyOf(tenantId), dictType));
}
