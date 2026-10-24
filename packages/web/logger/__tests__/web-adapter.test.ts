import type { LogLevel } from 'loglayer';
import type { LogRecord } from '../src/index';
import { beforeEach, describe, expect, it } from 'vitest';
import { WebStorageAdapter } from '../src/index';
/** @vitest-environment node */
import 'fake-indexeddb/auto';

// ==================== 辅助工具 ====================

let seq = 0;

function makeRecord(timestamp: number, overrides?: Partial<LogRecord>): LogRecord {
  seq += 1;
  return {
    id: `log-${timestamp}-${seq}`,
    timestamp,
    level: 'info' as LogLevel,
    message: `message at ${timestamp}`,
    ...overrides,
  };
}

// ==================== WebStorageAdapter（fake-indexeddb 真测 IndexedDB 行为） ====================

describe('webStorageAdapter', () => {
  const adapter = new WebStorageAdapter();

  beforeEach(async () => {
    await adapter.init();
    await adapter.clear();
  });

  it('write 后 count 应增加，read 能读回原始记录', async () => {
    const record = makeRecord(1000, { data: { userId: '123' } });
    await adapter.write(record);

    expect(await adapter.count()).toBe(1);

    const records = await adapter.read();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(record);
  });

  it('writeBatch 应一次写入多条记录', async () => {
    await adapter.writeBatch([makeRecord(1000), makeRecord(2000), makeRecord(3000)]);
    expect(await adapter.count()).toBe(3);
  });

  it('read 传入时间范围时应按 timestamp 索引过滤', async () => {
    await adapter.writeBatch([
      makeRecord(1000),
      makeRecord(2000),
      makeRecord(3000),
      makeRecord(4000),
    ]);

    // startTime 闭区间、endTime 闭区间
    const ranged = await adapter.read(2000, 3000);
    expect(ranged.map(r => r.timestamp)).toEqual([2000, 3000]);

    const fromOnly = await adapter.read(3000);
    expect(fromOnly.map(r => r.timestamp)).toEqual([3000, 4000]);
  });

  it('read 的结果应按 timestamp 升序返回', async () => {
    // 乱序写入，验证索引排序而非插入顺序
    await adapter.writeBatch([makeRecord(3000), makeRecord(1000), makeRecord(2000)]);

    const records = await adapter.read();
    expect(records.map(r => r.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it('deleteBeforeTime 应删除严格早于指定时间的日志并返回删除数', async () => {
    await adapter.writeBatch([makeRecord(1000), makeRecord(2000), makeRecord(3000)]);

    const deleted = await adapter.deleteBeforeTime(2000);

    expect(deleted).toBe(1);
    expect((await adapter.read()).map(r => r.timestamp)).toEqual([2000, 3000]);
  });

  it('clear 应清空所有日志', async () => {
    await adapter.writeBatch([makeRecord(1000), makeRecord(2000)]);
    await adapter.clear();
    expect(await adapter.count()).toBe(0);
  });
});
