import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';

/**
 * 认证模块业务错误码（MMSNN 规范，见 common/response/base.response.ts 的注释）。
 *
 * 10 = 认证模块编号；A = 调用方/请求错误，B = 系统内部/依赖错误。
 * 集中定义在此，避免错误码在 controller / service / guard 里各写一遍字符串。
 */
export const AuthBizCode = {
  /** 密码不符合复杂度要求 */
  PASSWORD_POLICY: '10A01',
  /** 用户名或密码错误 */
  INVALID_CREDENTIALS: '10A02',
  /** 账号因连续失败被锁定 */
  ACCOUNT_LOCKED: '10A03',
  /** 需要图形验证码 */
  CAPTCHA_REQUIRED: '10A04',
  /** 图形验证码错误或已失效 */
  CAPTCHA_INVALID: '10A05',
  /** 账号已被禁用 */
  USER_DISABLED: '10A06',
  /** 租户不存在 / 已停用 / 已过期 */
  TENANT_UNAVAILABLE: '10A07',
  /** access token 缺失 / 非法 / 过期 */
  INVALID_ACCESS_TOKEN: '10A08',
  /** 会话已被强制下线或不存在 */
  SESSION_REVOKED: '10A09',
  /** 新密码近期已使用过（密码历史） */
  PASSWORD_REUSE: '10A10',
  /** refresh token 缺失 / 非法 / 过期 / 已被旋转 */
  INVALID_REFRESH_TOKEN: '10A11',
  /** 无权访问该资源 */
  FORBIDDEN: '10A12',
  /** 依赖不可用（Redis 会话存储等），登录/刷新无法保证正确性 */
  AUTH_UNAVAILABLE: '10B01',
} as const;

/** 通用认证错误工厂：统一携带 bizCode，供 GlobalExceptionsFilter 透出 */
function authError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const authErrors = {
  passwordPolicy: (message: string) =>
    authError(message, HttpStatus.BAD_REQUEST, AuthBizCode.PASSWORD_POLICY),
  passwordReuse: () =>
    authError(
      '新密码不能与最近使用过的密码相同',
      HttpStatus.BAD_REQUEST,
      AuthBizCode.PASSWORD_REUSE,
    ),
  invalidCredentials: () =>
    authError(
      '用户名或密码错误',
      HttpStatus.UNAUTHORIZED,
      AuthBizCode.INVALID_CREDENTIALS,
    ),
  accountLocked: (minutes: number) =>
    authError(
      `账号已锁定，请 ${minutes} 分钟后重试`,
      HttpStatus.TOO_MANY_REQUESTS,
      AuthBizCode.ACCOUNT_LOCKED,
    ),
  captchaRequired: () =>
    authError(
      '请填写图形验证码',
      HttpStatus.BAD_REQUEST,
      AuthBizCode.CAPTCHA_REQUIRED,
    ),
  captchaInvalid: () =>
    authError(
      '图形验证码错误或已失效',
      HttpStatus.BAD_REQUEST,
      AuthBizCode.CAPTCHA_INVALID,
    ),
  userDisabled: () =>
    authError('账号已被禁用', HttpStatus.FORBIDDEN, AuthBizCode.USER_DISABLED),
  tenantUnavailable: () =>
    authError(
      '租户不存在或已停用',
      HttpStatus.UNAUTHORIZED,
      AuthBizCode.TENANT_UNAVAILABLE,
    ),
  invalidAccessToken: (message = '登录状态已失效，请重新登录') =>
    authError(message, HttpStatus.UNAUTHORIZED, AuthBizCode.INVALID_ACCESS_TOKEN),
  sessionRevoked: () =>
    authError(
      '会话已被登出，请重新登录',
      HttpStatus.UNAUTHORIZED,
      AuthBizCode.SESSION_REVOKED,
    ),
  invalidRefreshToken: () =>
    authError(
      '登录状态已失效，请重新登录',
      HttpStatus.UNAUTHORIZED,
      AuthBizCode.INVALID_REFRESH_TOKEN,
    ),
  forbidden: (message = '无权访问该资源') =>
    authError(message, HttpStatus.FORBIDDEN, AuthBizCode.FORBIDDEN),
  unavailable: (message = '认证服务暂不可用，请稍后重试') =>
    authError(message, HttpStatus.SERVICE_UNAVAILABLE, AuthBizCode.AUTH_UNAVAILABLE),
} as const;
