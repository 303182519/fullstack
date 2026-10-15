import { registerAs } from '@nestjs/config';
import {
  AppConfig,
} from './configuration.interface.js';

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
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || 900, // 15 分钟
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
}));
