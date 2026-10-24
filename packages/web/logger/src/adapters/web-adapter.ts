import type { IDBPDatabase } from 'idb';
import type { LogRecord } from '../types';
import { openDB } from 'idb';
import { IDB_DATABASE_NAME, IDB_STORE_NAME, IDB_VERSION } from '../constants';
import { BaseStorageAdapter } from './base-adapter';

interface LogDBSchema {
  [IDB_STORE_NAME]: {
    key: string;
    value: LogRecord;
    indexes: {
      timestamp: number;
    };
  };
}

/** Web 存储适配器 使用 IndexedDB 存储日志 */
export class WebStorageAdapter extends BaseStorageAdapter {
  /** 数据库实例 */
  private db: IDBPDatabase<LogDBSchema> | null = null;

  /** 初始化适配器 */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.db = await openDB<LogDBSchema>(IDB_DATABASE_NAME, IDB_VERSION, {
      upgrade(db) {
        // 创建日志存储
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          const store = db.createObjectStore(IDB_STORE_NAME, {
            keyPath: 'id',
          });
          // 创建时间戳索引用于范围查询
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      },
    });

    this.initialized = true;
  }

  /** 写入日志 */
  async write(record: LogRecord): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.put(IDB_STORE_NAME, record);
  }

  /** 批量写入日志 */
  async writeBatch(records: LogRecord[]): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tx = this.db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);

    await Promise.all([...records.map(record => store.put(record)), tx.done]);
  }

  /** 读取指定时间范围的日志 */
  async read(startTime?: number, endTime?: number): Promise<LogRecord[]> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tx = this.db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const index = store.index('timestamp');

    let range: IDBKeyRange | null = null;
    if (startTime !== undefined && endTime !== undefined) {
      range = IDBKeyRange.bound(startTime, endTime);
    }
    else if (startTime !== undefined) {
      range = IDBKeyRange.lowerBound(startTime);
    }
    else if (endTime !== undefined) {
      range = IDBKeyRange.upperBound(endTime);
    }

    const records = range ? await index.getAll(range) : await store.getAll();
    return records;
  }

  /** 删除指定时间之前的日志 */
  async deleteBeforeTime(time: number): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tx = this.db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const index = store.index('timestamp');

    const range = IDBKeyRange.upperBound(time, true);
    const keys: string[] = [];

    let cursor = await index.openKeyCursor(range);
    while (cursor) {
      keys.push(cursor.primaryKey.toString());
      cursor = await cursor.continue();
    }

    await Promise.all(keys.map(key => store.delete(key)));
    await tx.done;

    return keys.length;
  }

  /** 获取日志总数 */
  async count(): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return await this.db.count(IDB_STORE_NAME);
  }

  /** 清空所有日志 */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    await this.db.clear(IDB_STORE_NAME);
  }
}
