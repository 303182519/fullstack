import Joi from 'joi';

export const validationSchema = Joi.object({
  // Server
  PORT: Joi.number().port().default(3001),

  // Swagger
  SWAGGER_OPEN: Joi.boolean().default(true),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.number().default(7200),
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

  // Throttler（全局限流）
  THROTTLE_TTL: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_BLOCK_DURATION: Joi.number().integer().min(0).default(60_000),

  // 文件存储（ADR-012 D1/D2）：凭据只走 env，不入库、不进日志
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  // 本地驱动落盘根目录
  STORAGE_LOCAL_ROOT: Joi.string().default('storage'),
  // S3 兼容端点：AWS 官方可留空；MinIO / COS / OSS 必须显式配置
  STORAGE_S3_ENDPOINT: Joi.string().uri({ scheme: ['http', 'https'] }),
  STORAGE_S3_REGION: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
  }),
  STORAGE_S3_BUCKET: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
  }),
  // 访问密钥：留空则走 SDK 默认凭证链（环境变量 / IAM 角色）
  STORAGE_S3_ACCESS_KEY_ID: Joi.string().allow(''),
  STORAGE_S3_SECRET_ACCESS_KEY: Joi.string().allow(''),
  // MinIO 等自建端点须为 true，AWS S3 为 false
  STORAGE_S3_FORCE_PATH_STYLE: Joi.boolean()
    .truthy('true', '1')
    .falsy('false', '0')
    .default(true),
  // 预签名直连 URL 有效期（秒）
  STORAGE_SIGNED_URL_TTL: Joi.number().integer().min(1).default(300),

  // 上传面约束（ADR-012 D3/D4）：服务端强制，前端校验仅作体验层
  UPLOAD_MAX_BYTES: Joi.number().integer().min(1).default(5_242_880),
  UPLOAD_MAX_BYTES_OTHER: Joi.number().integer().min(1).default(20_971_520),
  // 逗号分隔的 MIME 白名单
  UPLOAD_ALLOWED_IMAGE_TYPES: Joi.string().default(
    'image/jpeg,image/png,image/gif,image/webp',
  ),
  UPLOAD_ALLOWED_FILE_TYPES: Joi.string().default(
    'application/pdf,application/zip,text/plain,text/csv,application/msword,'
    + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'
    + 'application/vnd.ms-excel,'
    + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),
  // 封面归一化最大宽度（不放大小图）
  UPLOAD_COVER_MAX_WIDTH: Joi.number().integer().min(16).default(1600),
  // 封面归一化输出格式
  UPLOAD_COVER_FORMAT: Joi.string().valid('webp', 'jpeg', 'png').default('webp'),
  // 封面输出质量（1-100）：仅 webp / jpeg 生效，png 走无损压缩
  UPLOAD_COVER_QUALITY: Joi.number().integer().min(1).max(100).default(82),
  // 图片像素边长硬上限（宽或高超过即拒绝）：解码前拦截，防解码期内存放大
  UPLOAD_IMAGE_MAX_DIMENSION: Joi.number().integer().min(16).default(10_000),

  // SMTP 邮件配置（P3b，ADR-013 D10：凭据走 env，不入库）
  SMTP_HOST: Joi.string(),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_SECURE: Joi.boolean().truthy('true', '1').falsy('false', '0').default(true),
  SMTP_USER: Joi.string().allow(''),
  SMTP_PASS: Joi.string().allow(''),
  SMTP_FROM: Joi.string().allow(''),

  // MFA 配置（P3b，ADR-013 D8）：AES-256-GCM 主密钥，hex 编码 64 字符 = 32 字节
  // 生成：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // 未配置时 MFA 模块降级（启动 warn，绑定/解绑接口 503）
  MFA_SECRET_ENC_KEY: Joi.string().hex().length(64),

  // 实时推送（SSE，P3b，ADR-013 D5/D6）：单进程口径，多实例总上限 = 实例数 × maxConnections
  REALTIME_MAX_CONNECTIONS: Joi.number().integer().min(1).default(1000),
  // SSE 心跳间隔（毫秒）：防 nginx / 云 LB 空闲断连（常见空闲超时 60s）
  REALTIME_HEARTBEAT_MS: Joi.number().integer().min(1000).default(30_000),
}).oxor('REDIS_URL', 'REDIS_HOST'); // Redis 连接二选一,也可都不提供
