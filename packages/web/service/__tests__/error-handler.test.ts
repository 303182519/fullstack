import type { RequestInstance } from '@fedstack/axios';
import type { AxiosError, AxiosResponse } from 'axios';
import type { BackendEnvelope, RequestAdapter, RequestInstanceState, ServiceCodes } from '../src/request/types';
import { BACKEND_ERROR_CODE } from '@fedstack/axios';
import { AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backEndFail, handleError } from '../src/request/error-handler';
import { resetTokenRefresh } from '../src/request/token-refresh';

// 刷新是模块级单例，刷完还有一秒的结果复用窗口，不重置的话上个用例的结果会漏给下一个
afterEach(() => {
  resetTokenRefresh();
  vi.unstubAllGlobals();
});

const TEST_CODES: ServiceCodes = {
  success: '0000',
  logout: ['8888'],
  modalLogout: ['7777'],
  expiredToken: ['9999'],
};

function createMockAdapter(overrides: Partial<RequestAdapter> = {}): RequestAdapter {
  return {
    getCurrentPath: vi.fn(() => '/dashboard'),
    getRefreshToken: vi.fn(() => 'refresh-tok'),
    getToken: vi.fn(() => 'access-tok'),
    redirectToLogin: vi.fn(),
    refreshTokenUrl: '/auth/refreshToken',
    resetAuth: vi.fn(),
    setAuth: vi.fn(),
    showErrorMessage: vi.fn(),
    showErrorModal: vi.fn(),
    t: vi.fn((key: string) => key),
    fetchRefreshToken: vi.fn(async () => ({ refreshToken: 'new-r', token: 'new' })),
    ...overrides,
  };
}

function createMockRequest(stateOverrides: Partial<RequestInstanceState> = {}) {
  return {
    state: {
      errMsgStack: [],
      ...stateOverrides,
    },
  } as unknown as RequestInstance<any, RequestInstanceState>;
}

function createMockResponse(bizCode: string, message = 'error', config: Record<string, unknown> = {}) {
  return {
    data: { bizCode, code: 400, data: null, message },
    // 用真的 AxiosHeaders：重试分支走的是 headers.set()，普通对象会静默少掉认证头
    config: { headers: new AxiosHeaders(), ...config },
  } as unknown as AxiosResponse<BackendEnvelope>;
}

describe('backEndFail', () => {
  it('handles logout codes — shows message and redirects', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('8888');
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('request.logoutMsg');
    expect(adapter.resetAuth).toHaveBeenCalled();
    expect(adapter.redirectToLogin).toHaveBeenCalledWith('/dashboard');
  });

  it('handles modalLogout codes — shows modal', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('7777', 'Session expired');
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.showErrorModal).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Session expired',
        title: 'common.error',
      }),
    );
    expect(request.state.errMsgStack).toContain('Session expired');
  });

  it('modalLogout onConfirm triggers logoutAndCleanup', async () => {
    // node 环境没有 window：stub 一个带监听器方法的最小实现，走 canListenBeforeUnload 的浏览器分支
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('7777', 'Session expired');
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    const modalCall = vi.mocked(adapter.showErrorModal).mock.calls[0]![0];
    modalCall.onConfirm();
    expect(adapter.resetAuth).toHaveBeenCalled();
    expect(adapter.redirectToLogin).toHaveBeenCalledWith('/dashboard');
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(request.state.errMsgStack).not.toContain('Session expired');
  });

  it('modalLogout adds beforeunload listener in browser', async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn() });
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('7777', 'modal msg');
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('skips modal if message already in stack', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest({ errMsgStack: ['Session expired'] });
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('7777', 'Session expired');
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(adapter.showErrorModal).not.toHaveBeenCalled();
  });

  it('handles expired token — refreshes and retries', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const retryResponse = { data: { bizCode: '0000', code: 200, data: 'ok', message: '' } };
    const instance = { request: vi.fn().mockResolvedValue(retryResponse) } as any;
    const response = createMockResponse('9999');
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(adapter.fetchRefreshToken).toHaveBeenCalled();
    expect(adapter.setAuth).toHaveBeenCalled();
    expect(instance.request).toHaveBeenCalledWith(response.config);
    // 重试必须带上刷新后的认证头，否则重试的结果还是过期码
    expect((response.config.headers as AxiosHeaders).get('Authorization')).toBe('Bearer access-tok');
    expect(result).toBe(retryResponse);
  });

  it('已经续签重发过一次的请求不再刷新', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('9999', 'expired', { isTokenRefreshRetry: true });
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.fetchRefreshToken).not.toHaveBeenCalled();
    expect(instance.request).not.toHaveBeenCalled();
  });

  it('重试前会在 config 上打标记，让下一轮认得出来', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn().mockResolvedValue({ data: { bizCode: '0000', code: 200 } }) } as any;
    const response = createMockResponse('9999');
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(response.config.isTokenRefreshRetry).toBe(true);
  });

  it('returns null when expired token refresh fails', async () => {
    const adapter = createMockAdapter({
      fetchRefreshToken: vi.fn(async () => {
        throw new Error('refresh failed');
      }),
    });
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('9999');
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(instance.request).not.toHaveBeenCalled();
  });

  it('initializes errMsgStack when undefined for modalLogout', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest({ errMsgStack: undefined as any });
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('7777', 'new msg');
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(adapter.showErrorModal).toHaveBeenCalled();
  });

  it('does not refresh when the expired code comes from the refresh request itself', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('9999', 'expired', { isRefreshToken: true });
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.fetchRefreshToken).not.toHaveBeenCalled();
    expect(instance.request).not.toHaveBeenCalled();
  });

  it('靠 adapter.refreshTokenUrl 认出续签请求，不必等 api 层记得打标记', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    // 没有 isRefreshToken —— 四个 app 里三个都是这么写的
    const response = createMockResponse('9999', 'expired', { url: '/auth/refreshToken' });
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.fetchRefreshToken).not.toHaveBeenCalled();
    expect(instance.request).not.toHaveBeenCalled();
  });

  it('分流业务码时 bizCode 优先于 HTTP 回声码 code', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    // 无 bizCode 时回落 code：纯 HTTP 语义失败的响应没有 bizCode
    const response = {
      data: { code: '8888', data: null, message: 'err' },
      config: { headers: new AxiosHeaders() },
    } as unknown as AxiosResponse<BackendEnvelope>;
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('request.logoutMsg');
    expect(adapter.redirectToLogin).toHaveBeenCalled();
  });

  it('returns null for unknown codes', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('1234');
    const result = await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(result).toBeNull();
  });

  it('skipErrorMsg 不影响登出码自己的提示与跳转', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn() } as any;
    const response = createMockResponse('8888', 'err', { skipErrorMsg: true });
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('request.logoutMsg');
    expect(adapter.resetAuth).toHaveBeenCalled();
    expect(adapter.redirectToLogin).toHaveBeenCalled();
  });

  it('skipErrorMsg 不影响续签后重发', async () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const instance = { request: vi.fn().mockResolvedValue({ data: { bizCode: '0000', code: 200 } }) } as any;
    const response = createMockResponse('9999', 'expired', { skipErrorMsg: true });
    await backEndFail(response, instance, request, adapter, TEST_CODES);
    expect(adapter.fetchRefreshToken).toHaveBeenCalled();
    expect(instance.request).toHaveBeenCalled();
  });
});

