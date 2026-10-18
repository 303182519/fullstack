import type { CaptchaResponseDto, LoginDto, ProfileResponseDto } from './dto/index.js';
import type { LoginMsg } from '@/shared/audit/login-msg.constants.js';
import type {
  AccessTokenPayload,
  AuthPrincipal,
  IssuedTokens,
  RefreshTokenPayload,
} from '@/shared/auth/auth.types.js';
import { LoginLogStatus, TenantStatus, UserStatus } from '@fedstack/database';
import { hashCacheToken } from '@fedstack/redis';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConfig } from '@/config/configuration.js';
import { LoginLogService } from '@/shared/audit/login-log.service.js';
import {
  LOGIN_LOG_UNKNOWN_TENANT_ID,
  LOGIN_MSG,
} from '@/shared/audit/login-msg.constants.js';
import {
  CAPTCHA_THRESHOLD,
  TOKEN_TYPE,
} from '@/shared/auth/auth.constants.js';
import { authErrors } from '@/shared/auth/auth.errors.js';
import { CaptchaService } from '@/shared/auth/captcha.service.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import {
  LOGIN_LOCKOUT,
  LoginAttemptService,
} from '@/shared/caching/login-attempt.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';

/** 登录调用上下文（IP / 设备仅用于审计与会话展示） */
export interface LoginContext {
  ip: string;
  device: string;
}

