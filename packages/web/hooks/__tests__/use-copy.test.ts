import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopy } from '../src/use-copy';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('useCopy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('空文本不触发剪贴板写入', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    const { result } = renderHook(() => useCopy());

    await act(async () => {
      await expect(result.current.copy('')).resolves.toBe(false);
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('写入成功后记录 copied 与 copiedText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    const { result } = renderHook(() => useCopy());

    await act(async () => {
      await expect(result.current.copy('hello')).resolves.toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);
    expect(result.current.copiedText).toBe('hello');
  });

  it('写入失败时回落为 false 并清空文本', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));

    const { result } = renderHook(() => useCopy());

    await act(async () => {
      await expect(result.current.copy('hello')).resolves.toBe(false);
    });
    expect(result.current.copied).toBe(false);
    expect(result.current.copiedText).toBe('');
  });
});
