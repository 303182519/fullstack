import type { LogLayerTransport } from 'loglayer';
import type { IStorageAdapter, LoggerConfig, LoggerInstance, Platform, UploadResult } from './types';
import { ConsoleTransport, LogLayer } from 'loglayer';
import { RNStorageAdapter, WebStorageAdapter } from './adapters';
import { CleanupManager, UploadManager, WhitelistManager } from './managers';
import { StorageTransport } from './transports';
import { getOrCreateDeviceId } from './utils';

/** 创建平台对应的存储适配器 */
function createStorageAdapter(platform: Platform): IStorageAdapter {
  switch (platform) {
    case 'web':
      return new WebStorageAdapter();
    case 'react-native':
      return new RNStorageAdapter();
    default:
      return new WebStorageAdapter();
  }
}

/**
 * 创建日志实例
 *
 * @param config 配置项
 * @returns 日志实例及辅助方法
 */
export async function createLogger(config: LoggerConfig = {}): Promise<LoggerInstance> {
  const {
    platform = 'web',
    isDev = true,
    retentionDays,
    whitelistEndpoint,
    uploadEndpoint,
    whitelistCheckInterval,
    uploadBatchSize,
    storageAdapter: customAdapter,
    flushInterval,
    enableStorageInDev = false,
    headers,
  } = config;

  // 获取设备 ID
  const deviceId = await getOrCreateDeviceId(platform);

  // 创建存储适配器
  const adapter = customAdapter ?? createStorageAdapter(platform);
  await adapter.init();

  // 确定是否启用存储
  const shouldEnableStorage = !isDev || enableStorageInDev;

  // 创建传输器列表
  const transports: LogLayerTransport[] = [];

  // 开发模式添加控制台传输器
  if (isDev) {
    transports.push(new ConsoleTransport({ id: 'console', logger: console }));
  }

  // 创建存储传输器
  let storageTransport: StorageTransport | undefined;
  if (shouldEnableStorage) {
    storageTransport = new StorageTransport({
      adapter,
      flushInterval,
    });
    transports.push(storageTransport);
  }

  // 创建 LogLayer 实例
  const logger = new LogLayer({
    transport: transports,
    errorFieldInMetadata: true,
  });

  // 创建管理器
  let whitelistManager: WhitelistManager | undefined;
  let uploadManager: UploadManager | undefined;
  let cleanupManager: CleanupManager | undefined;

  // 生产环境启用管理器
  if (!isDev && shouldEnableStorage) {
    // 上传管理器
    if (uploadEndpoint) {
      uploadManager = new UploadManager({
        deviceId,
        endpoint: uploadEndpoint,
        adapter,
        batchSize: uploadBatchSize,
        headers,
      });
    }

    // 白名单管理器
    if (whitelistEndpoint && uploadManager) {
      whitelistManager = new WhitelistManager({
        deviceId,
        endpoint: whitelistEndpoint,
        checkInterval: whitelistCheckInterval,
        headers,
        onWhitelisted: () => {
          // 当设备首次被加入白名单时，上传所有历史日志
          void uploadManager?.uploadAll();
        },
      });
      whitelistManager.start();
    }

    // 清理管理器
    cleanupManager = new CleanupManager({
      adapter,
      retentionDays,
    });
    cleanupManager.start();
  }

  // 手动触发上传
  async function uploadLogs(): Promise<UploadResult | undefined> {
    if (!uploadManager) {
      return undefined;
    }
    // 先刷新缓冲区
    if (storageTransport) {
      await storageTransport.flush();
    }
    return uploadManager.uploadAll();
  }

  // 手动触发清理
  async function cleanupLogs(): Promise<number | undefined> {
    if (!cleanupManager) {
      return undefined;
    }
    return cleanupManager.cleanup();
  }

  // 销毁实例
  function dispose(): void {
    if (storageTransport) {
      void storageTransport.dispose();
    }
    whitelistManager?.dispose();
    cleanupManager?.dispose();
  }

  return {
    logger,
    adapter,
    whitelistManager,
    uploadManager,
    cleanupManager,
    uploadLogs,
    cleanupLogs,
    dispose,
  };
}

/** 创建简单的控制台日志实例（不带存储功能） */
export function createConsoleLogger(): LogLayer {
  return new LogLayer({
    transport: new ConsoleTransport({ id: 'console', logger: console }),
  });
}
