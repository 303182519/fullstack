import { createAppRequest } from '@fedstack/service';

import { adapter } from './adapter';

/**
 * 主请求实例。
 *
 * - baseURL 指向 admin-api（含全局前缀 /api），withCredentials 让 refresh Cookie 跨域带上
 * - 业务码体系见 .env.dev：成功 200；10A08 触发静默续签重试；10A09 直接登出跳登录
 *   （bizCode 优先于 HTTP 回声码匹配，密码错误的 401/10A02 不会误入续签分支）
 */
export const request = createAppRequest({
  adapter,
  axiosConfig: {
    baseURL: import.meta.env.PUBLIC_API_BASE_URL,
    withCredentials: true,
  },
  codes: {
    expiredToken: import.meta.env.PUBLIC_SERVICE_EXPIRED_TOKEN?.split(','),
    logout: import.meta.env.PUBLIC_SERVICE_LOGOUT?.split(','),
    modalLogout: [],
    success: import.meta.env.PUBLIC_SERVICE_SUCCESS_CODE,
  },
});
