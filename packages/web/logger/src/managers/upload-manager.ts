import type { IStorageAdapter, LogUploadRequest, LogUploadResponse, Platform, RequestHeaders, UploadResult } from '../types';
import { DEFAULT_UPLOAD_BATCH_SIZE, UPLOAD_TIMESTAMP_STORAGE_KEY } from '../constants';
import { getPersistedValue, setPersistedValue } from '../utils/kv-storage';

interface UploadManagerConfig {
  /** 设备 ID */
  deviceId: string;
  /** 上传端点 */
  endpoint: string;
  /** 存储适配器 */
  adapter: IStorageAdapter;
  /** 平台类型（决定上传进度的持久化方式） */
  platform: Platform;
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

  /** 平台类型 */
  private platform: Platform;

  /** 批量上传大小 */
  private batchSize: number;

  /** 附加请求头 */
  private headers?: RequestHeaders;

  /** 是否正在上传 */
  private isUploading = false;

  /** 上传进度是否已从平台存储恢复 */
  private timestampLoaded = false;

  /**
   * 上一次成功上传的时间戳。
   *
   * 首次上传前从平台 KV 存储懒加载恢复（web → localStorage，RN → AsyncStorage，
   * 小程序 → 五端 storage），进程/冷启动后不会重复上传历史日志；
   * 读取失败退化为 0（从 0 开始全量上传，服务端按日志 id 幂等去重兜底）。
   */
  private lastUploadedTimestamp = 0;

  constructor(config: UploadManagerConfig) {
    this.deviceId = config.deviceId;
    this.endpoint = config.endpoint;
    this.adapter = config.adapter;
    this.platform = config.platform;
    this.batchSize = config.batchSize ?? DEFAULT_UPLOAD_BATCH_SIZE;
    this.headers = config.headers;
  }

  /** 从平台 KV 存储恢复上传进度（幂等，仅首次上传前执行一次） */
  private async ensureTimestampLoaded(): Promise<void> {
    if (this.timestampLoaded) {
      return;
    }
    this.timestampLoaded = true;
    const raw = await getPersistedValue(this.platform, UPLOAD_TIMESTAMP_STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    this.lastUploadedTimestamp = Number.isFinite(value) && value > 0 ? value : 0;
  }

  /** 持久化上传进度到平台 KV 存储（写入失败静默忽略） */
  private async persistTimestamp(): Promise<void> {
    await setPersistedValue(this.platform, UPLOAD_TIMESTAMP_STORAGE_KEY, String(this.lastUploadedTimestamp));
  }

  /** 上传所有历史日志 */
  async uploadAll(): Promise<UploadResult> {
    if (this.isUploading) {
      return { success: false, uploadedCount: 0 };
    }

    this.isUploading = true;
    let totalUploaded = 0;

    try {
      // 首次上传前恢复持久化的上传进度
      await this.ensureTimestampLoaded();

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
            await this.persistTimestamp();
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
