export interface ServerConfig {
  /** HTTP 监听端口 */
  port?: number;
  /** 全局 API 前缀，例如 `api` */
  apiPrefix?: string;
  /** 请求超时时间，单位秒 */
  timeout?: number;
}

export interface SwaggerConfig {
  /** 是否启用 Swagger */
  enabled?: boolean;
  /** Swagger UI 路径，不含前导斜杠 */
  path?: string;
  /** 文档标题 */
  title?: string;
  /** 文档描述 */
  description?: string;
  /** 文档版本号 */
  version?: string;
}

export interface JwtConfig {
  /** 签名和校验 JWT 的密钥 */
  secret?: string;
  /** access token 过期时间，单位秒 */
  accessExpiresIn?: number;
  /** refresh token 过期时间，单位秒 */
  refreshExpiresIn?: number;
}

export interface DatabaseConfig {
  /** MySQL 连接串，形如 mysql://USER:PASSWORD@HOST:PORT/DATABASE */
  url?: string;
  /**
   * 单进程连接池上限。
   *
   * 注意：api 与 admin-api 各自持有一个连接池，两者上限之和需明显小于 MySQL max_connections。
   */
  connectionLimit?: number;
}

export interface SnowflakeConfig {
  /** 工作节点 ID，范围 0-31 */
  workerId: number;
  /** 数据中心 ID，范围 0-31 */
  datacenterId: number;
}

export interface LoggerConfig {
  /** 日志级别：trace < debug < info < warn < error < fatal */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  /** 是否包含请求上下文信息（requestId, userId 等） */
  includeContext?: boolean;
  /**
   * 慢请求阈值（毫秒）：响应耗时超过此值的请求，访问日志消息追加 `[SLOW]` 标记。
   * 注意：**只作标记，不改变日志级别**——级别仍由状态码 / 中断决定 。
   * 注意：**流式响应（SSE / `Content-Type: text/event-stream`）不参与判定**——其耗时是连接
   * 生命周期时长而非服务端处理耗时，参与判定会持续产出 `[SLOW]` 噪音
   * 慢请求告警请在采集侧按 `[SLOW]` / `responseTime` 字段配置，不要复用 warn 级别。
   */
  slowRequestThreshold?: number;
  /**
   * 慢查询阈值（毫秒）：单条数据库查询耗时达到此值时，PrismaService 打印 `[SLOW_QUERY]` 日志。
   * 注意：与 `slowRequestThreshold` 独立配置——一条 SQL 的耗时口径与整个 HTTP 请求不同，
   * 复用同一阈值会互相干扰。
   */
  slowQueryThreshold?: number;
  /** 日志输出目标：console = 控制台，file = 文件 */
  output?: 'console' | 'file';
  /** 日志文件目录（仅在 file 模式下生效） */
  logDir?: string;
  /** 单个日志文件最大大小（MB），超过后自动轮转 */
  maxFileSize?: number;
  /** 保留的轮转文件数量（0 = 不限制） */
  maxFiles?: number;
}

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  defaultTtl?: number;
  keyPrefix?: string;
}

/**
 * 全局限流配置（`@nestjs/throttler`）。
 *
 * 存储介质：Redis（`ThrottlerConfigModule` 注入 `RedisThrottlerStorage`），
 * 多实例部署下计数跨实例共享；Redis 不可用时降级为「不限流」（fail open，
 * 账号维度锁定仍由 Redis 主防线兜住）。
 */
export interface ThrottlerConfig {
  /** 计数窗口时长（毫秒） */
  ttl?: number;
  /** 单窗口内最大请求数 */
  limit?: number;
  /** 超限后的阻塞时长（毫秒），0 表示不额外阻塞 */
  blockDuration?: number;
  /** 触发限流时的错误提示文案 */
  errorMessage?: string;
}

/** S3 兼容存储后端配置。凭据只走 env，不入库、不进日志（ADR-012 D2）。 */
export interface StorageS3Config {
  /** S3 兼容端点；AWS 官方可留空走默认区域端点，MinIO / COS / OSS 必须显式配置 */
  endpoint?: string;
  /** 存储区域（S3 客户端必填） */
  region?: string;
  /** 桶名 */
  bucket?: string;
  /** 访问密钥 ID（留空则走 SDK 默认凭证链） */
  accessKeyId?: string;
  /** 访问密钥密文（留空则走 SDK 默认凭证链） */
  secretAccessKey?: string;
  /** MinIO 等自建端点须为 true，AWS S3 为 false */
  forcePathStyle?: boolean;
}

