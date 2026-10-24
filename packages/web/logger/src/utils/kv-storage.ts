import type { Platform } from '../types';
import { detectMPRuntime } from './mp-runtime';

/**
 * 跨平台 KV 持久化读取
 *
 * web → localStorage，react-native → AsyncStorage，mini-program → 五端小程序 storage。
 * 任何读取失败（环境不支持、存储异常）都返回 null，由调用方决定降级策略。
 */
export async function getPersistedValue(platform: Platform, key: string): Promise<string | null> {
  try {
    switch (platform) {
      case 'web': {
        if (typeof localStorage === 'undefined') {
          return null;
        }
        return localStorage.getItem(key);
      }
      case 'react-native': {
        const module = await import('@react-native-async-storage/async-storage');
        return await module.default.getItem(key);
      }
      case 'mini-program': {
        const value = detectMPRuntime()?.storage.getStorageSync(key);
        return value || null;
      }
      default:
        return null;
    }
  }
  catch {
    return null;
  }
}

/**
 * 跨平台 KV 持久化写入
 *
 * 写入失败静默忽略——持久化（如上传进度）是优化项，失败不应阻断主流程。
 */
export async function setPersistedValue(platform: Platform, key: string, value: string): Promise<void> {
  try {
    switch (platform) {
      case 'web': {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
        return;
      }
      case 'react-native': {
        const module = await import('@react-native-async-storage/async-storage');
        await module.default.setItem(key, value);
        return;
      }
      case 'mini-program': {
        detectMPRuntime()?.storage.setStorageSync(key, value);
      }
    }
  }
  catch {
    // 忽略错误
  }
}
