import type { RedisClientType } from '@fedstack/redis';
import { KeyPrefixer, REDIS_CLIENT, withRedis } from '@fedstack/redis';
import { Inject, Injectable } from '@nestjs/common';
import { MFA_PENDING_TTL_SECONDS } from '@/shared/auth/auth.constants.js';
import { CacheKeys } from './cache.constants.js';

/**
 * MFA 二步验证的防爆破策略（本服务自有，不依赖应用层常量）。
 *
 * 双维度计数（策略调整入口集中在这里，ADR-013 D8 演进）：
 * - 挑战维度：同一个 pendingToken 允许 challengeMaxAttempts 次试错，超限作废挑战，
 *   用户需重新走密码登录拿新挑战。这是「可用性（允许手滑重试）」与「防枚举」的平衡点。
 * - 账号维度：跨挑战累计失败，达 accountMaxAttempts 后锁定 accountWindowMinutes，
 *   防攻击者反复登录刷新挑战绕过挑战内计数（与 LoginAttemptService 的密码维度正交）。
 */
export const MFA_VERIFY_LIMITS = {
  /** 单次挑战（一个 pendingToken）内允许的验证码错误次数 */
  challengeMaxAttempts: 5,
  /** 账号维度窗口内允许的验证码错误次数 */
  accountMaxAttempts: 10,
  /** 账号维度计数窗口 = 锁定时长（分钟） */
  accountWindowMinutes: 30,
} as const;

/** 一次失败计数的结果：当前累计次数、是否已达上限。 */
export interface MfaAttemptResult {
  attempts: number;
  exhausted: boolean;
}

// 维度说明：
// - 挑战维度 key 按 jti（一次登录挑战一个），TTL 与 pending 令牌同寿命，挑战作废后自然消亡；
// - 账号维度 key 按 (tenantId, username)，与 LoginAttemptService 同理必须带 tenantId 防跨租户误锁。
//
// 降级哲学与 LoginAttemptService 一致：Redis 不通时整套计数静默关闭（fail-open），
// 登录主链路不挂；此时防爆破由 IP 限流（Throttler）兜底。
//
// 单 key 设计：INCR + 首次起算窗口（EXPIRE 仅 0→1 时设置），窗口到期自动归零解锁，
// 无滑动续期尾部效应；MFA 验证通过立即清零账号维度计数。

@Injectable()
export class MfaAttemptService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType | null,
    private readonly prefixer: KeyPrefixer,
  ) {}

  /**
   * 记一次挑战内失败，返回累计次数与是否达上限。
   * TTL 与 pending 令牌一致：挑战过期后计数器随之消失。
   */
  async recordChallengeFailure(jti: string): Promise<MfaAttemptResult> {
    const redisKey = this.prefixer.prefix(CacheKeys.AUTH_MFA_CHALLENGE_FAIL(jti));
    const attempts = await this.incrWithWindow(redisKey, MFA_PENDING_TTL_SECONDS);
    return {
      attempts,
      exhausted: attempts >= MFA_VERIFY_LIMITS.challengeMaxAttempts,
    };
  }

  /** 账号维度当前是否锁定（失败计数已达上限且窗口未过期）。Redis 不通恒 false（降级）。 */
  async isAccountLocked(tenantId: string, username: string): Promise<boolean> {
    const redisKey = this.prefixer.prefix(
      CacheKeys.AUTH_MFA_ACCOUNT_FAIL(tenantId, username),
    );
    const failures = await withRedis(
      this.redis,
      async (r) => {
        const raw = await r.get(redisKey);
        const n = Number(raw);
        return Number.isInteger(n) && n > 0 ? n : 0;
      },
      0,
      'MfaAttemptService.isAccountLocked',
    );
    return failures >= MFA_VERIFY_LIMITS.accountMaxAttempts;
  }

  /**
   * 记一次账号维度失败，返回累计次数与是否刚好达上限（调用方据此触发锁定动作）。
   * 窗口期 = 锁定时长，到期自动归零解锁，无需人工介入。
   */
  async recordAccountFailure(
    tenantId: string,
    username: string,
  ): Promise<MfaAttemptResult> {
    const redisKey = this.prefixer.prefix(
      CacheKeys.AUTH_MFA_ACCOUNT_FAIL(tenantId, username),
    );
    const attempts = await this.incrWithWindow(
      redisKey,
      MFA_VERIFY_LIMITS.accountWindowMinutes * 60,
    );
    return {
      attempts,
      exhausted: attempts >= MFA_VERIFY_LIMITS.accountMaxAttempts,
    };
  }

  /**
   * MFA 验证通过立即清零账号维度计数。
   * 否则合法用户几次手滑后计数器在窗口内挂着，下次输错会很快顶到阈值。
   */
  async clearAccount(tenantId: string, username: string): Promise<void> {
    const redisKey = this.prefixer.prefix(
      CacheKeys.AUTH_MFA_ACCOUNT_FAIL(tenantId, username),
    );
    await withRedis(
      this.redis,
      async (r) => {
        await r.del(redisKey);
      },
      undefined, // 清零失败无碍：计数器到期自动归零
      'MfaAttemptService.clearAccount',
    );
  }

  /** INCR + 仅首次（0→1）设置 TTL 的原子自增；Redis 不通返回 0（fail-open） */
  private async incrWithWindow(redisKey: string, windowSec: number): Promise<number> {
    const lua = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then
        redis.call("EXPIRE", KEYS[1], ARGV[1])
      end
      return current
    `;
    return withRedis(
      this.redis,
      async (r) => {
        return (await r.eval(lua, {
          keys: [redisKey],
          arguments: [String(windowSec)],
        })) as number;
      },
      0,
      'MfaAttemptService.incrWithWindow',
    );
  }
}