/**
 * 文件存储配置。
 *
 * 驱动由 `STORAGE_DRIVER` 在启动期选定为**单一活动驱动**（local | s3，ADR-012 D1）；
 * 切换存储 = 改环境变量 + 重启，业务代码只依赖 `StorageDriver` 接口。
 */
export interface StorageConfig {
  /** 活动驱动：local（本地磁盘，默认）/ s3（S3 兼容对象存储） */
  driver?: 'local' | 's3';
  /** 本地驱动落盘根目录 */
  localRoot?: string;
  /** S3 驱动参数（driver=s3 时生效） */
  s3?: StorageS3Config;
  /** 预签名直连 URL 有效期（秒），默认 300（ADR-012 D8） */
  signedUrlTtl?: number;
}

/**
 * 上传面约束（服务端强制，全部 env 可调，前端校验仅作体验层——ADR-012 D3/D4）。
 */
export interface UploadConfig {
  /** 图片类单文件上限（字节） */
  maxBytes?: number;
  /** 其它白名单类型单文件上限（字节） */
  maxBytesOther?: number;
  /** 图片 MIME 白名单 */
  allowedImageTypes?: string[];
  /** 非图片 MIME 白名单 */
  allowedFileTypes?: string[];
  /** 封面归一化最大宽度（不放大小图） */
  coverMaxWidth?: number;
  /** 封面归一化输出格式 */
  coverFormat?: 'webp' | 'jpeg' | 'png';
  /** 封面输出质量（1-100），仅 `webp` / `jpeg` 生效；`png` 走无损压缩，此项被忽略 */
  coverQuality?: number;
  /**
   * 图片像素边长硬上限（宽或高任一超过即拒绝上传）。
   *
   * 与 `coverMaxWidth` 不同：后者是「归一化目标宽度」，这里是「解码前的绝对上限」。
   * `maxBytes` 只约束压缩体积——一张 5 MiB 的 PNG 可解出 20000×20000（RGBA 约 1.5 GB），
   * 不设像素上限等于把原图解码变成内存耗尽入口（ADR-012 D4）。
   */
  imageMaxDimension?: number;
}

/** SMTP 邮件配置（P3b，ADR-013 D10：凭据走 env，不入库） */
export interface SmtpConfig {
  /** SMTP 服务器地址 */
  host?: string;
  /** SMTP 端口（默认 465 SSL / 587 STARTTLS） */
  port?: number;
  /** 是否 SSL（465 端口为 true，587 为 false） */
  secure?: boolean;
  /** 认证用户名 */
  user?: string;
  /** 认证密码 */
  pass?: string;
  /** 发件人地址（如 noreply@example.com） */
  from?: string;
}

/**
 * MFA 配置（P3b，ADR-013 D8）。
 *
 * TOTP secret 入库前经 AES-256-GCM 加密；密钥只走 env，不入库、不进日志。
 * 策略开关（DISABLED / OPTIONAL / REQUIRED）走 SysConfig 键 `security.mfa.mode`，
 * 多租户遮蔽语义复用 ADR-009。
 */
export interface MfaConfig {
  /**
   * AES-256-GCM 主密钥，hex 编码 64 字符（32 字节）。
   * 未配置时 MFA 模块启动降级（记录 warn，绑定/解绑接口抛 503）。
   */
  secretEncKey?: string;
}

export interface AppConfig {
  /** HTTP 服务配置 */
  server?: ServerConfig;
  /** Swagger 文档配置 */
  swagger?: SwaggerConfig;
  /** JWT 鉴权配置 */
  jwt?: JwtConfig;
  /** 数据库（MySQL）配置 */
  database?: DatabaseConfig;
  /** 雪花 ID 配置 */
  snowflake?: SnowflakeConfig;
  /** 日志配置 */
  logger?: LoggerConfig;
  /** Redis 配置 */
  redis?: RedisConfig;
  /** 全局限流配置 */
  throttler?: ThrottlerConfig;
  /** 文件存储配置 */
  storage?: StorageConfig;
  /** 上传面约束配置 */
  upload?: UploadConfig;
  /** SMTP 邮件配置（P3b，ADR-013 D10：凭据走 env，不入库） */
  smtp?: SmtpConfig;
  /** MFA 配置（P3b，ADR-013 D8） */
  mfa?: MfaConfig;
}

export type AppConfigForced = {
  [K in keyof AppConfig]-?: Required<NonNullable<AppConfig[K]>>;
};
