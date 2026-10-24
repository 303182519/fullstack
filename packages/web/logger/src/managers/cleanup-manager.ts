import type { IStorageAdapter } from '../types';
import { DAY_IN_MS, DEFAULT_RETENTION_DAYS } from '../constants';

interface CleanupManagerConfig {
  /** 存储适配器 */
  adapter: IStorageAdapter;
  /** 日志保留天数 */
  retentionDays?: number;
  /** 清理间隔（毫秒），默认每天一次 */
  cleanupInterval?: number;
}

/** 日志清理管理器 定期清理过期日志 */
export class CleanupManager {
  /** 存储适配器 */
  private adapter: IStorageAdapter;

  /** 日志保留天数 */
  private retentionDays: number;

  /** 清理间隔 */
  private cleanupInterval: number;

  /** 清理计时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** 是否正在清理 */
  private isCleaning = false;

  constructor(config: CleanupManagerConfig) {
    this.adapter = config.adapter;
    this.retentionDays = config.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.cleanupInterval = config.cleanupInterval ?? DAY_IN_MS;
  }

  /** 启动定期清理 */
  start(): void {
    if (this.cleanupTimer) {
      return;
    }

    // 立即执行一次清理
    void this.cleanup();

    // 启动定期清理
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.cleanupInterval);
  }

  /** 停止定期清理 */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** 手动触发清理 */
  async cleanup(): Promise<number> {
    if (this.isCleaning) {
      return 0;
    }

    this.isCleaning = true;

    try {
      const cutoffTime = Date.now() - this.retentionDays * DAY_IN_MS;
      const deletedCount = await this.adapter.deleteBeforeTime(cutoffTime);

      if (deletedCount > 0) {
        console.warn(`[CleanupManager] Deleted ${deletedCount} old logs`);
      }

      return deletedCount;
    }
    catch (error) {
      console.error('[CleanupManager] Failed to cleanup logs:', error);
      return 0;
    }
    finally {
      this.isCleaning = false;
    }
  }

  /** 销毁管理器 */
  dispose(): void {
    this.stop();
  }
}
