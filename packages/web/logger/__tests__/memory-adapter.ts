import type { LogLevel } from 'loglayer';
import type { IStorageAdapter, LogRecord } from '../src/index';

// ==================== 内存存储适配器 ====================

export interface MemoryAdapter extends IStorageAdapter {
  /** 已写入的记录（测试可直接断言） */
  records: LogRecord[];
  /** 置为 true 后 writeBatch 抛错，用于模拟存储失败 */
  failWrites: boolean;
}

/**
 * 内存版存储适配器：用数组模拟 IStorageAdapter。
 *
 * 语义对齐 WebStorageAdapter：read 的 startTime 为闭区间（>=），
 * deleteBeforeTime 为开区间（< time），read 结果按 timestamp 升序。
 */
export function createMemoryAdapter(): MemoryAdapter {
  const records: LogRecord[] = [];

  return {
    records,
    failWrites: false,
    init() {
      return Promise.resolve();
    },
    write(record) {
      records.push(record);
      return Promise.resolve();
    },
    writeBatch(batch) {
      if (this.failWrites) {
        return Promise.reject(new Error('write failed (test simulated)'));
      }
      records.push(...batch);
      return Promise.resolve();
    },
    read(startTime, endTime) {
      const filtered = records.filter(
        r => (startTime === undefined || r.timestamp >= startTime)
          && (endTime === undefined || r.timestamp <= endTime),
      );
      filtered.sort((a, b) => a.timestamp - b.timestamp);
      return Promise.resolve(filtered);
    },
    deleteBeforeTime(time) {
      const before = records.length;
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i].timestamp < time) {
          records.splice(i, 1);
        }
      }
      return Promise.resolve(before - records.length);
    },
    count() {
      return Promise.resolve(records.length);
    },
    clear() {
      records.length = 0;
      return Promise.resolve();
    },
  };
}

// ==================== 记录工厂 ====================

let seq = 0;

/** 生成一条测试日志记录，timestamp 之外字段可按需覆盖 */
export function makeRecord(timestamp: number, overrides?: Partial<LogRecord>): LogRecord {
  seq += 1;
  return {
    id: `log-${timestamp}-${seq}`,
    timestamp,
    level: 'info' as LogLevel,
    message: `message at ${timestamp}`,
    ...overrides,
  };
}
