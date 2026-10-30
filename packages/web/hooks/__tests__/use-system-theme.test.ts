import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemTheme } from '../src/use-system-theme';

type Listener = (event: MediaQueryListEvent) => void;

let listeners: Set<Listener>;
let matches: boolean;

beforeEach(() => {
  listeners = new Set();
  matches = false;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQueryList),
  });
});

describe('useSystemTheme', () => {
  it('根据 prefers-color-scheme 返回主题名', () => {
    const { result } = renderHook(() => useSystemTheme());

    expect(result.current.themeName).toBe('light');
    expect(result.current.isDarkMode).toBe(false);
    expect(result.current.isLightMode).toBe(true);
  });

  it('系统主题切换时同步更新', () => {
    const { result } = renderHook(() => useSystemTheme());

    act(() => {
      matches = true;
      listeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current.themeName).toBe('dark');
    expect(result.current.isDarkMode).toBe(true);
    expect(result.current.isLightMode).toBe(false);
  });

  it('卸载后移除监听', () => {
    const { unmount } = renderHook(() => useSystemTheme());
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
