import type { RedisClientType } from '@fedstack/redis';
import type { SessionRecord, SessionSummary } from './auth.types.js';
import { randomUUID } from 'node:crypto';
import { hashCacheToken, KeyPrefixer, REDIS_CLIENT } from '@fedstack/redis';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { authErrors } from './auth.errors.js';

/** 会话查询结果：ok=有效；missing=不存在/已下线；unavailable=Redis 故障（可降级只读） */
export type SessionLookupStatus = 'ok' | 'missing' | 'unavailable';

export interface SessionLookup {
  status: SessionLookupStatus;
  record?: SessionRecord;
}

/** 创建会话所需输入（身份快照 + 审计信息） */
export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  username: string;
  isSuper: boolean;
  device: string;
  ip: string;
}

/**
 * Redis 会话存储（ADR-007 D1/D2）。
 *
 * 与「可选层」哲学的分界（这是本服务最重要的一条约束）：
 * - 会话**读**（守卫校验）允许降级——Redis 故障时返回 unavailable，守卫只读放行；
 * - 会话**写**（登录建会话 / 刷新旋转）属正确性敏感操作，**不静默降级**：
 *   Redis 缺失或命令失败一律上抛 503，避免出现「登录成功但服务端无会话」的静默不一致。
 *
 * 键结构（落盘前经 KeyPrefixer 加 app 命名空间，见 ADR-003/ADR-007 §3.4）：
 *   session  -> JSON SessionRecord，TTL=refresh 有效期
 *   refresh  -> sha256(refreshToken)，TTL=refresh 有效期（旋转时覆盖）
 *   sessions -> Set<sessionId>，用于强制下线全部设备与在线会话列表
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  /** 会话 TTL（秒）= refresh token 有效期；滑动过期时重置为该值 */
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType | null,
    private readonly prefixer: KeyPrefixer,
    configService: ConfigService,
  ) {
    this.ttlSeconds = getConfig(configService).jwt.refreshExpiresIn;
  }

  /**
   * 取可用的 Redis 客户端；未配置 Redis 时抛 503。
   * 会话是「正确性敏感」层：宁可让登录/刷新明确失败，也不接受无会话的假成功。
   */
  private requireClient(): RedisClientType {
    if (!this.redis) {
      this.logger.error('Redis 未配置，会话存储不可用');
      throw authErrors.unavailable('会话服务不可用（Redis 未配置）');
    }
    return this.redis;
  }

  private sessionKey(sessionId: string): string {
    return this.prefixer.prefix(CacheKeys.AUTH_SESSION(sessionId));
  }

  private refreshKey(sessionId: string): string {
    return this.prefixer.prefix(CacheKeys.AUTH_REFRESH(sessionId));
  }

  private userSessionsKey(userId: string): string {
    return this.prefixer.prefix(CacheKeys.AUTH_USER_SESSIONS(userId));
  }

  /** 建立新会话，返回 sessionId。写失败上抛（不降级）。 */
  async createSession(input: CreateSessionInput): Promise<string> {
    const client = this.requireClient();
    const sessionId = randomUUID();
    const now = Date.now();
    const record: SessionRecord = {
      sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
      username: input.username,
      isSuper: input.isSuper,
      device: input.device,
      ip: input.ip,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlSeconds * 1000).toISOString(),
    };

    // 顺序非原子：先写会话主体再挂进集合。若集合写入失败，会话仍有效（只是在线列表漏一条），
    // 属可接受的部分失败；反之若先挂集合再写主体，会出现「列表里有、实际不可用」的脏条目。
    await client.set(this.sessionKey(sessionId), JSON.stringify(record), {
      EX: this.ttlSeconds,
    });
    await client.sAdd(this.userSessionsKey(input.userId), sessionId);
    await client.expire(this.userSessionsKey(input.userId), this.ttlSeconds);
    return sessionId;
  }

  /** 读会话记录。Redis 故障返回 unavailable（供守卫降级只读），绝不抛。 */
  async lookupSession(sessionId: string): Promise<SessionLookup> {
    if (!this.redis)
      return { status: 'unavailable' };

    try {
      const raw = await this.redis.get(this.sessionKey(sessionId));
      if (!raw)
        return { status: 'missing' };
      return { status: 'ok', record: JSON.parse(raw) as SessionRecord };
    }
    catch (err) {
      this.logger.warn(
        `会话读取失败，转降级只读 sid=${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'unavailable' };
    }
  }

  /** 写会话当前有效 refresh 令牌摘要（sha256）。正确性敏感，失败上抛。 */
  async saveRefreshHash(sessionId: string, refreshToken: string): Promise<void> {
    const client = this.requireClient();
    await client.set(
      this.refreshKey(sessionId),
      hashCacheToken(refreshToken),
      { EX: this.ttlSeconds },
    );
  }

  /**
   * 滑动过期：重写会话主体并重置集合 TTL。
   *
   * **不**触碰 refresh 摘要——那一步由 {@link casRotateRefresh} 原子完成。
   * 本方法是 CAS 提交点之前的「预写」：若它失败，旧 refresh token 仍然有效、
   * 客户端可重试；不会出现「签发了新 token 但旧 token 未失效」的半状态。
   * 正确性敏感，失败上抛。
   */
  async touchSession(record: SessionRecord): Promise<SessionRecord> {
    const client = this.requireClient();
    const next: SessionRecord = {
      ...record,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString(),
    };
    await client.set(this.sessionKey(record.sessionId), JSON.stringify(next), {
      EX: this.ttlSeconds,
    });
    await client.expire(this.userSessionsKey(record.userId), this.ttlSeconds);
    return next;
  }

  /**
   * 令牌旋转的**唯一提交点**：单 key Lua CAS。
   *
   * CAS = Compare-And-Swap / Compare-And-Set ，
   * 中文叫「比较并交换」或「比较并设置」，是一种 原子操作 。
   * 仅当 refresh 摘要等于 `expectedHash` 时，才覆盖为新 refresh 摘要并重设 TTL；
   * 返回 true 的请求是并发中的赢家，返回 false 表示该 refresh token 已被轮换
   * （并发重放或陈旧 token），调用方应抛「refresh token 无效」。
   *
   * 为什么用 Lua 而不是 GET+SET：读与写之间存在 TOCTOU 窗口，两个并发刷新会
   * 双双通过校验、双双覆盖，导致重放检测失效与客户端令牌被提前作废。
   * 脚本只碰 refresh 一个 key，避免跨 slot（Redis Cluster 兼容，无需 hash tag）。
   * 正确性敏感，失败上抛。
   */
  async casRotateRefresh(
    sessionId: string,
    expectedHash: string,
    newRefreshToken: string,
  ): Promise<boolean> {
    const client = this.requireClient();
    const newHash = hashCacheToken(newRefreshToken);
    const lua = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
        return 1
      end
      return 0
    `;
    const result = await client.eval(lua, {
      keys: [this.refreshKey(sessionId)],
      arguments: [expectedHash, newHash, String(this.ttlSeconds)],
    }) as number;
    return result === 1;
  }

  /** 登出：删除会话主体 + refresh 摘要 + 集合成员。正确性敏感，失败上抛。 */
  async removeSession(sessionId: string, userId: string): Promise<void> {
    const client = this.requireClient();
    await client.del([this.sessionKey(sessionId), this.refreshKey(sessionId)]);
    await client.sRem(this.userSessionsKey(userId), sessionId);
  }

  /** 强制下线某用户全部设备，返回被移除的会话数。正确性敏感，失败上抛。 */
  async removeAllSessions(userId: string): Promise<number> {
    const client = this.requireClient();
    const setKey = this.userSessionsKey(userId);
    const sessionIds = await client.sMembers(setKey);
    if (sessionIds.length > 0) {
      const keys = sessionIds.flatMap(id => [
        this.sessionKey(id),
        this.refreshKey(id),
      ]);
      await client.del(keys);
    }
    await client.del(setKey);
    return sessionIds.length;
  }

  /**
   * 在线会话列表（读取型，允许降级：Redis 故障返回空列表）。
   * 集合成员可能是已过期的陈旧 sid，读取时按「会话记录是否还在」过滤，顺带清理脏成员。
   */
  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummary[]> {
    if (!this.redis)
      return [];

    try {
      const setKey = this.userSessionsKey(userId);
      const sessionIds = await this.redis.sMembers(setKey);
      const summaries: SessionSummary[] = [];
      const stale: string[] = [];

      for (const id of sessionIds) {
        const raw = await this.redis.get(this.sessionKey(id));
        if (!raw) {
          stale.push(id);
          continue;
        }
        const record = JSON.parse(raw) as SessionRecord;
        summaries.push({
          sessionId: record.sessionId,
          device: record.device,
          ip: record.ip,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          current: record.sessionId === currentSessionId,
        });
      }

      if (stale.length > 0) {
        await this.redis.sRem(setKey, stale);
      }

      return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    catch (err) {
      this.logger.warn(
        `在线会话列表读取失败，返回空列表: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /** 会话 TTL（秒）；供 refresh 端点计算 Cookie maxAge 与业务断言使用 */
  getSessionTtlSeconds(): number {
    return this.ttlSeconds;
  }

  /**
   * 全量在线会话（P2 在线用户列表用，ADR-009）。
   *
   * 实现：SCAN 会话键空间（`{ns}auth:session:id=*`）。没有维护全局注册表
   * （ZSET/Set）是有意取舍：注册表要在 create/rotate/remove 三条写路径上
   * 保持一致，多一条不变量就多一类脏数据；SCAN 在后台管理的会话量级
   * （数百～数千）下完全够用，且陈旧键由 Redis TTL 自然消亡。
   * 读取型操作：Redis 故障返回空列表（与 listSessions 同口径）。
   */
  async listAllSessions(): Promise<SessionRecord[]> {
    if (!this.redis)
      return [];

    try {
      const pattern = this.prefixer.prefix('auth:session:id=*');
      const records: SessionRecord[] = [];
      for await (const key of this.redis.scanIterator({ MATCH: pattern, COUNT: 200 })) {
        const keyStr = Array.isArray(key) ? key[0] : key;
        if (!keyStr)
          continue;
        const raw = await this.redis.get(keyStr);
        if (!raw)
          continue;
        try {
          records.push(JSON.parse(raw) as SessionRecord);
        }
        catch {
          // 单条损坏不影响整体列表
        }
      }
      return records;
    }
    catch (err) {
      this.logger.warn(
        `全量在线会话读取失败，返回空列表: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /** 读单个会话记录供管理端校验（内部复用 lookupSession 语义） */
  async getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
    const lookup = await this.lookupSession(sessionId);
    return lookup.status === 'ok' ? lookup.record ?? null : null;
  }
}
