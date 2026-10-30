import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useLoading from '../src/use-loading';

describe('useLoading', () => {
  it('默认 false，startLoading / endLoading 可切换', () => {
    const { result } = renderHook(() => useLoading());

    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.startLoading();
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.endLoading();
    });
    expect(result.current.loading).toBe(false);
  });

  it('支持初始值', () => {
    const { result } = renderHook(() => useLoading(true));
    expect(result.current.loading).toBe(true);
  });
});
