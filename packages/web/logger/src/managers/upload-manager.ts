import type { IStorageAdapter, LogUploadRequest, LogUploadResponse, RequestHeaders, UploadResult } from '../types';
import { DEFAULT_UPLOAD_BATCH_SIZE, UPLOAD_TIMESTAMP_STORAGE_KEY } from '../constants';

interface UploadManagerConfig {
  /** 设备 ID */
  deviceId: string;
  /** 日志上传端点 */
  endpoint: string;
  /** 存储适配器 */
  adapter: IStorageAdapter;
  /** 批量上传大小 */
  batchSize?: number;
  /** 附加请求头（如鉴权 token），静态对象或动态函数 */
  headers?: RequestHeaders;
}

/** 日志上传管理器 负责批量上传历史日志到远程服务器 */
export class UploadManager {
  /** 设备 ID */
  private deviceId: string;

  /** 上传端点 */
  private endpoint: string;

  /** 存储适配器 */
  private adapter: IStorageAdapter;

  /** 批量上传大小 */
  private batchSize: number;

  /** 附加请求头 */
  private headers?: RequestHeaders;

  /** 是否正在上传 */
  private isUploading = false;

  /**
   * 上一次成功上传的时间戳。
   *
   * 初始化时从 localStorage 恢复（仅 Web 端持久化），进程重启后不会重复上传历史日志；
   * RN/小程序无 localStorage，退化为内存值（每次启动从 0 开始全量上传）。
   */
  private lastUploadedTimestamp = 0;

  constructor(config: UploadManagerConfig) {
    this.deviceId = config.deviceId;
    this.endpoint = config.endpoint;
    this.adapter = config.adapter;
    this.batchSize = config.batchSize ?? DEFAULT_UPLOAD_BATCH_SIZE;
    this.headers = config.headers;
    this.lastUploadedTimestamp = UploadManager.loadPersistedTimestamp();
  }

  /** 读取持久化的上传进度，无 localStorage 环境返回 0 */
  private static loadPersistedTimestamp(): number {
    if (typeof localStorage === 'undefined') {
      return 0;
    }
    const raw = localStorage.getItem(UPLOAD_TIMESTAMP_STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  /** 持久化上传进度（无 localStorage 环境静默跳过） */
  private persistTimestamp(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(UPLOAD_TIMESTAMP_STORAGE_KEY, String(this.lastUploadedTimestamp));
  }

  /** 上传所有历史日志 */
  async uploadAll(): Promise<UploadResult> {
    if (this.isUploading) {
      return { success: false, uploadedCount: 0 };
    }

    this.isUploading = true;
    let totalUploaded = 0;

    try {
      // 获取所有日志
      const allLogs = await this.adapter.read(this.lastUploadedTimestamp);

      if (allLogs.length === 0) {
        return { success: true, uploadedCount: 0 };
      }

      // 计算总批次数
      const totalBatches = Math.ceil(allLogs.length / this.batchSize);

      // 分批上传
      for (let i = 0; i < totalBatches; i++) {
        const start = i * this.batchSize;
        const end = Math.min(start + this.batchSize, allLogs.length);
        const batch = allLogs.slice(start, end);

        const request: LogUploadRequest = {
          deviceId: this.deviceId,
          logs: batch,
          batchIndex: i,
          totalBatches,
        };

        const success = await this.uploadBatch(request);
        if (success) {
          totalUploaded += batch.length;
          // 更新并持久化最后上传的时间戳
          const lastLog = batch[batch.length - 1];
          if (lastLog) {
            this.lastUploadedTimestamp = lastLog.timestamp;
            this.persistTimestamp();
          }
        }
        else {
          // 上传失败，停止后续批次
          return { success: false, uploadedCount: totalUploaded };
        }
      }

      return { success: true, uploadedCount: totalUploaded };
    }
    catch (error) {
      console.error('[UploadManager] Failed to upload logs:', error);
      return { success: false, uploadedCount: totalUploaded };
    }
    finally {
      this.isUploading = false;
    }
  }

  /** 上传单个批次 */
  private async uploadBatch(request: LogUploadRequest): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof this.headers === 'function' ? this.headers() : this.headers),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: LogUploadResponse = await response.json();
      return data.success;
    }
    catch (error) {
      console.error('[UploadManager] Failed to upload batch:', error);
      return false;
    }
  }

  /** 获取上传状态 */
  getStatus(): { isUploading: boolean; lastUploadedTimestamp: number } {
    return {
      isUploading: this.isUploading,
      lastUploadedTimestamp: this.lastUploadedTimestamp,
    };
  }
}
