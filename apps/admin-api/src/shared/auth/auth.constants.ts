/**
 * 认证与安全策略常量（单一真相源）。
 *
 * 策略口径来自 ADR-007（认证与安全策略）；修改阈值必须同步更新 ADR，避免文档与实现漂移。
 */

/** JWT 令牌类型标记：防止 refresh 令牌被当作 access 令牌使用 */
export const TOKEN_TYPE = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

/** refresh token 的 HttpOnly Cookie 名 */
export const REFRESH_COOKIE_NAME = 'admin_refresh_token';
/** Cookie 作用域：全站（配合 HttpOnly + SameSite 限制暴露面） */
export const REFRESH_COOKIE_PATH = '/';

/** 密码策略 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
/** 复杂度：至少一位小写 + 一位大写 + 一位数字 */
export const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
/** 历史密码保留条数：禁止复用最近 N 次密码（ADR-007 D3） */
export const PASSWORD_HISTORY_SIZE = 5;
export const PASSWORD_POLICY_MESSAGE
  = `密码长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且必须同时包含大写字母、小写字母和数字`;

/** 图形验证码 */
/** 验证码答案有效期（秒） */
export const CAPTCHA_TTL_SECONDS = 300;
/** 连续失败达到该次数后，登录接口强制要求验证码（ADR-007 D4） */
export const CAPTCHA_THRESHOLD = 3;
/** 验证码字符个数 */
export const CAPTCHA_LENGTH = 4;

/** 设备标识缺省值（客户端未上报时） */
export const DEFAULT_DEVICE = 'unknown';
