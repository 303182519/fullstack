import type { BackendEnvelope } from '@fedstack/service';

import { useAuthStore } from '@/store/auth';

import { adapter } from '../adapter';
import { request } from '../request';

/**
 * admin-api 认证接口层。契约见 apps/admin-api/src/modules/auth/auth.controller.ts。
 *
 * 登录 / 验证码 / MFA 都标了 skipErrorMsg：这些错误由登录页按 bizCode 分流成表单级提示，
 * 不要拦截器的兜底 toast。
 */

/** 与 admin-api 的 AuthBizCode 对齐（shared/auth/auth.errors.ts），只列前端要分流的 */
export const AuthBizCode = {
  ACCOUNT_LOCKED: '10A03',
  CAPTCHA_INVALID: '10A05',
  CAPTCHA_REQUIRED: '10A04',
  INVALID_CREDENTIALS: '10A02',
  TENANT_UNAVAILABLE: '10A07',
  USER_DISABLED: '10A06',
} as const;

export interface CaptchaResponse {
  captchaId: string;
  expiresIn: number;
  svg: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface MfaPendingResponse {
  expiresIn: number;
  mfaRequired: true;
  pendingToken: string;
}

export type LoginResponse = MfaPendingResponse | TokenResponse;

export interface LoginPayload {
  captchaId?: string;
  captchaText?: string;
  password: string;
  tenantCode: string;
  username: string;
}

export interface MfaVerifyPayload {
  code: string;
  pendingToken: string;
}

export interface RoleBrief {
  dataScope: string;
  id: string;
  roleCode: string;
  roleName: string;
}

export interface Profile {
  avatar?: null | string;
  email?: null | string;
  gender?: null | string;
  id: string;
  isSuper: boolean;
  nickname?: null | string;
  phone?: null | string;
  roles: RoleBrief[];
  status: string;
  tenantId: string;
  username: string;
}

export function fetchCaptcha() {
  return request<CaptchaResponse>({ method: 'GET', skipErrorMsg: true, url: '/auth/captcha' });
}

export function login(data: LoginPayload) {
  return request<LoginResponse>({ data, method: 'POST', skipErrorMsg: true, url: '/auth/login' });
}

export function verifyMfa(data: MfaVerifyPayload) {
  return request<TokenResponse>({ data, method: 'POST', skipErrorMsg: true, url: '/auth/mfa/verify' });
}

export function fetchProfile() {
  return request<Profile>({ method: 'GET', url: '/auth/profile' });
}

export function logout() {
  return request<null>({ method: 'POST', skipErrorMsg: true, url: '/auth/logout' });
}

/**
 * 页面刷新后的静默续签：内存 token 丢了，用 HttpOnly Cookie 换一个回来。
 * 失败只清本地、不跳转——跳不跳登录页是路由守卫的职责（在 /login 时跳转会造成自指）。
 */
export async function restoreSession(): Promise<boolean> {
  try {
    const { token } = await adapter.fetchRefreshToken('');
    useAuthStore.getState().setToken(token);
    return true;
  }
  catch {
    useAuthStore.getState().clear();
    return false;
  }
}

/** 从 catch 到的错误里解出后端 bizCode / message（信封挂在 error.response.data 上） */
export function resolveApiError(error: unknown): { bizCode?: string; message: string } {
  const err = error as { message?: string; response?: { data?: Partial<BackendEnvelope> } } | undefined;
  const envelope = err?.response?.data;
  return {
    bizCode: envelope?.bizCode != null ? String(envelope.bizCode) : undefined,
    message: envelope?.message || err?.message || '请求失败，请稍后重试',
  };
}
