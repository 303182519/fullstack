/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID_STORAGE_KEY, getOrCreateDeviceId } from '../src/index';

// ==================== RN AsyncStorage mock ====================

const rnStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(rnStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      rnStore.set(key, value);
      return Promise.resolve();
    },
  },
}));

// ==================== localStorage 内存桩 ====================

const localStorageStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
});

// ==================== getOrCreateDeviceId ====================

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    localStorageStore.clear();
    rnStore.clear();
  });

  afterEach(() => {
    // 清理小程序全局桩，避免泄漏到其他用例
    const runtime = globalThis as Record<string, unknown>;
    delete runtime.wx;
    delete runtime.my;
  });

  it('web 平台首次生成后应写入 localStorage，再次调用复用同一 ID', async () => {
    const id1 = await getOrCreateDeviceId('web');

    expect(id1).toBeTruthy();
    expect(localStorageStore.get(DEVICE_ID_STORAGE_KEY)).toBe(id1);

    const id2 = await getOrCreateDeviceId('web');
    expect(id2).toBe(id1);
  });

  it('react-native 平台应读写 AsyncStorage', async () => {
    rnStore.set(DEVICE_ID_STORAGE_KEY, 'rn-stored-id');

    const id = await getOrCreateDeviceId('react-native');
    expect(id).toBe('rn-stored-id');

    rnStore.clear();
    const newId = await getOrCreateDeviceId('react-native');
    expect(newId).toBeTruthy();
    expect(rnStore.get(DEVICE_ID_STORAGE_KEY)).toBe(newId);
  });

  it('mini-program 平台应优先读取微信小程序存储', async () => {
    (globalThis as Record<string, unknown>).wx = {
      getStorageSync: (key: string) => (key === DEVICE_ID_STORAGE_KEY ? 'wx-id' : null),
      setStorageSync: vi.fn(),
    };

    const id = await getOrCreateDeviceId('mini-program');
    expect(id).toBe('wx-id');
  });

  it('mini-program 平台无 wx 时应回落支付宝 my 存储', async () => {
    (globalThis as Record<string, unknown>).my = {
      getStorageSync: ({ key }: { key: string }) =>
        (key === DEVICE_ID_STORAGE_KEY ? { data: 'ali-id' } : null),
      setStorageSync: vi.fn(),
    };

    const id = await getOrCreateDeviceId('mini-program');
    expect(id).toBe('ali-id');
  });

  it('mini-program 平台无任何存储时应生成新 ID 并尝试写入', async () => {
    const setStorageSync = vi.fn();
    (globalThis as Record<string, unknown>).wx = {
      getStorageSync: () => null,
      setStorageSync,
    };

    const id = await getOrCreateDeviceId('mini-program');

    expect(id).toBeTruthy();
    expect(setStorageSync).toHaveBeenCalledWith(DEVICE_ID_STORAGE_KEY, id);
  });
});
