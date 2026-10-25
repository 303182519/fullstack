import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { AuthPrincipal, SessionRecord } from '@/shared/auth/auth.types.js';
import { MessageTemplateChannel, TenantStatus, UserStatus } from '@fedstack/database';
import { hashCacheToken } from '@fedstack/redis';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service.js';
import { LoginDto } from '@/modules/auth/dto/login.dto.js';
import { MfaChallengeDto } from '@/modules/auth/dto/mfa-challenge.dto.js';
import { MessageCenterService } from '@/modules/message/message-center.service.js';
import { MfaService } from '@/modules/mfa/mfa.service.js';
import { LoginLogService } from '@/shared/audit/login-log.service.js';
import { CAPTCHA_THRESHOLD } from '@/shared/auth/auth.constants.js';
import { CaptchaService } from '@/shared/auth/captcha.service.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { LoginAttemptService } from '@/shared/caching/login-attempt.service.js';
import { MfaAttemptService } from '@/shared/caching/mfa-attempt.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';

const ACCESS_EXPIRES_IN = 7200;
const REFRESH_EXPIRES_IN = 604800;
const ACCESS_TOKEN = 'signed-token';
const REFRESH_TOKEN = 'refresh-token';

function makeConfigService(): ConfigService {
  return {
    get: vi.fn((key: string) =>
      key === 'default'
        ? {
            jwt: {
              accessExpiresIn: ACCESS_EXPIRES_IN,
              refreshExpiresIn: REFRESH_EXPIRES_IN,
            },
          }
        : {},
    ),
  } as unknown as ConfigService;
}

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

const ctx = { ip: '127.0.0.1', device: 'Chrome' };

const tenant = {
  id: 10n,
  tenantCode: 'default',
  status: TenantStatus.ACTIVE,
  expireTime: null,
  deletedAt: null,
};

const activeUser = {
  id: 1n,
  tenantId: 10n,
  username: 'alice',
  password: 'stored-hash',
  isSuper: false,
  status: UserStatus.ACTIVE,
};

const sessionRecord: SessionRecord = {
  sessionId: 'sid-1',
  userId: '1',
  tenantId: '10',
  username: 'alice',
  isSuper: false,
  device: 'Chrome',
  ip: '127.0.0.1',
  createdAt: new Date(1000).toISOString(),
  expiresAt: new Date(2000).toISOString(),
};

const principal: AuthPrincipal = {
  userId: '1',
  tenantId: '10',
  username: 'alice',
  isSuper: false,
  sessionId: 'sid-1',
};

const refreshClaims = { sub: '1', sid: 'sid-1', typ: 'refresh' } as const;

const mfaClaims = {
  sub: '1',
  tid: '10',
  un: 'alice',
  sup: false,
  jti: 'jti-1',
  typ: 'mfa-pending',
} as const;

function makeMfaChallengeDto(overrides: Partial<MfaChallengeDto> = {}): MfaChallengeDto {
  return Object.assign(
    new MfaChallengeDto(),
    { pendingToken: 'pending-token', code: '123456' },
    overrides,
  );
}

function makeLoginDto(overrides: Partial<LoginDto> = {}): LoginDto {
  return Object.assign(
    new LoginDto(),
    { tenantCode: 'default', username: 'alice', password: 'Secret123' },
    overrides,
  );
}

