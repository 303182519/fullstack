import type { IStorageAdapter, LogRecord } from '../types';

/** 存储适配器基类 提供通用的接口定义和默认实现 */
export abstract class BaseStorageAdapter implements IStorageAdapter {
  /** 是否已初始化 */
  protected initialized = false;

  /** 初始化适配器 */
  abstract init(): Promise<void>;

  /** 写入日志 */
  abstract write(record: LogRecord): Promise<void>;

  /** 批量写入日志 */
  abstract writeBatch(records: LogRecord[]): Promise<void>;

  /** 读取指定时间范围的日志 */
  abstract read(startTime?: number, endTime?: number): Promise<LogRecord[]>;

  /** 删除指定时间之前的日志 */
  abstract deleteBeforeTime(time: number): Promise<number>;

  /** 获取日志总数 */
  abstract count(): Promise<number>;

  /** 清空所有日志 */
  abstract clear(): Promise<void>;

  /** 确保已初始化 */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}
