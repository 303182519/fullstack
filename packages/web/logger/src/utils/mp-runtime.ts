/**
 * 小程序运行时探测与归一化
 *
 * 五端（微信 wx / 支付宝 my / 字节 tt / 百度 swan / QQ qq）的全局对象与 API 形态差异
 * 在此统一归一化：文件系统与 KV 存储均以微信 positional 形态为基准，支付宝 storage 的
 * options 对象形态包装为 positional 形态。上层（MPStorageAdapter / kv-storage）只面对
 * 归一化接口，不感知端差异。
 *
 * 注意：tt/swan/qq 按各端官方文档的微信兼容 API 形态实现，未做真机验证。
 */

/** 归一化后的小程序文件系统接口（微信 API 形态为基准，全部为同步方法） */
export interface MPFileSystemLike {
  /** 追加写入文件（utf8），文件不存在时自动创建 */
  appendFileSync: (filePath: string, data: string) => void;
  /** 读取整个文件内容（utf8 文本），文件不存在时抛错 */
  readFileSync: (filePath: string) => string;
  /** 覆盖写入整个文件（utf8） */
  writeFileSync: (filePath: string, data: string) => void;
  /** 列出目录下所有条目名（不含路径） */
  readdirSync: (dirPath: string) => string[];
  /** 删除文件，不存在时抛错 */
  unlinkSync: (filePath: string) => void;
  /** 递归创建目录 */
  mkdirSync: (dirPath: string) => void;
  /** 检查路径是否存在，不存在时抛错 */
  accessSync: (path: string) => void;
}

/** 归一化后的小程序 KV 存储接口（positional 形态为基准） */
export interface MPStorageLike {
  /** 读取字符串值，键不存在或值非字符串时返回空字符串 */
  getStorageSync: (key: string) => string;
  /** 写入字符串值 */
  setStorageSync: (key: string, value: string) => void;
}

/** 小程序厂商标识 */
export type MPVendor = 'my' | 'qq' | 'swan' | 'tt' | 'wx';

/** 归一化后的小程序运行时 */
export interface MPRuntime {
  /** 厂商标识 */
  vendor: MPVendor;
  /** 文件系统 */
  fs: MPFileSystemLike;
  /** KV 存储 */
  storage: MPStorageLike;
  /** 本地用户文件根路径（USER_DATA_PATH） */
  userDataPath: string;
}

/** 原始文件系统形态（各端 FileSystemManager 的最小必要子集） */
interface RawFileSystemLike {
  appendFileSync?: (filePath: string, data: string, encoding?: string) => void;
  readFileSync?: (filePath: string, encoding?: string) => string | ArrayBuffer;
  writeFileSync?: (filePath: string, data: string, encoding?: string) => void;
  readdirSync?: (dirPath: string) => string[];
  unlinkSync?: (filePath: string) => void;
  mkdirSync?: (dirPath: string, recursive?: boolean) => void;
  accessSync?: (path: string) => void;
}

/** 微信形态的全局对象（tt/swan/qq 同构） */
interface WxLikeGlobal {
  getFileSystemManager?: () => RawFileSystemLike;
  env?: { USER_DATA_PATH?: string };
  getStorageSync?: (key: string) => unknown;
  setStorageSync?: (key: string, value: string) => void;
}

/** 支付宝形态的全局对象（storage 为 options 对象形态） */
interface MyLikeGlobal {
  getFileSystemManager?: () => RawFileSystemLike;
  env?: { USER_DATA_PATH?: string };
  getStorageSync?: (options: { key: string }) => { data?: unknown } | null;
  setStorageSync?: (options: { key: string; data: string }) => void;
}

type MPGlobal = MyLikeGlobal | WxLikeGlobal;

const REQUIRED_FS_METHODS: Array<keyof RawFileSystemLike> = [
  'accessSync',
  'appendFileSync',
  'mkdirSync',
  'readdirSync',
  'readFileSync',
  'unlinkSync',
  'writeFileSync',
];