/**
 * 认证应用服务：编排登录、刷新、登出、资料查询。
 *
 * 业务规则全部在此层（Controller 仅做参数绑定与 Cookie 读写）。
 * 事务边界说明：登录/刷新不涉及多表写一致性（用户与角色只读、会话在 Redis），
 * 因此无需 Prisma 事务；会话正确性由 SessionService 的 fail-fast 保证。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessExpiresIn: number;
  private readonly refreshExpiresIn: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly password: PasswordService,
    private readonly session: SessionService,
    private readonly captcha: CaptchaService,
    private readonly loginAttempt: LoginAttemptService,
    private readonly loginLog: LoginLogService,
    configService: ConfigService,
  ) {
    const { jwt } = getConfig(configService);
    this.accessExpiresIn = jwt.accessExpiresIn;
    this.refreshExpiresIn = jwt.refreshExpiresIn;
  }

  /** 生成图形验证码（公开端点） */
  async issueCaptcha(): Promise<CaptchaResponseDto> {
    return this.captcha.generate();
  }

  /**
   * 账号密码登录。
   *
   * 防爆破顺序（先廉价后昂贵）：
   *   1. 解析租户（并校验可用）；
   *   2. 账号锁定判定（命中即拒，省去 argon2 计算）；
   *   3. 验证码前置（失败达阈值后强制）；
   *   4. 查用户 + argon2 校验。
   * 任一「凭据类」失败都计一次失败；账号禁用不计（非爆破行为）。
   */
  async login(dto: LoginDto, ctx: LoginContext): Promise<IssuedTokens> {
    const tenant = await this.resolveTenant(dto.tenantCode);
    if (!tenant) {
      // 租户不可用：真实 tenantId 无法确定，日志记 0 占位（见 SysLoginLog 注释）
      this.logAttempt(dto, ctx, LOGIN_LOG_UNKNOWN_TENANT_ID, LoginLogStatus.FAILURE, LOGIN_MSG.TENANT_UNAVAILABLE);
      throw authErrors.tenantUnavailable();
    }
    const tenantId = tenant.id.toString();

    if (await this.loginAttempt.isLocked(tenantId, dto.username)) {
      this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.ACCOUNT_LOCKED);
      throw authErrors.accountLocked(LOGIN_LOCKOUT.lockMinutes);
    }

    const failures = await this.loginAttempt.getFailures(tenantId, dto.username);
    if (failures >= CAPTCHA_THRESHOLD) {
      if (!dto.captchaId || !dto.captchaText) {
        this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.CAPTCHA_REQUIRED);
        throw authErrors.captchaRequired();
      }
      const captchaOk = await this.captcha.consume(dto.captchaId, dto.captchaText);
      if (!captchaOk) {
        this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.CAPTCHA_INVALID);
        throw authErrors.captchaInvalid();
      }
    }

    const user = await this.prisma.sysUser.findFirst({
      where: { tenantId: tenant.id, username: dto.username, deletedAt: null },
    });

    if (!user || !user.password) {
      await this.loginAttempt.recordFailure(tenantId, dto.username);
      this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.INVALID_CREDENTIALS);
      throw authErrors.invalidCredentials();
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.USER_DISABLED);
      throw authErrors.userDisabled();
    }

    const passwordOk = await this.password.verify(user.password, dto.password);
    if (!passwordOk) {
      await this.loginAttempt.recordFailure(tenantId, dto.username);
      this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.FAILURE, LOGIN_MSG.INVALID_CREDENTIALS);
      throw authErrors.invalidCredentials();
    }

    await this.loginAttempt.clear(tenantId, dto.username);

    this.logAttempt(dto, ctx, tenant.id, LoginLogStatus.SUCCESS, LOGIN_MSG.SUCCESS, user.id);

    const userId = user.id.toString();
    const sessionId = await this.session.createSession({
      userId,
      tenantId,
      username: user.username,
      isSuper: user.isSuper,
      device: ctx.device,
      ip: ctx.ip,
    });

    const tokens = await this.issueTokens({
      userId,
      tenantId,
      username: user.username,
      isSuper: user.isSuper,
      sessionId,
    });
    await this.session.saveRefreshHash(sessionId, tokens.refreshToken);

    this.logger.log(
      `登录成功并建立会话 userId=${userId} tenantId=${tenantId} sid=${sessionId}`,
    );
    return tokens;
  }

  /**
   * 刷新：滑动过期 + 令牌旋转。
   *
   * 旋转校验：Redis 中存的 refresh 摘要是「该会话当前唯一有效」的令牌；
   * 若请求带来的 refresh 与存储摘要不一致（含被旋转淘汰的旧令牌），一律拒绝。
   * Redis 不可用时不上抛降级——刷新属正确性敏感操作，宁可让前端重新登录，也不能签发无会话的令牌。
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) {
      throw authErrors.invalidRefreshToken();
    }

    let claims: RefreshTokenPayload;
    try {
      claims = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    }
    catch {
      throw authErrors.invalidRefreshToken();
    }

    const sessionId = claims.sid;
    if (claims.typ !== TOKEN_TYPE.REFRESH || !claims.sub || !sessionId) {
      throw authErrors.invalidRefreshToken();
    }

    const lookup = await this.session.lookupSession(sessionId);
    if (lookup.status === 'missing') {
      throw authErrors.invalidRefreshToken();
    }
    if (lookup.status === 'unavailable' || !lookup.record) {
      throw authErrors.unavailable('会话服务暂不可用，请稍后重试');
    }

    const record = lookup.record;
    const storedHash = await this.session.readRefreshHash(sessionId);
    if (!storedHash || storedHash !== hashCacheToken(refreshToken)) {
      throw authErrors.invalidRefreshToken();
    }

    const tokens = await this.issueTokens({
      userId: record.userId,
      tenantId: record.tenantId,
      username: record.username,
      isSuper: record.isSuper,
      sessionId,
    });
    await this.session.rotateSession(record, tokens.refreshToken);
    return tokens;
  }

  /** 登出：删除当前会话（幂等——重复登出同样返回成功语义） */
  async logout(principal: AuthPrincipal): Promise<void> {
    await this.session.removeSession(principal.sessionId, principal.userId);
  }

  /** 当前用户资料（含角色与数据权限档位） */
  async profile(principal: AuthPrincipal): Promise<ProfileResponseDto> {
    const user = await this.prisma.sysUser.findFirst({
      where: { id: BigInt(principal.userId), deletedAt: null },
    });
    if (!user) {
      // 会话尚在但用户已被删除：视为登录态失效，要求重新登录
      throw authErrors.invalidAccessToken('账号不存在或已删除，请重新登录');
    }

    const roles = await this.prisma.sysRole.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        userRoles: { some: { userId: user.id } },
      },
      select: { id: true, roleName: true, roleCode: true, dataScope: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      id: user.id.toString(),
      tenantId: user.tenantId.toString(),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      gender: user.gender ?? null,
      status: user.status,
      isSuper: user.isSuper,
      roles: roles.map(role => ({
        id: role.id.toString(),
        roleName: role.roleName,
        roleCode: role.roleCode,
        dataScope: role.dataScope,
      })),
    };
  }

  /**
   * 解析并校验租户可用性（存在 / 未删除 / 状态可用 / 未过期）。
   * 不可用返回 null 而非抛错：调用方（login）需要先埋登录日志再抛业务异常。
   */
  private async resolveTenant(tenantCode: string) {
    const tenant = await this.prisma.sysTenant.findFirst({
      where: { tenantCode, deletedAt: null },
    });
    if (!tenant) {
      return null;
    }
    if (tenant.status !== TenantStatus.ACTIVE) {
      return null;
    }
    if (tenant.expireTime && tenant.expireTime.getTime() <= Date.now()) {
      return null;
    }
    return tenant;
  }

  /** 埋一条登录日志（fire-and-forget：日志落库失败绝不阻塞登录主链路，见 LoginLogService） */
  private logAttempt(
    dto: LoginDto,
    ctx: LoginContext,
    tenantId: bigint,
    status: LoginLogStatus,
    msg: LoginMsg,
    userId?: bigint,
  ): void {
    void this.loginLog.append({
      tenantId,
      userId: userId ?? null,
      username: dto.username,
      ip: ctx.ip,
      device: ctx.device,
      status,
      msg,
    });
  }

  /** 签发 access + refresh 双令牌 */
  private async issueTokens(principal: AuthPrincipal): Promise<IssuedTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: principal.userId,
      sid: principal.sessionId,
      tid: principal.tenantId,
      un: principal.username,
      sup: principal.isSuper,
      typ: TOKEN_TYPE.ACCESS,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: principal.userId,
      sid: principal.sessionId,
      typ: TOKEN_TYPE.REFRESH,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      expiresIn: this.accessExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: this.refreshExpiresIn,
    });

    return { accessToken, refreshToken, expiresIn: this.accessExpiresIn };
  }
}
