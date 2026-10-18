import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { CanActivate, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { TOKEN_TYPE } from '@/shared/auth/auth.constants.js';
import { authErrors } from '@/shared/auth/auth.errors.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { RequestContextService } from '../context/request-context.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/** access 令牌载荷的最小读取形状（字段缺失一律视为非法令牌） */
interface AccessTokenClaims {
  sub?: string;
  sid?: string;
  tid?: string;
  un?: string;
  sup?: boolean;
  typ?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthPrincipal;
}

const BEARER_PREFIX = 'bearer ';

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header)
    return undefined;
  if (!header.toLowerCase().startsWith(BEARER_PREFIX))
    return undefined;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * 全局 JWT 鉴权守卫（拒绝优先：未标 @Public 的路由默认需要登录）。
 *
 * 单一 JWT 机制（刻意不引入 passport，见 ADR-007 决策；也为避免 4 个传递依赖）。
 *
 * 校验顺序：
 * 1. 取 `Authorization: Bearer <token>`；
 * 2. `JwtService.verifyAsync` 校验签名与有效期；
 * 3. 校验 `typ === 'access'`（防止 refresh 令牌被当作 access 使用）；
 * 4. 查 Redis 会话：以**服务端会话**为准（提供强制下线能力）；
 *    - missing -> 401（会话已被下线）；
 *    - ok -> 用会话记录里的身份重建主体；
 *    - unavailable（Redis 故障）-> 仅凭令牌载荷重建主体并**降级放行**（access 有效期短且签名可信，
 *      满足 ADR-007 D1 的「运行时 Redis 故障 → 只读降级」缓解措施）。
 * 5. 主体写入 `request.user` 与 CLS（同一对象引用，非两份数据源）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic)
      return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);
    if (!token)
      throw authErrors.invalidAccessToken('未提供访问令牌');

    const claims = await this.verifyAccessToken(token);
    const principal = await this.resolvePrincipal(claims);

    request.user = principal;
    this.requestContext.setUser(principal);
    return true;
  }

  private async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token);
    }
    catch {
      // 不区分「过期 / 签名错」对外文案，避免给攻击者反馈
      throw authErrors.invalidAccessToken();
    }

    if (
      claims.typ !== TOKEN_TYPE.ACCESS
      || !claims.sub
      || !claims.sid
    ) {
      throw authErrors.invalidAccessToken();
    }
    return claims;
  }

  private async resolvePrincipal(
    claims: AccessTokenClaims,
  ): Promise<AuthPrincipal> {
    const sessionId = claims.sid!;
    const lookup = await this.sessionService.lookupSession(sessionId);

    if (lookup.status === 'missing')
      throw authErrors.sessionRevoked();

    if (lookup.status === 'ok' && lookup.record) {
      const record = lookup.record;
      return {
        userId: record.userId,
        tenantId: record.tenantId,
        username: record.username,
        isSuper: record.isSuper,
        sessionId: record.sessionId,
      };
    }

    // unavailable：Redis 降级，仅凭令牌重建主体（只读放行）
    this.logger.warn(
      `会话存储不可用，按访问令牌降级放行 sid=${sessionId}`,
    );
    return {
      userId: claims.sub!,
      tenantId: claims.tid ?? '',
      username: claims.un ?? '',
      isSuper: claims.sup === true,
      sessionId,
    };
  }
}
