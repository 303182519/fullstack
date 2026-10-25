import type { CaptchaResponseDto, LoginDto, MfaChallengeDto, ProfileResponseDto } from './dto/index.js';
import type { LoginMsg } from '@/shared/audit/login-msg.constants.js';
import type {
  AccessTokenPayload,
  AuthPrincipal,
  IssuedTokens,
  LoginResult,
  MfaPendingTokenPayload,
  RefreshTokenPayload,
} from '@/shared/auth/auth.types.js';
import * as crypto from 'node:crypto';
import { LoginLogStatus, MessageTemplateChannel, TenantStatus, UserStatus } from '@fedstack/database';
import { CacheService, hashCacheToken } from '@fedstack/redis';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConfig } from '@/config/configuration.js';
import { MessageCenterService } from '@/modules/message/message-center.service.js';
import { MfaService } from '@/modules/mfa/mfa.service.js';
import { LoginLogService } from '@/shared/audit/login-log.service.js';
import {
  LOGIN_LOG_UNKNOWN_TENANT_ID,
  LOGIN_MSG,
} from '@/shared/audit/login-msg.constants.js';
import {
  CAPTCHA_THRESHOLD,
  MFA_PENDING_TTL_SECONDS,
  TOKEN_TYPE,
} from '@/shared/auth/auth.constants.js';
import { authErrors } from '@/shared/auth/auth.errors.js';
import { CaptchaService } from '@/shared/auth/captcha.service.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import {
  LOGIN_LOCKOUT,
  LoginAttemptService,
} from '@/shared/caching/login-attempt.service.js';
import {
  MFA_VERIFY_LIMITS,
  MfaAttemptService,
} from '@/shared/caching/mfa-attempt.service.js';
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
    private readonly mfa: MfaService,
    private readonly mfaAttempt: MfaAttemptService,
    private readonly messageCenter: MessageCenterService,
    private readonly cache: CacheService,
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
   *
   * MFA 分支（ADR-013 D8）：密码通过且策略非 DISABLED 且用户已启用 MFA 时，
   * 不直接签发正式令牌，而是签发「MFA 待验令牌」（短 TTL + jti 一次性消费），
   * 客户端需调 `/auth/mfa/verify` 完成二次验证后才建立会话。
   */
  async login(dto: LoginDto, ctx: LoginContext): Promise<LoginResult> {
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

    // MFA 分支（ADR-013 D8）：策略非 DISABLED 且用户已启用 MFA 时进入二步流程
    const policyMode = await this.mfa.getPolicyMode(tenant.id);
    if (policyMode !== 'DISABLED' && await this.mfa.isEnabled(user.id)) {
      return this.issueMfaPendingToken({
        userId,
        tenantId,
        username: user.username,
        isSuper: user.isSuper,
      });
    }

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
   * MFA 二次验证（P3b，ADR-013 D8）。
   *
   * 校验顺序：
   *   1. JWT 签名 + 有效期；
   *   2. typ === 'mfa-pending'（防 access/refresh 令牌冒用）；
   *   3. 账号维度 MFA 锁定判定（跨挑战累计失败达上限即拒，防反复登录刷新挑战绕过挑战内计数）；
   *   4. pending 存活检查（get 只读不消费：避免在已死挑战上验证恢复码——恢复码一验即烧）；
   *   5. TOTP 或恢复码验证（按 code 长度分流）；失败时双维度计数，
   *      挑战内达上限或账号达上限 → 作废 pending（强制重新登录），账号达上限另发站内信提醒；
   *   6. 用户状态复核（防御 pending 期间被禁用/删除）；
   *   7. 消费 jti（验证通过才一次性消费；并发重放时仅先到者 del 成功）；
   *   8. 清零账号维度计数 + 建会话 + 签发正式令牌。
   */
  async verifyMfa(dto: MfaChallengeDto, ctx: LoginContext): Promise<IssuedTokens> {
    let claims: MfaPendingTokenPayload;
    try {
      claims = await this.jwtService.verifyAsync<MfaPendingTokenPayload>(dto.pendingToken);
    }
    catch {
      throw authErrors.invalidAccessToken('MFA 待验令牌无效或已过期，请重新登录');
    }

    if (claims.typ !== TOKEN_TYPE.MFA_PENDING || !claims.sub || !claims.jti) {
      throw authErrors.invalidAccessToken('MFA 待验令牌无效');
    }

    // 账号维度锁定判定：锁定期间连正确的验证码也拒（锁的是 MFA 阶段，不影响密码登录重试）
    if (await this.mfaAttempt.isAccountLocked(claims.tid, claims.un)) {
      this.logMfaAttempt(claims, ctx, LOGIN_MSG.MFA_LOCKED);
      throw authErrors.accountLocked(MFA_VERIFY_LIMITS.accountWindowMinutes);
    }

    // pending 存活检查（只读不消费）：过期/已消费的挑战直接拒。
    // Redis 不通时 get 降级为 miss → MFA 验证整体拒绝（与刷新同纪律：正确性敏感操作不降级）。
    const pendingAlive = await this.cache.get(CacheKeys.AUTH_MFA_PENDING(claims.jti));
    if (pendingAlive === undefined) {
      throw authErrors.invalidAccessToken('MFA 待验令牌已使用或已过期，请重新登录');
    }

    const userId = BigInt(claims.sub);

    // TOTP（6 位）或恢复码（8 位）
    let verified = false;
    if (dto.code.length === 6) {
      verified = await this.mfa.verifyTotp(userId, dto.code);
    }
    if (!verified) {
      verified = await this.mfa.verifyRecoveryCode(userId, dto.code);
    }
    if (!verified) {
      await this.handleMfaFailure(claims, ctx, userId);
      throw authErrors.invalidCredentials();
    }

    // 用户状态复核
    const user = await this.prisma.sysUser.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw authErrors.userDisabled();
    }

    // 一次性消费：验证通过才消费（del 返回 false = 并发重放/刚好过期，拒绝）
    const consumed = await this.cache.del(CacheKeys.AUTH_MFA_PENDING(claims.jti));
    if (!consumed) {
      throw authErrors.invalidAccessToken('MFA 待验令牌已使用或已过期，请重新登录');
    }

    // 验证通过即抹掉账号维度失败历史（与 LoginAttemptService.clear 同理）
    await this.mfaAttempt.clearAccount(claims.tid, claims.un);

    const sessionId = await this.session.createSession({
      userId: claims.sub,
      tenantId: claims.tid,
      username: claims.un,
      isSuper: claims.sup,
      device: ctx.device,
      ip: ctx.ip,
    });

    const tokens = await this.issueTokens({
      userId: claims.sub,
      tenantId: claims.tid,
      username: claims.un,
      isSuper: claims.sup,
      sessionId,
    });
    await this.session.saveRefreshHash(sessionId, tokens.refreshToken);

    this.logger.log(
      `MFA 二次验证通过并建立会话 userId=${claims.sub} tenantId=${claims.tid} sid=${sessionId}`,
    );
    return tokens;
  }

  /**
   * 刷新：滑动过期 + 令牌旋转。
   *
   * 旋转语义：refresh token 一次性——用掉即轮换，旧令牌立即失效。
   * 为避免「读旧哈希 → 签发 → 覆盖新哈希」三段式的 TOCTOU 竞态，采用单 key
   * Lua CAS（{@link SessionService.casRotateRefresh}）作为唯一提交点：
   *   1. 先签发新令牌（纯本地计算，无副作用）；
   *   2. 滑动会话 TTL（提交点之前的预写；失败则旧 token 仍有效、可重试）；
   *   3. CAS 比对旧哈希，匹配才覆盖新哈希——并发重放/陈旧 token 在此被拒。
   *
   * Redis 不可用时不上抛降级——刷新属正确性敏感操作，宁可让前端重新登录，
   * 也不能签发无会话的令牌。
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    // 流程概览：
    //   验签 → 校验令牌类型与会话 ID → 查会话 → 计算旧令牌哈希
    //   → 签发新令牌 → 滑动会话 TTL → CAS 原子旋转（旧令牌在此作废）→ 返回新令牌
    if (!refreshToken) {
      throw authErrors.invalidRefreshToken();
    }

    // 验签 + 有效期校验：过期、篡改、签名不匹配一律按「令牌无效」处理，
    // 不区分具体失败原因，避免向客户端泄露校验细节
    let claims: RefreshTokenPayload;
    try {
      claims = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    }
    catch {
      throw authErrors.invalidRefreshToken();
    }

    // 校验令牌类型与关键载荷：typ 必须是 refresh（防 access / mfa-pending 令牌冒用刷新接口）；
    // sub 与 sid 缺一不可——sid 是后续查会话的唯一入口
    const sessionId = claims.sid;
    if (claims.typ !== TOKEN_TYPE.REFRESH || !claims.sub || !sessionId) {
      throw authErrors.invalidRefreshToken();
    }

    // 查会话（以 sid 为准，不看令牌内容）：missing = 会话不存在（已登出/已过期/被踢），
    // 令牌无意义直接拒；unavailable = Redis 故障，属正确性敏感路径，上抛让前端稍后重试
    const lookup = await this.session.lookupSession(sessionId);
    if (lookup.status === 'missing') {
      throw authErrors.invalidRefreshToken();
    }
    if (lookup.status === 'unavailable' || !lookup.record) {
      throw authErrors.unavailable('会话服务暂不可用，请稍后重试');
    }

    const record = lookup.record;
    // 旧令牌哈希：CAS 的比对基准。Redis 只存摘要不存明文，库泄露不等于令牌泄露
    const expectedHash = hashCacheToken(refreshToken);

    // 步骤 1：先签发新令牌（纯本地计算，无副作用）
    // 顺序要求：必须早于提交点。此时失败不会改动任何会话状态，客户端可拿旧令牌重试
    const tokens = await this.issueTokens({
      userId: record.userId,
      tenantId: record.tenantId,
      username: record.username,
      isSuper: record.isSuper,
      sessionId,
    });

    // 步骤 2：滑动会话 TTL（提交点之前的「预写」）
    // 只续期会话主体，不碰 refresh 摘要；这里失败则旧令牌仍然有效，重试即可
    await this.session.touchSession(record);

    // 步骤 3：唯一提交点——Lua CAS 原子完成「比对旧哈希 + 写入新哈希」
    // 比对通过 = 本次请求持有当前有效的 refresh token，赢家；比对失败 = 令牌已被轮换
    // （并发重放或陈旧令牌），直接拒绝。新令牌含随机 jti，保证与旧令牌字符串不同，
    // 覆盖后旧令牌立即失效（否则同一秒内签发会得到相同字符串，旋转形同虚设）
    const rotated = await this.session.casRotateRefresh(
      sessionId,
      expectedHash,
      tokens.refreshToken,
    );
    if (!rotated) {
      throw authErrors.invalidRefreshToken();
    }

    // 走到这里说明旧令牌已作废、新令牌已生效，返回给客户端保存
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

  /**
   * MFA 验证失败处理：挑战维度 + 账号维度双计数。
   * 挑战内失败达上限 → 作废 pending（用户需重新走密码登录拿新挑战）；
   * 账号维度失败达上限 → 同样作废 pending，并发站内信安全提醒。
   */
  private async handleMfaFailure(
    claims: MfaPendingTokenPayload,
    ctx: LoginContext,
    userId: bigint,
  ): Promise<void> {
    const [challenge, account] = await Promise.all([
      this.mfaAttempt.recordChallengeFailure(claims.jti),
      this.mfaAttempt.recordAccountFailure(claims.tid, claims.un),
    ]);
    this.logMfaAttempt(claims, ctx, LOGIN_MSG.MFA_INVALID, userId);

    if (account.exhausted) {
      this.notifyMfaLocked(claims, ctx);
    }
    if (challenge.exhausted || account.exhausted) {
      await this.cache.del(CacheKeys.AUTH_MFA_PENDING(claims.jti));
    }
  }

  /** MFA 阶段登录日志（fire-and-forget，同 logAttempt 纪律；入参为 pendingToken claims 而非 LoginDto） */
  private logMfaAttempt(
    claims: MfaPendingTokenPayload,
    ctx: LoginContext,
    msg: LoginMsg,
    userId?: bigint,
  ): void {
    void this.loginLog.append({
      tenantId: BigInt(claims.tid),
      userId: userId ?? null,
      username: claims.un,
      ip: ctx.ip,
      device: ctx.device,
      status: LoginLogStatus.FAILURE,
      msg,
    });
  }

  /** MFA 账号维度锁定时的站内信安全提醒（fire-and-forget：投递失败不阻断登录链路） */
  private notifyMfaLocked(claims: MfaPendingTokenPayload, ctx: LoginContext): void {
    void this.messageCenter
      .sendDirect(MessageTemplateChannel.INNER, {
        tenantId: BigInt(claims.tid),
        recipientId: claims.sub,
        title: '账号安全提醒',
        content:
          `您的账号连续多次 MFA 验证码错误（最近来自 IP ${ctx.ip}），`
          + `MFA 验证已临时锁定 ${MFA_VERIFY_LIMITS.accountWindowMinutes} 分钟。`
          + '若非本人操作，请尽快修改密码并检查 MFA 绑定状态。',
        category: 'SECURITY',
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `MFA 锁定站内信投递失败 userId=${claims.sub}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
  }

  /** 签发 MFA 待验令牌（短 TTL + jti 一次性消费标记） */
  private async issueMfaPendingToken(identity: {
    userId: string;
    tenantId: string;
    username: string;
    isSuper: boolean;
  }): Promise<LoginResult> {
    const jti = crypto.randomUUID();
    const payload: MfaPendingTokenPayload = {
      sub: identity.userId,
      tid: identity.tenantId,
      un: identity.username,
      sup: identity.isSuper,
      jti,
      typ: TOKEN_TYPE.MFA_PENDING,
    };
    const pendingToken = await this.jwtService.signAsync(payload, {
      expiresIn: MFA_PENDING_TTL_SECONDS,
    });
    await this.cache.set(
      CacheKeys.AUTH_MFA_PENDING(jti),
      '1',
      MFA_PENDING_TTL_SECONDS,
    );
    return { mfaRequired: true, pendingToken, expiresIn: MFA_PENDING_TTL_SECONDS };
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
      jti: crypto.randomUUID(),
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
