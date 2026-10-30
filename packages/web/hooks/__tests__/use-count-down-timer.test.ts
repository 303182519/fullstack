import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCountDownTimer from '../src/use-count-down-timer';

describe('useCountDownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 后进入倒计时并按秒展示', () => {
    const { result } = renderHook(() => useCountDownTimer(10));

    expect(result.current.isCounting).toBe(false);

    act(() => {
      result.current.start();
    });

    expect(result.current.isCounting).toBe(true);
    expect(result.current.count).toBeGreaterThan(0);
    expect(result.current.count).toBeLessThanOrEqual(10);
  });

  it('stop 结束倒计时', () => {
    const { result } = renderHook(() => useCountDownTimer(10));

    act(() => {
      result.current.start(3);
    });
    expect(result.current.count).toBeLessThanOrEqual(3);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isCounting).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('start 可覆盖默认秒数', () => {
    const { result } = renderHook(() => useCountDownTimer(10));

    act(() => {
      result.current.start(2);
    });
    expect(result.current.count).toBeLessThanOrEqual(2);
  });
});