describe('authService', () => {
  const prisma = {
    sysTenant: { findFirst: vi.fn() },
    sysUser: { findFirst: vi.fn() },
    sysRole: { findMany: vi.fn() },
  };
  const jwt = { verifyAsync: vi.fn(), signAsync: vi.fn() };
  const password = { verify: vi.fn() };
  const session = {
    createSession: vi.fn(),
    saveRefreshHash: vi.fn(),
    lookupSession: vi.fn(),
    touchSession: vi.fn(),
    casRotateRefresh: vi.fn(),
    removeSession: vi.fn(),
  };
  const captcha = { generate: vi.fn(), consume: vi.fn() };
  const loginAttempt = {
    isLocked: vi.fn(),
    getFailures: vi.fn(),
    recordFailure: vi.fn(),
    clear: vi.fn(),
  };
  const loginLog = { append: vi.fn(async () => {}) };
  // MFA 默认未启用 + 策略 OPTIONAL：让存量登录用例走「无 MFA 直发」分支
  const mfa = {
    getPolicyMode: vi.fn(async () => 'OPTIONAL' as const),
    isEnabled: vi.fn(async () => false),
    verifyTotp: vi.fn(async () => false),
    verifyRecoveryCode: vi.fn(async () => false),
  };
  const mfaAttempt = {
    isAccountLocked: vi.fn(async () => false),
    recordChallengeFailure: vi.fn(async () => ({ attempts: 1, exhausted: false })),
    recordAccountFailure: vi.fn(async () => ({ attempts: 1, exhausted: false })),
    clearAccount: vi.fn(async () => {}),
  };
  const messageCenter = { sendDirect: vi.fn(async () => {}) };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      password as unknown as PasswordService,
      session as unknown as SessionService,
      captcha as unknown as CaptchaService,
      loginAttempt as unknown as LoginAttemptService,
      loginLog as unknown as LoginLogService,
      mfa as unknown as MfaService,
      mfaAttempt as unknown as MfaAttemptService,
      messageCenter as unknown as MessageCenterService,
      cache as never,
      makeConfigService(),
    );

    prisma.sysTenant.findFirst.mockResolvedValue(tenant);
    loginAttempt.isLocked.mockResolvedValue(false);
    loginAttempt.getFailures.mockResolvedValue(0);
    loginAttempt.recordFailure.mockResolvedValue({ attempts: 1, locked: false });
    loginAttempt.clear.mockResolvedValue(undefined);
    // mockResolvedValue 的实现会跨用例残留（clearAllMocks 不清实现），每个用例前重置默认值
    mfa.getPolicyMode.mockResolvedValue('OPTIONAL');
    mfa.isEnabled.mockResolvedValue(false);
    mfa.verifyTotp.mockResolvedValue(false);
    mfa.verifyRecoveryCode.mockResolvedValue(false);
    mfaAttempt.isAccountLocked.mockResolvedValue(false);
    mfaAttempt.recordChallengeFailure.mockResolvedValue({ attempts: 1, exhausted: false });
    mfaAttempt.recordAccountFailure.mockResolvedValue({ attempts: 1, exhausted: false });
    mfaAttempt.clearAccount.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(undefined);
    cache.del.mockResolvedValue(false);
    password.verify.mockResolvedValue(true);
    session.createSession.mockResolvedValue('sid-1');
    session.saveRefreshHash.mockResolvedValue(undefined);
    session.touchSession.mockResolvedValue(sessionRecord);
    session.casRotateRefresh.mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue(ACCESS_TOKEN);
  });

  describe('issueCaptcha', () => {
    it('透传验证码服务结果', async () => {
      captcha.generate.mockResolvedValue({ captchaId: 'c-1', svg: '<svg/>', expiresIn: 300 });
      await expect(service.issueCaptcha()).resolves.toEqual({
        captchaId: 'c-1',
        svg: '<svg/>',
        expiresIn: 300,
      });
    });
  });

  describe('login', () => {
    it('租户不存在时抛 10A07', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue(null);
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A07');
    });

    it('租户停用时抛 10A07', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({ ...tenant, status: TenantStatus.DISABLED });
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A07');
    });

    it('租户过期时抛 10A07', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({
        ...tenant,
        expireTime: new Date(Date.now() - 1000),
      });
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A07');
    });

    it('账号被锁定时直接拒绝且不比对密码', async () => {
      loginAttempt.isLocked.mockResolvedValue(true);
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A03');
      expect(password.verify).not.toHaveBeenCalled();
    });

    it('失败达阈值且未带验证码时要求验证码', async () => {
      loginAttempt.getFailures.mockResolvedValue(CAPTCHA_THRESHOLD);
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A04');
    });

    it('验证码错误时拒绝', async () => {
      loginAttempt.getFailures.mockResolvedValue(CAPTCHA_THRESHOLD);
      captcha.consume.mockResolvedValue(false);
      const dto = makeLoginDto({ captchaId: 'c-1', captchaText: 'abcd' });
      const error = await service.login(dto, ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A05');
    });

    it('用户不存在时记失败并拒绝', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A02');
      expect(loginAttempt.recordFailure).toHaveBeenCalledWith('10', 'alice');
      expect(loginLog.append).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 10n,
        status: 'FAILURE',
        msg: 'INVALID_CREDENTIALS',
      }));
    });

    it('用户无密码字段时记失败并拒绝', async () => {
      prisma.sysUser.findFirst.mockResolvedValue({ ...activeUser, password: null });
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A02');
      expect(loginAttempt.recordFailure).toHaveBeenCalledWith('10', 'alice');
    });

    it('账号禁用时拒绝且不计失败', async () => {
      prisma.sysUser.findFirst.mockResolvedValue({ ...activeUser, status: UserStatus.DISABLED });
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A06');
      expect(loginAttempt.recordFailure).not.toHaveBeenCalled();
    });

    it('密码错误时记失败并拒绝', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(activeUser);
      password.verify.mockResolvedValue(false);
      const error = await service.login(makeLoginDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A02');
      expect(loginAttempt.recordFailure).toHaveBeenCalledWith('10', 'alice');
    });

    it('登录成功签发双令牌、建立会话并清零失败计数', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(activeUser);

      const tokens = await service.login(makeLoginDto(), ctx);

      expect(loginAttempt.clear).toHaveBeenCalledWith('10', 'alice');
      expect(loginLog.append).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 10n,
        userId: 1n,
        status: 'SUCCESS',
        msg: 'SUCCESS',
      }));
      expect(session.createSession).toHaveBeenCalledWith({
        userId: '1',
        tenantId: '10',
        username: 'alice',
        isSuper: false,
        device: 'Chrome',
        ip: '127.0.0.1',
      });
      expect(session.saveRefreshHash).toHaveBeenCalledWith('sid-1', ACCESS_TOKEN);
      expect(tokens).toEqual({
        accessToken: ACCESS_TOKEN,
        refreshToken: ACCESS_TOKEN,
        expiresIn: ACCESS_EXPIRES_IN,
      });
    });

    it('签发的令牌载荷带类型标记', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(activeUser);

      await service.login(makeLoginDto(), ctx);

      expect(jwt.signAsync.mock.calls[0]?.[0]).toMatchObject({
        sub: '1',
        sid: 'sid-1',
        tid: '10',
        un: 'alice',
        sup: false,
        typ: 'access',
      });
      expect(jwt.signAsync.mock.calls[1]?.[0]).toMatchObject({
        sub: '1',
        sid: 'sid-1',
        typ: 'refresh',
      });
      // jti 为随机 UUID，保证同一秒内签发的 refresh token 必然不同
      expect(jwt.signAsync.mock.calls[1]?.[0].jti).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('refresh', () => {
    it('token 缺失时抛 10A11', async () => {
      const error = await service.refresh(undefined).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('jwt 校验失败时抛 10A11', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('令牌类型非 refresh 时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue({ ...refreshClaims, typ: 'access' });
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('claims 缺 sub/sid 时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue({ typ: 'refresh' });
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('会话不存在时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'missing' });
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('会话服务不可用时抛 10B01', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'unavailable' });
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });

    it('会话记录缺失时抛 10B01', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: undefined });
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });

    it('cAS 失败（token 已被轮换/并发重放）时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: sessionRecord });
      session.casRotateRefresh.mockResolvedValue(false);

      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);

      expect(codeOf(error)).toBe('10A11');
      expect(session.touchSession).toHaveBeenCalledWith(sessionRecord);
      expect(session.casRotateRefresh).toHaveBeenCalledWith(
        'sid-1',
        hashCacheToken(REFRESH_TOKEN),
        ACCESS_TOKEN,
      );
    });

    it('刷新成功时先滑动 TTL 再 CAS 旋转并签发新令牌', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: sessionRecord });

      const tokens = await service.refresh(REFRESH_TOKEN);

      // 顺序：touchSession（预写）→ casRotateRefresh（提交点）
      const [touchOrder] = session.touchSession.mock.invocationCallOrder;
      const [casOrder] = session.casRotateRefresh.mock.invocationCallOrder;
      expect(touchOrder).toBeTypeOf('number');
      expect(casOrder).toBeTypeOf('number');
      if (touchOrder !== undefined && casOrder !== undefined) {
        expect(touchOrder).toBeLessThan(casOrder);
      }
      expect(session.touchSession).toHaveBeenCalledWith(sessionRecord);
      expect(session.casRotateRefresh).toHaveBeenCalledWith(
        'sid-1',
        hashCacheToken(REFRESH_TOKEN),
        ACCESS_TOKEN,
      );
      expect(tokens).toEqual({
        accessToken: ACCESS_TOKEN,
        refreshToken: ACCESS_TOKEN,
        expiresIn: ACCESS_EXPIRES_IN,
      });
    });
  });

  describe('logout', () => {
    it('删除当前会话', async () => {
      await service.logout(principal);
      expect(session.removeSession).toHaveBeenCalledWith('sid-1', '1');
    });
  });

  describe('profile', () => {
    it('用户不存在时抛 10A08', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      const error = await service.profile(principal).catch(e => e);
      expect(codeOf(error)).toBe('10A08');
    });
  });

  describe('verifyMfa', () => {
    /** 让一个合法的 pending 挑战走到「验码」这一步 */
    function arrangeValidChallenge() {
      jwt.verifyAsync.mockResolvedValue(mfaClaims);
      cache.get.mockResolvedValue('1');
      cache.del.mockResolvedValue(true);
      prisma.sysUser.findFirst.mockResolvedValue(activeUser);
    }

    it('jwt 校验失败时抛 10A08', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A08');
    });

    it('令牌类型非 mfa-pending 时抛 10A08', async () => {
      jwt.verifyAsync.mockResolvedValue({ ...mfaClaims, typ: 'access' });
      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);
      expect(codeOf(error)).toBe('10A08');
    });

    it('账号维度 MFA 锁定时直接拒绝且不验码', async () => {
      jwt.verifyAsync.mockResolvedValue(mfaClaims);
      mfaAttempt.isAccountLocked.mockResolvedValue(true);

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A03');
      expect(mfa.verifyTotp).not.toHaveBeenCalled();
      expect(mfa.verifyRecoveryCode).not.toHaveBeenCalled();
      expect(loginLog.append).toHaveBeenCalledWith(expect.objectContaining({
        msg: 'MFA_LOCKED',
        status: 'FAILURE',
      }));
    });

    it('pending 已消费或过期时抛 10A08 且不验码', async () => {
      jwt.verifyAsync.mockResolvedValue(mfaClaims);
      cache.get.mockResolvedValue(undefined);

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A08');
      expect(mfa.verifyTotp).not.toHaveBeenCalled();
      expect(mfa.verifyRecoveryCode).not.toHaveBeenCalled();
    });

    it('验证码错误时保留 pending 可重试并记录双维度失败', async () => {
      arrangeValidChallenge();

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A02');
      // 未达上限不作废挑战：pending 不被消费，用户可原地重试
      expect(cache.del).not.toHaveBeenCalled();
      expect(mfaAttempt.recordChallengeFailure).toHaveBeenCalledWith('jti-1');
      expect(mfaAttempt.recordAccountFailure).toHaveBeenCalledWith('10', 'alice');
      expect(loginLog.append).toHaveBeenCalledWith(expect.objectContaining({
        msg: 'MFA_INVALID',
        userId: 1n,
        status: 'FAILURE',
      }));
      expect(messageCenter.sendDirect).not.toHaveBeenCalled();
    });

    it('挑战内失败达上限时作废 pending', async () => {
      arrangeValidChallenge();
      mfaAttempt.recordChallengeFailure.mockResolvedValue({ attempts: 5, exhausted: true });

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A02');
      expect(cache.del).toHaveBeenCalledWith(CacheKeys.AUTH_MFA_PENDING('jti-1'));
      expect(messageCenter.sendDirect).not.toHaveBeenCalled();
    });

    it('账号维度失败达上限时作废 pending 并发送站内信安全提醒', async () => {
      arrangeValidChallenge();
      mfaAttempt.recordAccountFailure.mockResolvedValue({ attempts: 10, exhausted: true });

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A02');
      expect(cache.del).toHaveBeenCalledWith(CacheKeys.AUTH_MFA_PENDING('jti-1'));
      expect(messageCenter.sendDirect).toHaveBeenCalledWith(
        MessageTemplateChannel.INNER,
        expect.objectContaining({
          tenantId: 10n,
          recipientId: '1',
          category: 'SECURITY',
        }),
      );
    });

    it('验证通过但 pending 已被并发消费时抛 10A08', async () => {
      arrangeValidChallenge();
      mfa.verifyTotp.mockResolvedValue(true);
      cache.del.mockResolvedValue(false);

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A08');
      expect(session.createSession).not.toHaveBeenCalled();
    });

    it('验证通过但用户在等待期间被禁用时抛 10A06 且不消费 pending', async () => {
      arrangeValidChallenge();
      mfa.verifyTotp.mockResolvedValue(true);
      prisma.sysUser.findFirst.mockResolvedValue({ ...activeUser, status: UserStatus.DISABLED });

      const error = await service.verifyMfa(makeMfaChallengeDto(), ctx).catch(e => e);

      expect(codeOf(error)).toBe('10A06');
      expect(cache.del).not.toHaveBeenCalled();
      expect(session.createSession).not.toHaveBeenCalled();
    });

    it('验证成功时先验码后消费 pending、清零账号计数并签发令牌', async () => {
      arrangeValidChallenge();
      mfa.verifyTotp.mockResolvedValue(true);

      const tokens = await service.verifyMfa(makeMfaChallengeDto(), ctx);

      // 消费顺序：验证通过之后才一次性消费 pending（防「输错即作废」）
      const [totpOrder] = mfa.verifyTotp.mock.invocationCallOrder;
      const [delOrder] = cache.del.mock.invocationCallOrder;
      expect(totpOrder).toBeTypeOf('number');
      expect(delOrder).toBeTypeOf('number');
      if (totpOrder !== undefined && delOrder !== undefined) {
        expect(totpOrder).toBeLessThan(delOrder);
      }
      expect(mfaAttempt.clearAccount).toHaveBeenCalledWith('10', 'alice');
      expect(session.createSession).toHaveBeenCalledWith({
        userId: '1',
        tenantId: '10',
        username: 'alice',
        isSuper: false,
        device: 'Chrome',
        ip: '127.0.0.1',
      });
      expect(tokens).toEqual({
        accessToken: ACCESS_TOKEN,
        refreshToken: ACCESS_TOKEN,
        expiresIn: ACCESS_EXPIRES_IN,
      });
    });

    it('8 位恢复码走恢复码验证通道，不查 TOTP', async () => {
      arrangeValidChallenge();
      mfa.verifyRecoveryCode.mockResolvedValue(true);

      const tokens = await service.verifyMfa(
        makeMfaChallengeDto({ code: 'AB12CD34' }),
        ctx,
      );

      expect(mfa.verifyTotp).not.toHaveBeenCalled();
      expect(mfa.verifyRecoveryCode).toHaveBeenCalledWith(1n, 'AB12CD34');
      expect(tokens.accessToken).toBe(ACCESS_TOKEN);
    });
  });
});
