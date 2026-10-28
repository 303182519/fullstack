import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWindow } from '../../src/window';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('openWindow', () => {
  it('应调用 window.open 打开 URL', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openWindow('https://example.com');

    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('应支持自定义 target', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openWindow('https://example.com', { target: '_self' });

    expect(spy).toHaveBeenCalledWith('https://example.com', '_self', 'noopener,noreferrer');
  });

  it('secure 为 false 时不应设置安全特性', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openWindow('https://example.com', { secure: false });

    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', undefined);
  });

  it('非浏览器环境应直接返回', () => {
    vi.stubGlobal('window', undefined);

    expect(() => openWindow('https://example.com')).not.toThrow();
  });
});
