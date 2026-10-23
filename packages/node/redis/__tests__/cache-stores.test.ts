import type { RedisClientType } from '@keyv/redis';
import KeyvRedis from '@keyv/redis';
import { describe, expect, it } from 'vitest';
import { createCacheStores } from '../src/cache-stores.js';

describe('createCacheStores', () => {
  it('未配置 Redis：降级为内存 store（非 KeyvRedis）', () => {
    const stores = createCacheStores({ keyPrefix: 'admin-api', defaultTtl: 300 });

    expect(stores).toHaveLength(1);
    expect(stores[0]!.store).not.toBeInstanceOf(KeyvRedis);
  });

  it('配置 Redis：Keyv 包裹 KeyvRedis，namespace 与分隔符口径正确', () => {
    const stores = createCacheStores({
      url: 'redis://127.0.0.1:6379',
      keyPrefix: 'admin-api',
      defaultTtl: 300,
    });

    expect(stores).toHaveLength(1);
    const store = stores[0]!.store;
    expect(store).toBeInstanceOf(KeyvRedis);

    const keyvRedis = store as KeyvRedis<unknown>;
    // namespace / separator 是 KeyPrefixer 与 invalidatePattern 的单一真相源，必须锁定
    expect(keyvRedis.namespace).toBe('admin-api');
    expect(keyvRedis.keyPrefixSeparator).toBe(':');
  });

  it('断连期间命令立即 reject（disableOfflineQueue），防止请求挂死在重连队列', () => {
    const stores = createCacheStores({
      url: 'redis://127.0.0.1:6379',
      keyPrefix: 'admin-api',
      defaultTtl: 300,
    });

    const keyvRedis = stores[0]!.store as KeyvRedis<unknown>;
    const client = keyvRedis.client as RedisClientType;
    expect(client.options?.disableOfflineQueue).toBe(true);
  });
});
