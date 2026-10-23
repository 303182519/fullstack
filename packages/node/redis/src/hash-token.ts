import { createHash } from 'node:crypto';

/**
 * token 等敏感值先派生摘要再进 Key，避免原文出现在 Redis Key 中。
 */
export function hashCacheToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
