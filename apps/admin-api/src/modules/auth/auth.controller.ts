import type { Request, Response } from 'express';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '@/common/constants/auth.js';
import { IsProduction } from '@/common/constants/environment.js';
import { Cookie, CurrentUser, Public } from '@/common/decorators/index.js';
import {
  DEFAULT_DEVICE,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '@/shared/auth/auth.constants.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { AuthService } from './auth.service.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据，
// import type 会把元数据擦成 Object 导致校验失效；@ApiOkResponse({ type }) 也需要类引用。
import {
  CaptchaResponseDto,
  LoginDto,
  ProfileResponseDto,
  TokenResponseDto,
} from './dto/index.js';

/** 取客户端 IP：优先 req.ip（cookieParser/express 已解析），回退 socket 地址 */
function resolveClientIp(req: Request, fallback: string): string {
  return req.ip || req.socket?.remoteAddress || fallback;
}

/** 取设备标识：User-Agent 截断到 200 字符（避免超长 UA 撑爆审计字段） */
function resolveDevice(req: Request): string {
  const ua = req.headers['user-agent'];
  if (typeof ua !== 'string' || !ua)
    return DEFAULT_DEVICE;
  return ua.slice(0, 200);
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @Throttle({ default: AUTH_THROTTLE.captcha })
  @Get('captcha')
  @ApiOperation({ summary: '获取图形验证码' })
  @ApiOkResponse({ type: CaptchaResponseDto })
  async captcha(): Promise<CaptchaResponseDto> {
    return this.authService.issueCaptcha();
  }

  @Public()
  @Throttle({ default: AUTH_THROTTLE.login })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '账号密码登录' })
  @ApiOkResponse({ type: TokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const tokens = await this.authService.login(dto, {
      ip: resolveClientIp(req, DEFAULT_DEVICE),
      device: dto.device?.trim() || resolveDevice(req),
    });
    this.writeRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
    };
  }

  @Public()
  @Throttle({ default: AUTH_THROTTLE.refresh })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新访问令牌（滑动过期）' })
  @ApiOkResponse({ type: TokenResponseDto })
  async refresh(
    @Cookie(REFRESH_COOKIE_NAME) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const tokens = await this.authService.refresh(refreshToken);
    this.writeRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
    };
  }

  @Throttle({ default: AUTH_THROTTLE.logout })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出当前会话' })
  async logout(
    @CurrentUser() user: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    // 先删会话再清 Cookie：删除失败会 503，此时保留 Cookie 让客户端可重试；
    // 若先清 Cookie 而删除失败，客户端会在本地登出但服务端会话仍存活（不一致）。
    await this.authService.logout(user);
    this.clearRefreshCookie(res);
    return null;
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async profile(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ProfileResponseDto> {
    return this.authService.profile(user);
  }

  /** 写 refresh token 到 HttpOnly Cookie（7 天滑动过期；生产环境加 Secure） */
  private writeRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: IsProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.sessionService.getSessionTtlSeconds() * 1000,
    });
  }

  /** 清除 refresh Cookie（参数需与写入时一致，否则浏览器不会覆盖删除） */
  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: IsProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
