import type { RedisClientType } from '@keyv/redis';
import { describe, expect, it, vi } from 'vitest';
import { CacheHealthIndicator } from './cache.health.js';

function createClient(overrides: Partial<{
  isOpen: boolean;
  connect: () => Promise<unknown>;
  ping: () => Promise<string>;
}> = {}): RedisClientType {
  return {
    isOpen: true,
    connect: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue('PONG'),
    ...overrides,
  } as unknown as RedisClientType;
}

describe('cacheHealthIndicator.check', () => {
  it('client 为 null（未配置 Redis）→ degraded', async () => {
    const indicator = new CacheHealthIndicator(null);
    await expect(indicator.check()).resolves.toBe('degraded');
  });

  it('pING 返回 PONG → up', async () => {
    const indicator = new CacheHealthIndicator(createClient());
    await expect(indicator.check()).resolves.toBe('up');
  });

  it('pING 返回非 PONG → down', async () => {
    const indicator = new CacheHealthIndicator(
      createClient({ ping: vi.fn().mockResolvedValue('OK') }),
    );
    await expect(indicator.check()).resolves.toBe('down');
  });

  it('pING 抛错 → down', async () => {
    const indicator = new CacheHealthIndicator(
      createClient({ ping: vi.fn().mockRejectedValue(new Error('boom')) }),
    );
    await expect(indicator.check()).resolves.toBe('down');
  });

  it('连接未打开时先 connect 再 PING', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const ping = vi.fn().mockResolvedValue('PONG');
    const indicator = new CacheHealthIndicator(
      createClient({ isOpen: false, connect, ping }),
    );

    await expect(indicator.check()).resolves.toBe('up');
    expect(connect).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
  });

  it('connect 抛错 → down', async () => {
    const indicator = new CacheHealthIndicator(
      createClient({
        isOpen: false,
        connect: vi.fn().mockRejectedValue(new Error('refused')),
      }),
    );
    await expect(indicator.check()).resolves.toBe('down');
  });
});

describe('cacheHealthIndicator.ping（启动自检语义）', () => {
  it('degraded / up 视为可启动，down 判失败', async () => {
    await expect(new CacheHealthIndicator(null).ping()).resolves.toBe(true);
    await expect(new CacheHealthIndicator(createClient()).ping()).resolves.toBe(true);
    await expect(
      new CacheHealthIndicator(
        createClient({ ping: vi.fn().mockRejectedValue(new Error('boom')) }),
      ).ping(),
    ).resolves.toBe(false);
  });
});
