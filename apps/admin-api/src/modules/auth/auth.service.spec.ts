import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { AuthPrincipal, SessionRecord } from '@/shared/auth/auth.types.js';
import { TenantStatus, UserStatus } from '@fedstack/database';
import { hashCacheToken } from '@fedstack/redis';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service.js';
import { LoginDto } from '@/modules/auth/dto/login.dto.js';
import { LoginLogService } from '@/shared/audit/login-log.service.js';
import { CAPTCHA_THRESHOLD } from '@/shared/auth/auth.constants.js';
import { CaptchaService } from '@/shared/auth/captcha.service.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { LoginAttemptService } from '@/shared/caching/login-attempt.service.js';
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
    readRefreshHash: vi.fn(),
    rotateSession: vi.fn(),
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
      makeConfigService(),
    );

    prisma.sysTenant.findFirst.mockResolvedValue(tenant);
    loginAttempt.isLocked.mockResolvedValue(false);
    loginAttempt.getFailures.mockResolvedValue(0);
    loginAttempt.recordFailure.mockResolvedValue({ attempts: 1, locked: false });
    loginAttempt.clear.mockResolvedValue(undefined);
    password.verify.mockResolvedValue(true);
    session.createSession.mockResolvedValue('sid-1');
    session.saveRefreshHash.mockResolvedValue(undefined);
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
      expect(jwt.signAsync.mock.calls[1]?.[0]).toEqual({
        sub: '1',
        sid: 'sid-1',
        typ: 'refresh',
      });
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

    it('refresh 摘要缺失时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: sessionRecord });
      session.readRefreshHash.mockResolvedValue(undefined);
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('refresh 摘要不匹配时抛 10A11', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: sessionRecord });
      session.readRefreshHash.mockResolvedValue('other-hash');
      const error = await service.refresh(REFRESH_TOKEN).catch(e => e);
      expect(codeOf(error)).toBe('10A11');
    });

    it('刷新成功时旋转会话并签发新令牌', async () => {
      jwt.verifyAsync.mockResolvedValue(refreshClaims);
      session.lookupSession.mockResolvedValue({ status: 'ok', record: sessionRecord });
      session.readRefreshHash.mockResolvedValue(hashCacheToken(REFRESH_TOKEN));
      session.rotateSession.mockResolvedValue(sessionRecord);

      const tokens = await service.refresh(REFRESH_TOKEN);

      expect(session.rotateSession).toHaveBeenCalledWith(sessionRecord, ACCESS_TOKEN);
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
});
