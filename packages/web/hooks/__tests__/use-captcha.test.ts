import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCaptcha from '../src/use-captcha';

describe('useCaptcha', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('校验通过后调用 request 并进入倒计时', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const validateTarget = vi.fn(() => true);

    const { result } = renderHook(() =>
      useCaptcha('获取验证码', undefined, { request, seconds: 5, validateTarget }),
    );

    await act(async () => {
      await result.current.getCaptcha('13800138000');
    });

    expect(validateTarget).toHaveBeenCalledWith('13800138000');
    expect(request).toHaveBeenCalledWith('13800138000');
    expect(result.current.isCounting).toBe(true);
    expect(result.current.label).toMatch(/秒后重新获取/);
  });

  it('校验失败时不发起请求', async () => {
    const request = vi.fn();

    const { result } = renderHook(() =>
      useCaptcha('获取验证码', undefined, { request, validateTarget: () => false }),
    );

    await act(async () => {
      await result.current.getCaptcha('not-a-phone');
    });

    expect(request).not.toHaveBeenCalled();
    expect(result.current.isCounting).toBe(false);
  });

  it('默认校验规则接受合法手机号、拒绝非法目标', async () => {
    const request = vi.fn();

    const { result } = renderHook(() => useCaptcha('获取验证码', undefined, { request }));

    await act(async () => {
      await result.current.getCaptcha('13800138000');
    });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.getCaptcha('abc');
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.isCounting).toBe(true);
  });
});
