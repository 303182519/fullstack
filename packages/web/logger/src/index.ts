// 适配器导出
export type { MPStorageAdapterConfig } from './adapters';
export { BaseStorageAdapter, MPStorageAdapter, RNStorageAdapter, WebStorageAdapter } from './adapters';

// 常量导出
export {
  BUFFER_MAX_MULTIPLIER,
  DAY_IN_MS,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_FLUSH_INTERVAL,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_UPLOAD_BATCH_SIZE,
  DEFAULT_WHITELIST_CHECK_INTERVAL,
  DEVICE_ID_STORAGE_KEY,
  IDB_DATABASE_NAME,
  IDB_STORE_NAME,
  IDB_VERSION,
  MP_LOG_DIRECTORY,
  MP_LOG_FILE_EXTENSION,
  RN_LOG_INDEX_KEY,
  RN_LOG_KEY_PREFIX,
  UPLOAD_TIMESTAMP_STORAGE_KEY,
} from './constants';

// 主入口
export { createConsoleLogger, createLogger } from './logger';

// 管理器导出
export { CleanupManager, UploadManager, WhitelistManager } from './managers';

// 传输器导出
export { StorageTransport } from './transports';

// 类型导出
export type {
  IStorageAdapter,
  LoggerConfig,
  LoggerInstance,
  LogRecord,
  LogUploadRequest,
  LogUploadResponse,
  Platform,
  RequestHeaders,
  UploadResult,
  WhitelistRequest,
  WhitelistResponse,
} from './types';

// 工具函数导出
export type { MPFileSystemLike, MPRuntime, MPStorageLike, MPVendor } from './utils';
export { detectMPRuntime, getOrCreateDeviceId, getPersistedValue, setPersistedValue } from './utils';

// 重导出 LogLayer 相关类型
export type { LogLevel } from 'loglayer';
export { LogLayer } from 'loglayer';
