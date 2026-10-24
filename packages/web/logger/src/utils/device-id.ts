import type { Platform } from '../types';
import { nanoid } from 'nanoid';
import { DEVICE_ID_STORAGE_KEY } from '../constants';

interface AliStorage {
  getStorageSync?: (options: { key: string }) => { data?: string } | null;
  setStorageSync?: (options: { data: string; key: string }) => void;
}

interface WechatStorage {
  getStorageSync?: (key: string) => string | null;
  setStorageSync?: (key: string, value: string) => void;
}

function getMiniProgramStorage(): { my?: AliStorage; wx?: WechatStorage } {
  const runtime = globalThis as typeof globalThis & {
    my?: AliStorage;
    wx?: WechatStorage;
  };

  return {
    my: runtime.my,
    wx: runtime.wx,
  };
}

/** 获取或生成设备 ID 根据不同平台使用相应的存储方式持久化设备 ID */
export async function getOrCreateDeviceId(platform: Platform): Promise<string> {
  const storedId = await getStoredDeviceId(platform);
  if (storedId) {
    return storedId;
  }

  const newId = nanoid();
  await storeDeviceId(platform, newId);
  return newId;
}

/** 获取已存储的设备 ID */
async function getStoredDeviceId(platform: Platform): Promise<string | null> {
  switch (platform) {
    case 'web': {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      }
      return null;
    }
    case 'react-native': {
      try {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        return await AsyncStorage.default.getItem(DEVICE_ID_STORAGE_KEY);
      }
      catch {
        return null;
      }
    }
    case 'mini-program': {
      try {
        const { my, wx } = getMiniProgramStorage();

        // 微信小程序
        if (wx?.getStorageSync) {
          return wx.getStorageSync(DEVICE_ID_STORAGE_KEY) || null;
        }
        // 支付宝小程序
        if (my?.getStorageSync) {
          const res = my.getStorageSync({ key: DEVICE_ID_STORAGE_KEY });
          return res?.data || null;
        }
      }
      catch {
        return null;
      }
      return null;
    }
    default:
      return null;
  }
}

/** 存储设备 ID */
async function storeDeviceId(platform: Platform, deviceId: string): Promise<void> {
  switch (platform) {
    case 'web': {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }
      break;
    }
    case 'react-native': {
      try {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.default.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }
      catch {
        // 忽略错误
      }
      break;
    }
    case 'mini-program': {
      try {
        const { my, wx } = getMiniProgramStorage();

        // 微信小程序
        if (wx?.setStorageSync) {
          wx.setStorageSync(DEVICE_ID_STORAGE_KEY, deviceId);
        }
        // 支付宝小程序
        if (my?.setStorageSync) {
          my.setStorageSync({ key: DEVICE_ID_STORAGE_KEY, data: deviceId });
        }
      }
      catch {
        // 忽略错误
      }
      break;
    }
  }
}
