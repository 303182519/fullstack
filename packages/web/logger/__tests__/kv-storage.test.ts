/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPersistedValue, setPersistedValue } from '../src/index';
import { createMockMpFs, createMyLikeGlobal, createWxLikeGlobal } from './mock-mp-runtime';

// ==================== 平台存储桩 ====================

const rnStore = new Map<string, string>();

// RN AsyncStorage 模块 mock（kv-storage 的动态 import 被 vi.mock 拦截）
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(rnStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      rnStore.set(key, value);
      return Promise.resolve();
    },
  },
}));

const localStorageStore = new Map<string, string>();

function stubLocalStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore.set(key, value);
    },
    removeItem: (key: string) => {
      localStorageStore.delete(key);
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorageStore.clear();
  rnStore.clear();
});

const KEY = 'fedstack_logger_last_uploaded';

// ==================== kv-storage ====================

describe('kvStorage', () => {
  it('web 平台走 localStorage 读写往返', async () => {
    stubLocalStorage();

    await setPersistedValue('web', KEY, '1700000000000');
    expect(localStorageStore.get(KEY)).toBe('1700000000000');
    expect(await getPersistedValue('web', KEY)).toBe('1700000000000');
    expect(await getPersistedValue('web', 'not-exist')).toBeNull();
  });

  it('web 平台无 localStorage 时读返回 null、写静默忽略', async () => {
    vi.stubGlobal('localStorage', undefined);

    expect(await getPersistedValue('web', KEY)).toBeNull();
    await expect(setPersistedValue('web', KEY, '1')).resolves.toBeUndefined();
  });

  it('react-native 平台走 AsyncStorage 读写往返', async () => {
    await setPersistedValue('react-native', KEY, '1700000000123');

    expect(rnStore.get(KEY)).toBe('1700000000123');
    expect(await getPersistedValue('react-native', KEY)).toBe('1700000000123');
  });

  it('mini-program 平台微信形态走 positional storage 读写', async () => {
    const wxStore = new Map<string, string>();
    vi.stubGlobal('wx', createWxLikeGlobal(createMockMpFs().fs, wxStore));

    await setPersistedValue('mini-program', KEY, '1700000000456');

    expect(wxStore.get(KEY)).toBe('1700000000456');
    expect(await getPersistedValue('mini-program', KEY)).toBe('1700000000456');
    expect(await getPersistedValue('mini-program', 'not-exist')).toBeNull();
  });

  it('mini-program 平台支付宝形态的 options 对象被归一化拆解', async () => {
    const myStore = new Map<string, string>();
    vi.stubGlobal('my', createMyLikeGlobal(createMockMpFs().fs, myStore));

    await setPersistedValue('mini-program', KEY, '1700000000789');

    expect(myStore.get(KEY)).toBe('1700000000789');
    expect(await getPersistedValue('mini-program', KEY)).toBe('1700000000789');
  });

  it('mini-program 运行时能力不完整（缺 fs）时读返回 null、写静默忽略', async () => {
    // 只有 storage 没有 getFileSystemManager/env，探测判定为不完整运行时
    vi.stubGlobal('wx', {
      getStorageSync: () => '',
      setStorageSync: () => {},
    });

    expect(await getPersistedValue('mini-program', KEY)).toBeNull();
    await expect(setPersistedValue('mini-program', KEY, '1')).resolves.toBeUndefined();
  });

  it('探测不到任何小程序运行时时读返回 null、写静默忽略', async () => {
    expect(await getPersistedValue('mini-program', KEY)).toBeNull();
    await expect(setPersistedValue('mini-program', KEY, '1')).resolves.toBeUndefined();
  });
});
