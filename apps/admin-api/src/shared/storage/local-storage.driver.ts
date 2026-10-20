import type { Readable } from 'node:stream';
import type { PutObjectInput, StorageDriver } from './storage.types.js';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';

/**
 * 本地磁盘驱动：对象落到 `root`（`STORAGE_LOCAL_ROOT`）下的对象键路径。
 *
 * 适用于单机部署与本地开发；`getSignedUrl` 无直连语义，固定返回 null（见接口注释）。
 *
 * 写入采用「临时文件 + rename」原子语义：进程崩溃 / 磁盘满不会留下半写损坏文件，
 * 同文件系统下 rename 是原子操作，读者要么看到旧文件要么看到完整新文件。
 */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;

  private readonly logger = new Logger(LocalStorageDriver.name);
  /** 存储根目录的绝对路径，用于路径穿越校验。 */
  private readonly root: string;

  // process.cwd() 是你在哪个目录执行 node 命令，它就返回哪个目录
  // `resolve(root)` 是相对`process.cwd()` 解析的。
  // 通过`pnpm dev` / turbo 启动 admin-api 时，
  // 工作目录就是包目录`apps\admin-api` ，所以最终落到：
  // e:\fullstack\apps\admin-api\storage
  constructor(root: string) {
    this.root = resolve(root);
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    const target = this.resolvePath(key);
    await mkdir(dirname(target), { recursive: true });
    // 原子写入：先写同目录临时文件，再 rename 覆盖目标
    const tmp = `${target}.tmp.${randomUUID()}`;
    try {
      await writeFile(tmp, body);
      await rename(tmp, target);
    }
    catch (err) {
      // 写入失败时清理临时文件（best-effort，不掩盖原始错误）
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async getStream(key: string): Promise<Readable | null> {
    const target = this.resolvePath(key);
    try {
      if (!(await stat(target)).isFile())
        return null;
      return createReadStream(target);
    }
    catch {
      // 文件不存在 / 无权限：一律按「不可读」处理，不区分（避免泄露存在性）
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolvePath(key);
    try {
      return (await stat(target)).isFile();
    }
    catch (err) {
      // ENOENT = 文件不存在，语义上返回 false；其余错误（权限等）抛出，交由上层处理
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        return false;
      throw err;
    }
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
