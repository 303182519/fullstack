import type { AsyncStorage } from '@react-native-async-storage/async-storage';
import type { LogRecord } from '../types';
import { RN_LOG_INDEX_KEY, RN_LOG_KEY_PREFIX } from '../constants';
import { BaseStorageAdapter } from './base-adapter';

/** 日志索引结构 */
interface LogIndex {
  /** 日志 ID 列表（按时间排序） */
  ids: string[];
  /** ID 到时间戳的映射 */
  timestamps: Record<string, number>;
}

/**
 * React Native 存储适配器 使用 AsyncStorage 存储日志
 *
 * 注意：面向 async-storage v3 API（getMany/setMany/removeMany 对象形态），
 * 与 v2 的 multiGet/multiSet/multiRemove 元组形态不兼容。
 */
export class RNStorageAdapter extends BaseStorageAdapter {
  /** AsyncStorage 模块（动态导入，Web 端不会加载） */
  private asyncStorage: AsyncStorage | null = null;

  /** 日志索引 */
  private logIndex: LogIndex = { ids: [], timestamps: {} };

  /** 已初始化的 AsyncStorage 实例 */
  private get storage(): AsyncStorage {
    if (!this.asyncStorage) {
      throw new Error('RN storage adapter not initialized');
    }
    return this.asyncStorage;
  }

  /** 初始化适配器 */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 动态导入 AsyncStorage
      const module = await import('@react-native-async-storage/async-storage');
      this.asyncStorage = module.default;

      // 加载日志索引
      const indexStr = await this.storage.getItem(RN_LOG_INDEX_KEY);
      if (indexStr) {
        this.logIndex = JSON.parse(indexStr);
      }

      this.initialized = true;
    }
    catch (error) {
      throw new Error(`Failed to initialize RN storage adapter: ${(error as Error).message}`);
    }
  }

  /** 保存日志索引 */
  private async saveIndex(): Promise<void> {
    await this.storage.setItem(RN_LOG_INDEX_KEY, JSON.stringify(this.logIndex));
  }

  /** 写入日志 */
  async write(record: LogRecord): Promise<void> {
    await this.ensureInitialized();

    const key = `${RN_LOG_KEY_PREFIX}${record.id}`;
    await this.storage.setItem(key, JSON.stringify(record));

    // 更新索引
    this.logIndex.ids.push(record.id);
    this.logIndex.timestamps[record.id] = record.timestamp;
    await this.saveIndex();
  }

  /** 批量写入日志 */
  async writeBatch(records: LogRecord[]): Promise<void> {
    await this.ensureInitialized();

    const entries: Record<string, string> = {};
    for (const record of records) {
      entries[`${RN_LOG_KEY_PREFIX}${record.id}`] = JSON.stringify(record);
    }

    await this.storage.setMany(entries);

    // 更新索引
    for (const record of records) {
      this.logIndex.ids.push(record.id);
      this.logIndex.timestamps[record.id] = record.timestamp;
    }
    await this.saveIndex();
  }

  /** 读取指定时间范围的日志 */
  async read(startTime?: number, endTime?: number): Promise<LogRecord[]> {
    await this.ensureInitialized();

    // 过滤符合时间范围的 ID
    const filteredIds = this.logIndex.ids.filter((id) => {
      const timestamp = this.logIndex.timestamps[id];
      if (timestamp === undefined)
        return false;
      if (startTime !== undefined && timestamp < startTime)
        return false;
      if (endTime !== undefined && timestamp > endTime)
        return false;
      return true;
    });

    if (filteredIds.length === 0) {
      return [];
    }

    const keys = filteredIds.map(id => `${RN_LOG_KEY_PREFIX}${id}`);
    const result = await this.storage.getMany(keys);

    const records: LogRecord[] = [];
    for (const value of Object.values(result)) {
      if (value) {
        records.push(JSON.parse(value));
      }
    }

    // 按时间戳排序
    records.sort((a, b) => a.timestamp - b.timestamp);
    return records;
  }

  /** 删除指定时间之前的日志 */
  async deleteBeforeTime(time: number): Promise<number> {
    await this.ensureInitialized();

    const idsToDelete = this.logIndex.ids.filter((id) => {
      const timestamp = this.logIndex.timestamps[id];
      return timestamp !== undefined && timestamp < time;
    });

    if (idsToDelete.length === 0) {
      return 0;
    }

    const keysToDelete = idsToDelete.map(id => `${RN_LOG_KEY_PREFIX}${id}`);
    await this.storage.removeMany(keysToDelete);

    // 更新索引
    this.logIndex.ids = this.logIndex.ids.filter(id => !idsToDelete.includes(id));
    for (const id of idsToDelete) {
      delete this.logIndex.timestamps[id];
    }
    await this.saveIndex();

    return idsToDelete.length;
  }

  /** 获取日志总数 */
  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.logIndex.ids.length;
  }

  /** 清空所有日志 */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    const keys = this.logIndex.ids.map(id => `${RN_LOG_KEY_PREFIX}${id}`);
    if (keys.length > 0) {
      await this.storage.removeMany(keys);
    }

    this.logIndex = { ids: [], timestamps: {} };
    await this.saveIndex();
  }
}
