import type { StorageDriver } from './storage.types.js';
import { HealthIndicatorService } from '@nestjs/terminus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageHealthIndicator } from './storage.health.js';

/** 构造一个返回固定结果的 HealthIndicatorService 桩。 */
function stubIndicator() {
  return {
    check: vi.fn().mockReturnValue({
      up: vi.fn().mockReturnValue({ status: 'up' }),
      down: vi.fn().mockReturnValue({ status: 'down' }),
      degraded: vi.fn().mockReturnValue({ status: 'degraded' }),
    }),
  } as unknown as HealthIndicatorService;
}

describe('storageHealthIndicator', () => {
  let indicator: ReturnType<typeof stubIndicator>;

  beforeEach(() => {
    indicator = stubIndicator();
  });

  it('未注入驱动时返回 degraded', async () => {
    const health = new StorageHealthIndicator(indicator, null);
    await health.pingCheck('storage');
    expect(indicator.check('storage').degraded).toHaveBeenCalled();
  });

  it('exists 返回 false（探针 key 不存在）时判定 up', async () => {
    const driver = { exists: vi.fn().mockResolvedValue(false) } as unknown as StorageDriver;
    const health = new StorageHealthIndicator(indicator, driver);
    await health.pingCheck('storage');
    expect(driver.exists).toHaveBeenCalled();
    expect(indicator.check('storage').up).toHaveBeenCalled();
  });

  it('exists 返回 true（探针 key 意外存在）时仍判定 up', async () => {
    const driver = { exists: vi.fn().mockResolvedValue(true) } as unknown as StorageDriver;
    const health = new StorageHealthIndicator(indicator, driver);
    await health.pingCheck('storage');
    expect(indicator.check('storage').up).toHaveBeenCalled();
  });

  it('exists 抛出（后端不可达）时判定 down', async () => {
    const driver = {
      exists: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as StorageDriver;
    const health = new StorageHealthIndicator(indicator, driver);
    await health.pingCheck('storage');
    expect(indicator.check('storage').down).toHaveBeenCalled();
  });
});
