import { registerAs } from '@nestjs/config';
import {
  AppConfig,
} from './configuration.interface.js';

/** 读取布尔型 env。经 Joi 校验回写后 env 值恒为字符串，统一按 'false' / '0' 判否。 */
function toBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined)
    return fallback;
  const value = String(raw).toLowerCase();
  return value !== 'false' && value !== '0';
}

/** 逗号分隔的 env 列表转数组；空或未配置时用兜底默认。 */
function toList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw)
    return fallback;
  const items = raw.split(',').map(item => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

export const defaultConfig = registerAs('default', (): AppConfig => ({
  server: {
    port: process.env.PORT || 3001,
    apiPrefix: 'api',
    // 服务超时时间，单位：秒
    timeout: 10,
  },
  swagger: {
    enabled: process.env.SWAGGER_OPEN || true,
    path: 'swagger',
    title: 'NestJS API',
    description: 'The NestJS API description',
    version: '1.0',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '123456',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || 7200, // 2 小时（ADR-007 D1）
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || 604800, // 7 天
  },
  database: {
    // 既被运行时读取，也是 Prisma CLI（migrate/generate）执行迁移所必需的变量
    url: process.env.DATABASE_URL,
    // 经 Joi 校验回写后 process.env 中的数值会变成字符串，此处强制转 number
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  },
  snowflake: {
    workerId: process.env.WORKER_ID || 0,
    datacenterId: process.env.DATACENTER_ID || 0,
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    output: process.env.LOG_OUTPUT || 'console',
    slowRequestThreshold: process.env.LOG_SLOW_REQUEST_THRESHOLD || 500,
    // 与 slowRequestThreshold 分开：单条 SQL 的耗时口径不同于整个 HTTP 请求。
    // 经 Joi 校验回写后 process.env 中的数值会变成字符串，此处强制转 number。
    slowQueryThreshold: Number(process.env.LOG_SLOW_QUERY_THRESHOLD) || 500,
    logDir: process.env.LOG_DIR || 'logs',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || 10,
    maxFiles: process.env.LOG_MAX_FILES || 7,
  },
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB) || 0,
    // 缓存默认 TTL，单位：秒（0 表示不过期）
    defaultTtl: Number(process.env.REDIS_DEFAULT_TTL) || 300,
    // 多 app 共享 Redis 实例时前缀是唯一隔离手段（ADR-003），默认与 app 同名
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'admin-api',
  },
  throttler: {
    // 计数窗口（毫秒）。120 次/分钟/IP 为粗粒度防洪泛基线；
    // 认证端点在控制器上用 @Throttle 覆盖为更严策略（见 common/constants/auth.ts）。
    ttl: Number(process.env.THROTTLE_TTL) || 60_000,
    limit: Number(process.env.THROTTLE_LIMIT) || 120,
    // 超限后额外阻塞时长（毫秒），设为与窗口等长即「本窗口内直接拉黑」
    blockDuration: Number(process.env.THROTTLE_BLOCK_DURATION) || 60_000,
    errorMessage: '请求过于频繁，请稍后再试',
  },
  storage: {
    // 单一活动驱动（ADR-012 D1）：切换存储只改这一个变量
    driver: process.env.STORAGE_DRIVER || 'local',
    localRoot: process.env.STORAGE_LOCAL_ROOT || 'storage',
    signedUrlTtl: Number(process.env.STORAGE_SIGNED_URL_TTL) || 300,
    s3: {
      endpoint: process.env.STORAGE_S3_ENDPOINT,
      region: process.env.STORAGE_S3_REGION,
      bucket: process.env.STORAGE_S3_BUCKET,
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY,
      // MinIO 等自建端点需 path-style；AWS S3 为 false
      forcePathStyle: toBool(process.env.STORAGE_S3_FORCE_PATH_STYLE, true),
    },
  },
  upload: {
    // 分类上限（ADR-012 D3）：图片 5 MiB / 其它白名单类型 20 MiB
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES) || 5_242_880,
    maxBytesOther: Number(process.env.UPLOAD_MAX_BYTES_OTHER) || 20_971_520,
    allowedImageTypes: toList(process.env.UPLOAD_ALLOWED_IMAGE_TYPES, [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]),
    allowedFileTypes: toList(process.env.UPLOAD_ALLOWED_FILE_TYPES, [
      'application/pdf',
      'application/zip',
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
    coverMaxWidth: Number(process.env.UPLOAD_COVER_MAX_WIDTH) || 1600,
    coverFormat: process.env.UPLOAD_COVER_FORMAT || 'webp',
    // webp / jpeg 的质量/体积甜点（ADR-012 D4）；png 走无损压缩，此值被忽略
    coverQuality: Number(process.env.UPLOAD_COVER_QUALITY) || 82,
    // 像素边长硬上限：解码前拒绝超大图，防「压缩体积合规但解码后内存爆炸」（ADR-012 D4）
    imageMaxDimension: Number(process.env.UPLOAD_IMAGE_MAX_DIMENSION) || 10_000,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: toBool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  mfa: {
    // AES-256-GCM 主密钥（hex，64 字符）；未配置时 MFA 模块降级
    secretEncKey: process.env.MFA_SECRET_ENC_KEY,
  },
}));
