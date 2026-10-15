import { hashCacheToken } from '@fedstack/redis';

export { hashCacheToken };

/**
 * CacheKeys — 跨模块共享的缓存 Key 工厂（应用层业务 key，非基础设施）。
 *
 * 适用边界：
 *   ✅ 跨模块会被多处引用的 key（auth / 全局配置等）
 *   ✅ 参数少（≤3）、redis-cli 可读性重要的场景
 *
 * 不适用：
 *   ❌ 仅模块内部使用的 key — 放在模块本地 factory 里
 *   ❌ 参数多（≥4）的查询 key — 用 JSON 序列化更简洁，字段不容易漏
 *   ❌ 直连 Redis 但不走 CacheService 的 key — 走 KeyPrefixer.prefix() 手动加 namespace
 *
 * 最终落盘 Key = `${namespace}${separator}${这里的返回值}`（CacheService 走 KeyvRedis 自动加；
 * 直连 client 的服务由 KeyPrefixer 加，两者同源）。
 */
export const CacheKeys = {

  // 登录失败计数器：邮箱归一化（trim + 小写），避免大小写差异算成两个账号
  AUTH_LOGIN_FAIL: (email: string) =>
    `auth:loginFail:email=${email.trim().toLowerCase()}`,

  // OAuth 一次性令牌：state 防 CSRF（TTL 10min），ticket 换 token（TTL 60s）
  AUTH_OAUTH_STATE: (state: string) => `auth:oauthState:state=${state}`,
  AUTH_OAUTH_TICKET: (ticket: string) => `auth:oauthTicket:ticket=${ticket}`,
} as const;
