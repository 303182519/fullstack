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
 * 直连 client 的服务由 KeyPrefixer 加，两者同源）。namespace 为各 app 的 REDIS_KEY_PREFIX，
 * admin-api 下形如 `admin-api:auth:session:id=...`（见 ADR-003 / ADR-007 §3.4）。
 *
 * 会话 / 登录安全相关的 key 口径见 ADR-007 D1 / D4：修改命名须同步更新 ADR。
 */
export const CacheKeys = {
  // ---- 会话管理（ADR-007 D1 / D2）：多端登录，每设备一个 sessionId ----
  /** 会话记录：JSON {userId, tenantId, username, isSuper, device, ip, createdAt, expiresAt} */
  AUTH_SESSION: (sessionId: string) => `auth:session:id=${sessionId}`,
  /** 用户在线会话集合：Set [sessionId, ...]，用于「强制下线全部设备」与在线会话列表 */
  AUTH_USER_SESSIONS: (userId: string) => `auth:user:sessions:userId=${userId}`,
  /** 会话当前有效 refresh 令牌摘要（sha256）；旋转刷新时覆盖，登出时删除 */
  AUTH_REFRESH: (sessionId: string) => `auth:refresh:sid=${sessionId}`,

  // ---- 登录安全（ADR-007 D4）：按账号维度计数，Redis 不通时整体降级放行 ----
  /**
   * 登录失败计数器（账号维度）。username 归一化（trim + 小写），
   * 避免大小写差异把同一账号算成多个；IP 维度只记审计、不参与锁定。
   */
  AUTH_LOGIN_FAIL: (tenantId: string, username: string) =>
    `auth:loginFail:tenant=${tenantId}:username=${username.trim().toLowerCase()}`,

  // ---- 图形验证码（ADR-007 D4）：答案一次性使用，验证即删 ----
  /** 验证码答案：value=文本，TTL=CAPTCHA_TTL_SECONDS */
  AUTH_CAPTCHA: (captchaId: string) => `auth:captcha:id=${captchaId}`,

  // ---- MFA 待验令牌（P3b，ADR-013 D8）：jti 一次性消费标记，验证成功才消费 ----
  /** MFA pending jti：value='1' 占位，TTL=MFA_PENDING_TTL_SECONDS；验证通过后 `del` 消费 */
  AUTH_MFA_PENDING: (jti: string) => `auth:mfa:pending:jti=${jti}`,

  // ---- MFA 二步验证失败计数（ADR-013 D8 演进）：挑战维度 + 账号维度双计数 ----
  /** 单次挑战失败计数：按 jti，TTL 随 pending 令牌；达上限后作废该挑战（强制重新登录） */
  AUTH_MFA_CHALLENGE_FAIL: (jti: string) => `auth:mfa:challengeFail:jti=${jti}`,
  /** 账号维度失败计数：跨挑战累计，防反复登录刷 challenge 绕过挑战内计数 */
  AUTH_MFA_ACCOUNT_FAIL: (tenantId: string, username: string) =>
    `auth:mfa:accountFail:tenant=${tenantId}:username=${username.trim().toLowerCase()}`,

  // ---- 字典 / 参数消费端缓存（P2，ADR-009）：cache-aside + 写时失效 ----
  // 粒度说明：只缓存「数据行 / 值」，不缓存「遮蔽判定」——判定是一次索引点查，
  // 缓存它会让平台级写入无法精确失效所有租户副本，得不偿失。
  /** 字典选项（消费端）：value=DictOption[]（仅 ACTIVE，按 sort 升序）；tenantId=null 表示平台级 */
  DICT_OPTIONS: (tenantId: string | null, dictType: string) =>
    `dict:options:tenant=${tenantId ?? 'platform'}:type=${dictType}`,
  /** 参数取值（消费端）：value=string；tenantId=null 表示平台级 */
  CONFIG_VALUE: (tenantId: string | null, configKey: string) =>
    `config:value:tenant=${tenantId ?? 'platform'}:key=${configKey}`,

  // ---- 消息模板消费端缓存（P3b，ADR-013 D4）：cache-aside + 写时失效 ----
  /** 消息模板：value=EffectiveTemplateDto；tenantId=null 表示平台级 */
  MESSAGE_TEMPLATE: (tenantId: string | null, templateKey: string, channel: string) =>
    `msg:template:tenant=${tenantId ?? 'platform'}:key=${templateKey}:channel=${channel}`,
} as const;
