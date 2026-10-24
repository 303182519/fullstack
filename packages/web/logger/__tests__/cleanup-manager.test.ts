/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { CleanupManager, DAY_IN_MS } from '../src/index';
import { createMemoryAdapter, makeRecord } from './memory-adapter';

// ==================== CleanupManager ====================

describe('cleanupManager', () => {
  it('cleanup 应删除超过保留天数的日志并返回删除数', async () => {
    const adapter = createMemoryAdapter();
    const now = Date.now();
    // 10 天前（过期） ×2 + 刚刚（未过期） ×1
    adapter.records.push(
      makeRecord(now - 10 * DAY_IN_MS),
      makeRecord(now - 8 * DAY_IN_MS),
      makeRecord(now),
    );

    const manager = new CleanupManager({ adapter, retentionDays: 7 });
    const deleted = await manager.cleanup();

    expect(deleted).toBe(2);
    expect(adapter.records).toHaveLength(1);
  });

  it('全部日志未过期时应返回 0', async () => {
    const adapter = createMemoryAdapter();
    adapter.records.push(makeRecord(Date.now()));

    const manager = new CleanupManager({ adapter, retentionDays: 7 });
    expect(await manager.cleanup()).toBe(0);
  });

  it('适配器抛错时应返回 0 而不向外抛出', async () => {
    const adapter = createMemoryAdapter();
    adapter.deleteBeforeTime = () => Promise.reject(new Error('db gone'));

    const manager = new CleanupManager({ adapter });
    expect(await manager.cleanup()).toBe(0);
  });

  it('start 后会立即执行一次清理，dispose 后计时器停止', async () => {
    const adapter = createMemoryAdapter();
    adapter.records.push(makeRecord(Date.now() - 30 * DAY_IN_MS));

    const manager = new CleanupManager({ adapter, retentionDays: 7 });
    manager.start();

    // start 内部 void 触发清理，等待其完成
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(adapter.records).toHaveLength(0);

    manager.dispose();
  });
});
