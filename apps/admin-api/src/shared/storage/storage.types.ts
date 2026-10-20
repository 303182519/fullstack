import type { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';

/** 存储驱动标识，与 Prisma 枚举 FileStorage 的取值一一对应。 */
export type StorageDriverKind = 'local' | 's3';

/** 写入对象参数。 */
export interface PutObjectInput {
  /** 存储后端内唯一键（由调用方生成，驱动只做透明存取）。 */
  key: string;
  /** 对象字节。 */
  body: Buffer;
  /** 对象 MIME 类型，供存储后端回写下载响应头。 */
  contentType: string;
}

/**
 * 存储驱动统一接口（ADR-012 D1）。
 *
 * 两个实现：`LocalStorageDriver`（本地磁盘）/ `S3StorageDriver`（S3 兼容端点）。
 * 业务代码只依赖本接口；运行时由 `STORAGE_DRIVER` 选定**单一活动驱动**。
 */
export interface StorageDriver {
  /** 驱动标识，写入 `SysFile.storage`，用于驱动切换后定位历史对象。 */
  readonly kind: StorageDriverKind;

  /** 写入 / 覆盖对象。失败向上抛出——上传失败必须可见。 */
  put: (input: PutObjectInput) => Promise<void>;

  /** 读取对象流。对象不存在返回 null，由调用方映射为 404（不泄露对象存在性）。 */
  getStream: (key: string) => Promise<Readable | null>;

  /**
   * 判断对象是否存在。
   *
   * 语义约定：对象不存在 → `false`；真实故障（网络 / 权限 / 超时）→ 抛出，
   * 由调用方决定降级或告警。健康检查依赖此约定：对一个肯定不存在的探针 key 调用，
   * 返回 `false` 即「后端可达」，抛出即「后端不可达」。
   */
  exists: (key: string) => Promise<boolean>;

  /**
   * 删除对象。**幂等且 best-effort**：对象不存在视为成功，失败仅告警不抛出
   * ——元数据软删不因对象删除失败而回滚，遗留孤儿对象由补偿任务收口（ADR-012 D6）。
   */
  delete: (key: string) => Promise<void>;

  /**
   * 签发可直连下载的 URL（预签名），ttlSeconds 为有效期。
   *
   * 本地驱动无对象存储直连语义，返回 null：驱动不感知 Web 路由，由调用方回退到服务端
   * 代理通路（ADR-012 D1/D8）。
   */
  getSignedUrl: (key: string, ttlSeconds: number) => Promise<string | null>;
}
