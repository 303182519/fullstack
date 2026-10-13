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






export interface AppConfig {
  server?: ServerConfig;
  swagger?: SwaggerConfig;
  jwt?: JwtConfig;
  snowflake?: SnowflakeConfig;
}

export type AppConfigForced = {
  [K in keyof AppConfig]-?: Required<NonNullable<AppConfig[K]>>;
};
