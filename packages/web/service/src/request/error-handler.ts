import type { RequestInstance } from '@fedstack/axios';
import type { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import type { BackendEnvelope, RequestAdapter, RequestInstanceState, ServiceCodes } from './types';
import { getAuthorization, isRefreshTokenRequest, showErrorMsg } from './shared';
import { refreshToken } from './token-refresh';

/**
 * 浏览器才有的「关页面前再清一次凭据」兜底。
 *
 * 只判 `typeof window !== 'undefined'` 不够：React Native 把 `window` 指向 global，判断为真，
 * 但它没有 addEventListener，调下去直接 TypeError——弹窗登出这条路会在原生端整个断掉。
 */
function canListenBeforeUnload(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

/** 后端业务错误处理（response.data 的业务码非成功码） */
export async function backEndFail(
  response: AxiosResponse<BackendEnvelope>,
  instance: AxiosInstance,
  request: RequestInstance<any, RequestInstanceState>,
  adapter: RequestAdapter,
  codes: ServiceCodes,
): Promise<AxiosResponse | null> {
  // bizCode 是业务状态码，缺失时回落 HTTP 回声码 code：纯 HTTP 语义失败的响应没有 bizCode
  const responseCode = String(response.data.bizCode ?? response.data.code);
  function handleLogout(): void {
    // 先清凭据再跳：平台的 redirectToLogin 只负责「跳到哪」，清不清由这一层说了算，
    // 否则没在路由里顺手清的平台会带着一份废凭据停在登录页。
    adapter.resetAuth();
    const fullPath = adapter.getCurrentPath();
    adapter.redirectToLogin(fullPath);
  }
  function logoutAndCleanup(): void {
    handleLogout();
    if (canListenBeforeUnload()) {
      window.removeEventListener('beforeunload', handleLogout);
    }
    request.state.errMsgStack = request.state.errMsgStack.filter(msg => msg !== response.data.message);
  }
  // 登出码：直接登出 + 跳转
  if (codes.logout.includes(responseCode)) {
    adapter.showErrorMessage(adapter.t('request.logoutMsg'));
    handleLogout();
    return null;
  }
  // 弹窗登出码：弹窗确认后登出
  if (codes.modalLogout.includes(responseCode) && !request.state.errMsgStack?.includes(response.data.message)) {
    request.state.errMsgStack = [...(request.state.errMsgStack || []), response.data.message];
    if (canListenBeforeUnload()) {
      window.addEventListener('beforeunload', handleLogout);
    }
    adapter.showErrorModal({
      content: response.data.message,
      maskClosable: false,
      onConfirm() {
        logoutAndCleanup();
      },
      title: adapter.t('common.error'),
    });
    return null;
  }
  // 续签接口自己拿到过期码时不能再去续签：它会 await 自己那次还没完成的刷新，把它和所有
  // 等着刷新的请求一起永久挂起。这里放行让它 reject，由 handleRefreshToken 跳登录页。
  //
  // 已经续签重发过一次的也不再刷：重发的请求会完整走一遍响应拦截器，失败了就再次落回这里，
  // onBackendFail 本身不设递归上限。而刷完还是过期码说明问题不在 token 上（多副本没同步、
  // 时钟偏移，或者这个码根本就不该配进 expiredToken），此时 refreshToken 的一秒复用窗口会让
  // 第二次起直接返回缓存结果——连一次网络往返的退避都没有，就是一个纯粹的热循环重发。
  const canRefresh
    = codes.expiredToken.includes(responseCode)
      && !isRefreshTokenRequest(response.config, adapter)
      && !response.config.isTokenRefreshRetry;
  if (canRefresh) {
    const success = await refreshToken(adapter);
    if (success) {
      response.config.headers.set('Authorization', getAuthorization(adapter));
      response.config.isTokenRefreshRetry = true;
      return instance.request(response.config) as Promise<AxiosResponse>;
    }
  }
  return null;
}

/** 网络 / 请求层错误处理 */
export function handleError(
  error: AxiosError<Partial<BackendEnvelope>>,
  request: RequestInstance<any, RequestInstanceState>,
  adapter: RequestAdapter,
  codes: ServiceCodes,
): void {
  // 不看 error.code 是不是 BACKEND_ERROR：真实 HTTP 错误带的是 axios 自己的
  // ERR_BAD_REQUEST / ERR_BAD_RESPONSE，认它就只剩 error.message 那句"status code 401"。
  // 有信封就用信封的话，没有（超时、断网）自然回落到 axios 的文案。
  const message = error.response?.data?.message || error.message;
  const backendErrorCode = String(error.response?.data?.bizCode ?? error.response?.data?.code ?? '');
  // 登出码的提示已由 backEndFail 弹过（消息或弹窗），这里再弹一次就是两条
  if (codes.logout.includes(backendErrorCode) || codes.modalLogout.includes(backendErrorCode)) {
    return;
  }
  // token 过期码不展示错误（正在刷新重试）
  if (codes.expiredToken.includes(backendErrorCode)) {
    return;
  }
  showErrorMsg(adapter, request.state, message);
}
