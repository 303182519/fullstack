import type { Readable } from 'node:stream';
import type { PutObjectInput, StorageDriver } from './storage.types.js';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';

/**
 * 本地磁盘驱动：对象落到 `root`（`STORAGE_LOCAL_ROOT`）下的对象键路径。
 *
 * 适用于单机部署与本地开发；`getSignedUrl` 无直连语义，固定返回 null（见接口注释）。
 */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;

  private readonly logger = new Logger(LocalStorageDriver.name);
  /** 存储根目录的绝对路径，用于路径穿越校验。 */
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    const target = this.resolvePath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async getStream(key: string): Promise<Readable | null> {
    const target = this.resolvePath(key);
    let exists = false;
    try {
      exists = (await stat(target)).isFile();
    }
    catch {
      // 文件不存在 / 无权限：一律按「不可读」处理，不区分（避免泄露存在性）
      exists = false;
    }
    return exists ? createReadStream(target) : null;
  }

  async delete(key: string): Promise<void> {
    const target = this.resolvePath(key);
    try {
      // force=true 时 ENOENT 被静默吞掉，天然幂等
      await rm(target, { force: true });
    }
    catch (err) {
      // 权限 / IO 等真实失败只告警：删除为 best-effort，孤儿对象由补偿任务收口
      this.logger.warn(`删除本地对象失败：${key}（${(err as Error).message}）`);
    }
  }

  /** 本地驱动无直连语义，固定返回 null；参数保留以对齐 `StorageDriver` 接口。 */
  async getSignedUrl(_key: string, _ttlSeconds: number): Promise<string | null> {
    return null;
  }

  /**
   * 把对象键解析为根目录下的绝对路径，并阻断路径穿越。
   * 对象键由本服务生成，此处为纵深防御（防止上游漏校验时越出根目录读写）。
   */
  private resolvePath(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`非法对象键（越出存储根目录）：${key}`);
    }
    return target;
  }
}