describe('handleError', () => {
  it('shows error message for regular errors', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = { code: 'ERR_NETWORK', message: 'Network Error' } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('Network Error', expect.any(Function));
  });

  it('uses the backend message carried by a business failure', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: BACKEND_ERROR_CODE,
      message: 'the backend request error',
      response: { data: { bizCode: '1234', code: 400, message: 'Custom backend error' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('Custom backend error', expect.any(Function));
  });

  it('uses the backend message when the failure came back as a real http status', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 409',
      response: { status: 409, data: { code: 409, message: '该账号已被占用' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('该账号已被占用', expect.any(Function));
  });

  it('skips message for logout codes — backEndFail already showed one', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 401',
      response: { status: 401, data: { bizCode: '8888', code: 401, message: '登录状态已失效，请重新登录' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });

  it('skips message for modalLogout codes', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: BACKEND_ERROR_CODE,
      message: 'error',
      response: { data: { bizCode: '7777', code: 400, message: 'modal error' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });

  it('skips message for expiredToken codes', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: BACKEND_ERROR_CODE,
      message: 'error',
      response: { data: { bizCode: '9999', code: 400, message: 'token expired' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });

  it('skips message for expiredToken codes delivered as http 401', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 401',
      response: { status: 401, data: { bizCode: '9999', code: 401, message: '登录已过期' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });

  it('falls back to error.message when response.data.message is missing', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: BACKEND_ERROR_CODE,
      message: 'the backend request error',
      response: { data: { bizCode: '1234' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('the backend request error', expect.any(Function));
  });

  it('falls back to error.message when there is no response at all', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
      response: undefined,
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('timeout of 10000ms exceeded', expect.any(Function));
  });

  it('falls back to error.message when the body is not an envelope', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_BAD_RESPONSE',
      message: 'Request failed with status code 502',
      response: { status: 502, data: '<html>502 Bad Gateway</html>' },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('Request failed with status code 502', expect.any(Function));
  });

  it('handles a business failure with no code in response', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: BACKEND_ERROR_CODE,
      message: 'err',
      response: { data: { message: 'some msg' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).toHaveBeenCalledWith('some msg', expect.any(Function));
  });

  it('skips the toast when the request opted out with skipErrorMsg', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_BAD_REQUEST',
      config: { skipErrorMsg: true },
      message: 'Request failed with status code 409',
      response: { status: 409, data: { code: 409, message: '用户名已存在' } },
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });

  it('skipErrorMsg 打开时网络错误也不弹提示', () => {
    const adapter = createMockAdapter();
    const request = createMockRequest();
    const error = {
      code: 'ERR_NETWORK',
      config: { skipErrorMsg: true },
      message: 'Network Error',
    } as AxiosError<any>;
    handleError(error, request, adapter, TEST_CODES);
    expect(adapter.showErrorMessage).not.toHaveBeenCalled();
  });
});
