/**
 * 登录日志的消息枚举（机器可读 token，展示文案由前端映射）。
 *
 * 为什么用 token 而不是中文文案：日志需要按「失败原因」做聚合统计与告警，
 * 自由文本无法稳定 group by；枚举 token 是稳定契约，改文案不破坏查询。
 */
export const LOGIN_MSG = {
  /** 登录成功 */
  SUCCESS: 'SUCCESS',
  /** 用户名或密码错误（不区分两者，避免账号探测） */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 账号已锁定（连续失败触发锁定） */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** 需要图形验证码但未提供 */
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  /** 图形验证码错误 */
  CAPTCHA_INVALID: 'CAPTCHA_INVALID',
  /** 账号已禁用 */
  USER_DISABLED: 'USER_DISABLED',
  /** 租户不可用（不存在 / 禁用 / 过期）；此时 tenantId 记 0 */
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
} as const;

export type LoginMsg = (typeof LOGIN_MSG)[keyof typeof LOGIN_MSG];

/** 租户解析失败时登录日志使用的占位 tenantId（见 schema.prisma SysLoginLog 注释） */
export const LOGIN_LOG_UNKNOWN_TENANT_ID = 0n;
