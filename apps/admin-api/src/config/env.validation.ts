import Joi from 'joi';

export const validationSchema = Joi.object({
  // Server
  PORT: Joi.number().port().default(3001),

  // Swagger
  SWAGGER_OPEN: Joi.boolean().default(true),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.number().default(900),
  JWT_REFRESH_EXPIRES_IN: Joi.number().default(604800),

  // Snowflake ID Generator
  WORKER_ID: Joi.number().integer().min(0).max(31).default(0),
  DATACENTER_ID: Joi.number().integer().min(0).max(31).default(0),

  // Database (MySQL)
  // 连接串格式：mysql://USER:PASSWORD@HOST:PORT/DATABASE
  DATABASE_URL: Joi.string().required(),
  // 单进程连接池上限：两个服务各自持有一个连接池，两者之和需明显小于 MySQL max_connections
  DB_CONNECTION_LIMIT: Joi.number().integer().min(1).default(10),

  // Pino Logger (日志)
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')
    .default('info'),
  LOG_JSON_FORMAT: Joi.boolean().default(true),
  LOG_SLOW_REQUEST_THRESHOLD: Joi.number().integer().min(100).default(500),
  // 慢查询阈值（毫秒）：单条 SQL 耗时达到该值即打印 [SLOW_QUERY] 日志
  LOG_SLOW_QUERY_THRESHOLD: Joi.number().integer().min(1).default(500),
  LOG_OUTPUT: Joi.string().valid('console', 'file').default('console'),
  LOG_DIR: Joi.string().default('logs'),
  LOG_MAX_FILE_SIZE: Joi.number().integer().min(1).default(10),
  LOG_MAX_FILES: Joi.number().integer().min(0).default(7),

  // Redis (可选；未配置时缓存模块降级为内存 store)
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }),
  REDIS_HOST: Joi.string(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow(''),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  REDIS_DEFAULT_TTL: Joi.number().integer().min(0).default(300),
  REDIS_KEY_PREFIX: Joi.string().default('admin-api'),
}).oxor('REDIS_URL', 'REDIS_HOST'); // Redis 连接二选一,也可都不提供
