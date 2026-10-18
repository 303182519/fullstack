/** refresh token 的 HttpOnly Cookie 名（对外契约名，与 shared/auth 的 auth.constants 同源） */
export const REFRESH_TOKEN_KEY = 'refreshToken';

/**
 * 认证端点限流策略（**IP 维度**，`@nestjs/throttler` v6 的 `@Throttle({ default: {...} })` 形态）。
 *
 * 与账号维度锁定（LoginAttemptService）正交，两者都不可省：
 * - 限流挡「同一来源 IP 的洪泛」；
 * - 锁定挡「针对同一账号的密码爆破」（攻击者换 IP 池时只有账号维度计数能拦下）。
 *
 * 存储介质：限流计数走 Redis（`RedisThrottlerStorage`），跨实例共享；
 * 账号维度锁定也走 Redis。Redis 不可用时限流降级为「不限流」，账号锁定仍为主防线。
 */
export const AUTH_THROTTLE = {
  login: { ttl: 60_000, limit: 5 },
  refresh: { ttl: 60_000, limit: 10 },
  logout: { ttl: 60_000, limit: 10 },
  captcha: { ttl: 60_000, limit: 20 },
} as const;
