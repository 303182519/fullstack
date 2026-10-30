import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '../src/use-now';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('按 interval 推进当前时间', () => {
    const { result } = renderHook(() => useNow({ interval: 1000 }));
    const before = result.current.now.getTime();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.now).toBeInstanceOf(Date);
    expect(result.current.now.getTime()).toBeGreaterThan(before);
  });

  it('pause 后停止更新，resume 可恢复', () => {
    const { result } = renderHook(() => useNow({ interval: 1000 }));

    act(() => {
      result.current.pause();
    });
    const paused = result.current.now.getTime();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.now.getTime()).toBe(paused);

    act(() => {
      result.current.resume();
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.now.getTime()).toBeGreaterThan(paused);
  });

  it('immediate=false 时不自动开始计时', () => {
    const { result } = renderHook(() => useNow({ immediate: false, interval: 1000 }));
    const before = result.current.now.getTime();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.now.getTime()).toBe(before);
  });
});