/** 归一化文件系统，任一必要方法缺失时返回 null */
function normalizeFs(rawFs: RawFileSystemLike): MPFileSystemLike | null {
  for (const method of REQUIRED_FS_METHODS) {
    if (typeof rawFs[method] !== 'function') {
      return null;
    }
  }

  return {
    appendFileSync: (filePath, data) => rawFs.appendFileSync?.(filePath, data, 'utf8'),
    readFileSync: (filePath) => {
      const result = rawFs.readFileSync?.(filePath, 'utf8');
      if (typeof result === 'string') {
        return result;
      }
      if (result) {
        return new TextDecoder().decode(result);
      }
      throw new Error(`Failed to read file: ${filePath}`);
    },
    writeFileSync: (filePath, data) => rawFs.writeFileSync?.(filePath, data, 'utf8'),
    readdirSync: dirPath => rawFs.readdirSync?.(dirPath) ?? [],
    unlinkSync: (filePath) => {
      rawFs.unlinkSync?.(filePath);
    },
    mkdirSync: (dirPath) => {
      rawFs.mkdirSync?.(dirPath, true);
    },
    accessSync: (path) => {
      rawFs.accessSync?.(path);
    },
  };
}

/** 归一化微信形态 KV 存储（tt/swan/qq 同构） */
function normalizeWxStorage(host: WxLikeGlobal): MPStorageLike | null {
  if (typeof host.getStorageSync !== 'function' || typeof host.setStorageSync !== 'function') {
    return null;
  }
  return {
    getStorageSync: (key) => {
      const value = host.getStorageSync?.(key);
      return typeof value === 'string' ? value : '';
    },
    setStorageSync: (key, value) => {
      host.setStorageSync?.(key, value);
    },
  };
}

/** 归一化支付宝形态 KV 存储（options 对象 → positional） */
function normalizeMyStorage(host: MyLikeGlobal): MPStorageLike | null {
  if (typeof host.getStorageSync !== 'function' || typeof host.setStorageSync !== 'function') {
    return null;
  }
  return {
    getStorageSync: (key) => {
      const result = host.getStorageSync?.({ key });
      return typeof result?.data === 'string' ? result.data : '';
    },
    setStorageSync: (key, value) => {
      host.setStorageSync?.({ key, data: value });
    },
  };
}

/** 由原始全局对象构建归一化运行时，任一能力缺失时返回 null */
function buildRuntime(vendor: MPVendor, host: MPGlobal | undefined): MPRuntime | null {
  const userDataPath = host?.env?.USER_DATA_PATH;
  if (typeof host?.getFileSystemManager !== 'function' || !userDataPath) {
    return null;
  }

  let rawFs: RawFileSystemLike;
  try {
    rawFs = host.getFileSystemManager();
  }
  catch {
    return null;
  }

  const fs = normalizeFs(rawFs);
  if (!fs) {
    return null;
  }

  const storage = vendor === 'my'
    ? normalizeMyStorage(host as MyLikeGlobal)
    : normalizeWxStorage(host as WxLikeGlobal);
  if (!storage) {
    return null;
  }

  return { vendor, fs, storage, userDataPath };
}

/**
 * 探测当前环境的小程序运行时
 *
 * 按 wx → my → tt → swan → qq 顺序探测全局对象，返回第一个完整可用
 * （fs 必要方法 + USER_DATA_PATH + storage 方法均存在）的运行时；全部不可用时返回 null。
 */
export function detectMPRuntime(): MPRuntime | null {
  const runtime = globalThis as typeof globalThis & {
    my?: MyLikeGlobal;
    qq?: WxLikeGlobal;
    swan?: WxLikeGlobal;
    tt?: WxLikeGlobal;
    wx?: WxLikeGlobal;
  };

  const candidates: Array<[MPVendor, MPGlobal | undefined]> = [
    ['wx', runtime.wx],
    ['my', runtime.my],
    ['tt', runtime.tt],
    ['swan', runtime.swan],
    ['qq', runtime.qq],
  ];

  for (const [vendor, host] of candidates) {
    const result = buildRuntime(vendor, host);
    if (result) {
      return result;
    }
  }
  return null;
}
