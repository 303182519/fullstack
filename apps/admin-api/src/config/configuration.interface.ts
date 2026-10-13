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
  includeContext: boolean;
  /**
   * 慢请求阈值（毫秒）：响应耗时超过此值的请求，访问日志消息追加 `[SLOW]` 标记。
   * 注意：**只作标记，不改变日志级别**——级别仍由状态码 / 中断决定（见 ADR-002）。
   * 注意：**流式响应（SSE / `Content-Type: text/event-stream`）不参与判定**——其耗时是连接
   * 生命周期时长而非服务端处理耗时，参与判定会持续产出 `[SLOW]` 噪音
   * （见 ADR-002 决策第 12 条）。
   * 慢请求告警请在采集侧按 `[SLOW]` / `responseTime` 字段配置，不要复用 warn 级别。
   */
  slowRequestThreshold: number;
  /** 日志输出目标：console = 控制台，file = 文件 */
  output?: 'console' | 'file';
  /** 日志文件目录（仅在 file 模式下生效） */
  logDir?: string;
  /** 单个日志文件最大大小（MB），超过后自动轮转 */
  maxFileSize?: number;
  /** 保留的轮转文件数量（0 = 不限制） */
  maxFiles?: number;
}



export interface AppConfig {
  server?: ServerConfig;
  swagger?: SwaggerConfig;
  jwt?: JwtConfig;
  snowflake?: SnowflakeConfig;
  logger?: LoggerConfig;
}

export type AppConfigForced = {
  [K in keyof AppConfig]-?: Required<NonNullable<AppConfig[K]>>;
};
