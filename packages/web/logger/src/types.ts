import type { LogLevel } from 'loglayer';

/** 平台类型 */
export type Platform = 'web' | 'react-native' | 'mini-program';

/** 日志级别类型 */
export type LogLevelType = LogLevel;

/** 日志记录 */
export interface LogRecord {
  /** 唯一标识 */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 附加数据 */
  data?: Record<string, any>;
  /** 上下文数据 */
  context?: Record<string, any>;
  /** 错误信息 */
  error?: Record<string, any>;
}

/** 存储适配器接口 */
export interface IStorageAdapter {
  /** 初始化适配器 */
  init: () => Promise<void>;
  /** 写入日志 */
  write: (record: LogRecord) => Promise<void>;
  /** 批量写入日志 */
  writeBatch: (records: LogRecord[]) => Promise<void>;
  /** 读取指定时间范围的日志 */
  read: (startTime?: number, endTime?: number) => Promise<LogRecord[]>;
  /** 删除指定时间之前的日志 */
  deleteBeforeTime: (time: number) => Promise<number>;
  /** 获取日志总数 */
  count: () => Promise<number>;
  /** 清空所有日志 */
  clear: () => Promise<void>;
}

/**
 * 请求头配置：静态对象或动态函数。
 *
 * 白名单检查与日志上传共用。传函数时每次发请求都会调用一次，
 * 便于注入会轮换的鉴权 token（如 `() => ({ Authorization: `Bearer ${getToken()}` })`）。
 */
export type RequestHeaders = Record<string, string> | (() => Record<string, string>);

/** 日志配置 */
export interface LoggerConfig {
  /** 平台类型，不指定时自动检测 */
  platform?: Platform;
  /** 是否为开发模式，不指定时从环境变量读取 */
  isDev?: boolean;
  /** 日志保留天数，默认 7 天 */
  retentionDays?: number;
  /** 白名单检查端点 */
  whitelistEndpoint?: string;
  /** 日志上传端点 */
  uploadEndpoint?: string;
  /** 白名单检查间隔（毫秒），默认 5 分钟 */
  whitelistCheckInterval?: number;
  /** 批量上传大小，默认 100 条 */
  uploadBatchSize?: number;
  /** 自定义存储适配器 */
  storageAdapter?: IStorageAdapter;
  /** 日志刷新间隔（毫秒），默认 5000 */
  flushInterval?: number;
  /** 是否在开发模式下也启用存储，默认 false */
  enableStorageInDev?: boolean;
  /** 白名单/上传请求的附加请求头（如鉴权 token），两者共用 */
  headers?: RequestHeaders;
}

/** 白名单请求 */
export interface WhitelistRequest {
  /** 设备 ID */
  deviceId: string;
}

/** 白名单响应 */
export interface WhitelistResponse {
  /** 是否启用日志收集 */
  enabled: boolean;
  /** 白名单设备 ID 列表 */
  deviceIds: string[];
}

/** 日志上传请求 */
export interface LogUploadRequest {
  /** 设备 ID */
  deviceId: string;
  /** 日志记录列表 */
  logs: LogRecord[];
  /** 当前批次索引 */
  batchIndex: number;
  /** 总批次数 */
  totalBatches: number;
}

/** 日志上传响应 */
export interface LogUploadResponse {
  /** 是否成功 */
  success: boolean;
  /** 接收的日志数量 */
  receivedCount: number;
  /** 消息 */
  message?: string;
}

/** 上传结果 */
export interface UploadResult {
  /** 是否成功 */
  success: boolean;
  /** 已上传数量 */
  uploadedCount: number;
}

/** 日志实例返回类型 */
export interface LoggerInstance {
  /** LogLayer 日志实例 */
  logger: import('loglayer').LogLayer;
  /** 存储适配器 */
  adapter: IStorageAdapter;
  /** 白名单管理器 */
  whitelistManager?: import('./managers/whitelist-manager').WhitelistManager;
  /** 上传管理器 */
  uploadManager?: import('./managers/upload-manager').UploadManager;
  /** 清理管理器 */
  cleanupManager?: import('./managers/cleanup-manager').CleanupManager;
  /** 手动触发上传 */
  uploadLogs: () => Promise<UploadResult | undefined>;
  /** 手动触发清理 */
  cleanupLogs: () => Promise<number | undefined>;
  /** 销毁实例 */
  dispose: () => void;
}
