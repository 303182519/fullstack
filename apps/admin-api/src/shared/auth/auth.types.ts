/**
 * 认证领域的类型定义（应用层，非基础设施）。
 *
 * 边界：这里只放「认证模块内部与跨模块共享」的类型，不承载任何持久化模型定义
 * （持久化模型由 @fedstack/database 单点提供，见 ADR-001）。
 */

/**
 * 登录主体（写入请求上下文 CLS 的形状）。
 *
 * **刻意不是 Prisma 的 SysUser 模型**：模型含 password / passwordHistory 等敏感字段，
 * 一旦进入请求上下文就可能被日志序列化器、异常过滤器打印到日志里。这里只保留
 * 鉴权与数据权限所需的身份事实，敏感字段一律不进入上下文。
 *
 * 所有 BigInt 主键（雪花 ID）统一以 string 承载：64 位整数超出 JS number 安全范围，
 * 且 JWT 载荷 / Redis JSON 都不支持 BigInt。
 */
export interface AuthPrincipal {
  /** 用户 ID（字符串形式的雪花 ID） */
  userId: string;
  /** 租户 ID（字符串形式的雪花 ID） */
  tenantId: string;
  /** 用户名 */
  username: string;
  /** 是否平台超级管理员（跨租户） */
  isSuper: boolean;
  /** 当前会话 ID */
  sessionId: string;
}

/**
 * 会话记录（Redis 存储）。
 *
 * 同时承担两个职责：会话有效性判定的权威事实 + 令牌签发所需的身份快照。
 * 会话被删除即代表该设备强制下线（access token 剩余有效期自然到期，refresh 立即失效）。
 */
export interface SessionRecord {
  sessionId: string;
  userId: string;
  tenantId: string;
  username: string;
  isSuper: boolean;
  /** 设备标识（客户端上报，仅用于展示与审计） */
  device: string;
  /** 登录时来源 IP（仅审计，不用于锁定判定） */
  ip: string;
  /** 会话创建时间（ISO 8601） */
  createdAt: string;
  /** 会话到期时间（ISO 8601），每次刷新向后滑动 */
  expiresAt: string;
}

/** 会话摘要（在线会话列表返回；不含令牌等敏感值） */
export interface SessionSummary {
  sessionId: string;
  device: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  /** 是否为「当前请求所在会话」 */
  current: boolean;
}

/** 登录 / 刷新签发的令牌集合 */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期（秒），供前端计算刷新时机 */
  expiresIn: number;
}

/**
 * JWT 载荷。
 *
 * access 令牌额外携带 tenantId / username / isSuper：Redis 运行期故障进入降级只读模式时，
 * 守卫可仅凭令牌重建主体（见 ADR-007 D1 的缓解措施）；这些字段均非机密，可安全置于载荷。
 */
export interface AccessTokenPayload {
  /** 用户 ID（字符串形式的雪花 ID） */
  sub: string;
  /** 会话 ID */
  sid: string;
  /** 租户 ID */
  tid: string;
  /** 用户名 */
  un: string;
  /** 是否超级管理员 */
  sup: boolean;
  /** 令牌类型标记 */
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  /** 一次性编号（UUID），保证同一秒内多次刷新签发的 token 必然不同，旋转才能真正失效旧令牌 */
  jti: string;
  typ: 'refresh';
}

/**
 * MFA 待验令牌载荷（P3b，ADR-013 D8）。
 *
 * 密码校验通过后、MFA 二次验证通过前的中间态凭证；
 * 有效期短（默认 5 分钟）+ jti 一次性消费（Redis 标记，防重放）。
 *
 * 该令牌**仅可调用 `/auth/mfa/verify`**——JwtAuthGuard 的 `typ === 'access'`
 * 校验会拒绝它访问任何业务接口；`/auth/mfa/verify` 为 @Public 端点，
 * 在控制器内显式校验签名、typ 与 jti。
 */
export interface MfaPendingTokenPayload {
  /** 用户 ID（字符串形式的雪花 ID） */
  sub: string;
  /** 租户 ID */
  tid: string;
  /** 用户名（仅用于 MFA 通过后建会话，不展示） */
  un: string;
  /** 是否平台超管（仅用于 MFA 通过后建会话） */
  sup: boolean;
  /** 一次性消费 ID（UUID），Redis 中存在即未消费 */
  jti: string;
  /** 令牌类型标记，恒为 'mfa-pending' */
  typ: 'mfa-pending';
}

/**
 * 登录返回：密码校验通过后的两种可能。
 *
 * - `IssuedTokens`：无需 MFA，直接签发正式令牌；
 * - `MfaPendingResult`：需要 MFA 二次验证，仅签发 pendingToken。
 */
export interface MfaPendingResult {
  mfaRequired: true;
  pendingToken: string;
  /** pendingToken 有效期（秒） */
  expiresIn: number;
}

export type LoginResult = IssuedTokens | MfaPendingResult;
