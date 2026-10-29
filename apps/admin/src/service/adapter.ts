import type { BackendEnvelope, RequestAdapter } from '@fedstack/service';
import { createRequest } from '@fedstack/axios';

import { getRouter } from '@/features/router/router-ref';
import { useAuthStore } from '@/store/auth';

import { getMessageApi, getModalApi } from './antd-holder';

/**
 * 续签专用请求实例，独立于主 request。
 *
 * 三个原因：
 *   1. 破循环依赖：request.ts import adapter，adapter 里的续签若再走主 request 就成环。
 *   2. 静默：页面刷新后的恢复性续签失败不该弹错误 toast（用户看到的是守卫跳登录页）。
 *   3. 不参与主实例的续签分岔：续签请求拿到过期码时若再走 backEndFail 的刷新分支，
 *      会 await 自己那次还没完成的刷新，永久挂起（isRefreshTokenRequest 的注释）。
 */
const refreshRequest = createRequest<BackendEnvelope<{ accessToken: string }>, { accessToken: string }>(
  {
    baseURL: import.meta.env.PUBLIC_API_BASE_URL,
    withCredentials: true,
  },
  {
    transform: response => response.data.data,
  },
);

/** i18n 兜底：阶段 7 才接正式 i18n，这里只覆盖 service 层会用到的 key */
const zhCN: Record<string, string> = {
  'common.error': '错误',
  'request.logoutMsg': '登录状态已失效，请重新登录',
};

/**
 * RequestAdapter 的 web 端实现。
 *
 * 对齐 D5 决策：accessToken 存 Zustand 内存；refresh token 在 HttpOnly Cookie 里（JS 不可读），
 * 所以 getRefreshToken 返回哑值、setAuth 忽略 refreshToken，真正交换靠 withCredentials 带 Cookie。
 */
export const adapter: RequestAdapter = {
  refreshTokenUrl: '/auth/refresh',

  getToken: () => useAuthStore.getState().accessToken,

  // Cookie 里的 refresh token JS 读不到；fetchRefreshToken 也不消费这个入参
  getRefreshToken: () => '',

  async fetchRefreshToken() {
    const data = await refreshRequest({ method: 'POST', url: '/auth/refresh' });
    return { refreshToken: 'cookie', token: data.accessToken };
  },

  setAuth: ({ token }) => useAuthStore.getState().setToken(token),

  resetAuth: () => useAuthStore.getState().clear(),

  redirectToLogin: (redirectPath) => {
    // 已在登录页时不重复跳转；redirect 指向登录页自身也没有回跳意义
    if (window.location.pathname.startsWith('/login')) {
      return;
    }
    const redirect = redirectPath && !redirectPath.startsWith('/login') ? redirectPath : undefined;
    getRouter().navigate({
      replace: true,
      search: redirect ? { redirect } : {},
      to: '/login',
    });
  },

  getCurrentPath: () => window.location.pathname + window.location.search,

  showErrorMessage: (msg, onClose) => {
    getMessageApi()?.open({ content: msg, onClose, type: 'error' });
  },

  showErrorModal: ({ content, maskClosable, onConfirm, title }) => {
    getModalApi()?.error({ content, maskClosable, onOk: onConfirm, title });
  },

  t: key => zhCN[key] ?? key,
};
