import type { MPFileSystemLike } from '../src/index';

// ==================== 内存 mock 文件系统 ====================

export interface MockMpFs {
  /** 归一化文件系统接口（可直接注入 MPStorageAdapter 或包装进五端全局 mock） */
  fs: MPFileSystemLike;
  /** 文件内容表（路径 → 内容），测试可直接断言 */
  files: Map<string, string>;
  /** mkdirSync 被调用的路径记录 */
  mkdirCalls: string[];
  /** 下一次 appendFileSync 抛错一次（模拟 10MB 用户文件限额写满） */
  failNextAppend: () => void;
  /** appendFileSync 持续抛错，直到 stopFailingAppend */
  failAlwaysAppend: () => void;
  /** 恢复 appendFileSync 正常行为 */
  stopFailingAppend: () => void;
}

/**
 * 内存版小程序文件系统：Map<路径, 内容> 模拟。
 *
 * 语义对齐微信 FileSystemManager：readFileSync/unlinkSync/accessSync 对不存在的
 * 路径抛错，appendFileSync 对不存在的文件自动创建。
 */
export function createMockMpFs(): MockMpFs {
  const files = new Map<string, string>();
  const mkdirCalls: string[] = [];
  let failOnce = false;
  let failAlways = false;

  const fs: MPFileSystemLike = {
    appendFileSync: (filePath, data) => {
      if (failAlways || failOnce) {
        failOnce = false;
        throw new Error('ENOSPC: user data path size limit exceeded (test simulated)');
      }
      files.set(filePath, (files.get(filePath) ?? '') + data);
    },
    readFileSync: (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file: ${filePath}`);
      }
      return content;
    },
    writeFileSync: (filePath, data) => {
      files.set(filePath, data);
    },
    readdirSync: (dirPath) => {
      const prefix = `${dirPath}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          if (!rest.includes('/')) {
            names.add(rest);
          }
        }
      }
      return [...names];
    },
    unlinkSync: (filePath) => {
      if (!files.delete(filePath)) {
        throw new Error(`ENOENT: no such file: ${filePath}`);
      }
    },
    mkdirSync: (dirPath) => {
      mkdirCalls.push(dirPath);
    },
    accessSync: (path) => {
      if (files.has(path)) {
        return;
      }
      const prefix = `${path}/`;
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          return;
        }
      }
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    },
  };

  return {
    fs,
    files,
    mkdirCalls,
    failNextAppend: () => {
      failOnce = true;
    },
    failAlwaysAppend: () => {
      failAlways = true;
    },
    stopFailingAppend: () => {
      failAlways = false;
    },
  };
}

// ==================== 五端全局对象 mock ====================

/**
 * 微信形态全局 mock（positional storage，tt/swan/qq 同构）。
 * fs 直接复用内存实现（结构上兼容原始 FileSystemManager 的最小必要子集）。
 */
export function createWxLikeGlobal(fs: MPFileSystemLike, store: Map<string, string>): Record<string, unknown> {
  return {
    env: { USER_DATA_PATH: '/mock_user_data' },
    getFileSystemManager: () => fs,
    getStorageSync: (key: string) => store.get(key) ?? '',
    setStorageSync: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

/** 支付宝形态全局 mock（options 对象 storage） */
export function createMyLikeGlobal(fs: MPFileSystemLike, store: Map<string, string>): Record<string, unknown> {
  return {
    env: { USER_DATA_PATH: '/mock_user_data' },
    getFileSystemManager: () => fs,
    getStorageSync: (options: { key: string }) => ({ data: store.get(options.key) }),
    setStorageSync: (options: { key: string; data: string }) => {
      store.set(options.key, options.data);
    },
  };
}
