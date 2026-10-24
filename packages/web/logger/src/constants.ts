/** 一天的毫秒数 */
export const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** 默认日志保留天数 */
export const DEFAULT_RETENTION_DAYS = 7;

/** 默认白名单检查间隔（5 分钟） */
export const DEFAULT_WHITELIST_CHECK_INTERVAL = 5 * 60 * 1000;

/** 默认批量上传大小 */
export const DEFAULT_UPLOAD_BATCH_SIZE = 100;

/** 默认日志刷新间隔（5 秒） */
export const DEFAULT_FLUSH_INTERVAL = 5000;

/** 默认缓冲区大小 */
export const DEFAULT_BUFFER_SIZE = 100;

/** 缓冲区硬上限倍数：maxBufferSize = bufferSize × BUFFER_MAX_MULTIPLIER，超限丢弃最旧日志 */
export const BUFFER_MAX_MULTIPLIER = 10;

/** IndexedDB 数据库名称 */
export const IDB_DATABASE_NAME = 'fedstack_logs';

/** IndexedDB 存储名称 */
export const IDB_STORE_NAME = 'logs';

/** IndexedDB 数据库版本 */
export const IDB_VERSION = 1;

/** 设备 ID 存储键 */
export const DEVICE_ID_STORAGE_KEY = 'fedstack_device_id';

/** 上传进度（最后成功上传时间戳）持久化键，仅 Web 端写 localStorage */
export const UPLOAD_TIMESTAMP_STORAGE_KEY = 'fedstack_logger_last_uploaded';

/** React Native AsyncStorage 日志键前缀 */
export const RN_LOG_KEY_PREFIX = 'fedstack_log_';

/** React Native AsyncStorage 日志索引键 */
export const RN_LOG_INDEX_KEY = 'fedstack_log_index';

/** 小程序日志文件目录 */
export const MP_LOG_DIRECTORY = 'fedstack_logs';

/** 小程序日志文件扩展名 */
export const MP_LOG_FILE_EXTENSION = '.jsonl';
