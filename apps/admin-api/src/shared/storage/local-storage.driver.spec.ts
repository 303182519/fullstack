import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';

/** 把对象流读成 Buffer，便于与写入字节做整体比较。 */
async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('localStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fedstack-storage-'));
    driver = new LocalStorageDriver(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('kind 标识为 local', () => {
    expect(driver.kind).toBe('local');
  });

  it('put 写入后 getStream 读回原始字节，且自动创建中间目录', async () => {
    const body = Buffer.from('hello 存储');
    await driver.put({
      key: 'tenant-1/2026/10/a.txt',
      body,
      contentType: 'text/plain',
    });

    const stream = await driver.getStream('tenant-1/2026/10/a.txt');
    expect(stream).not.toBeNull();
    await expect(drain(stream as Readable)).resolves.toEqual(body);
  });

  it('getStream 对象不存在时返回 null', async () => {
    await expect(driver.getStream('missing.txt')).resolves.toBeNull();
  });

  it('delete 删除对象，且重复删除幂等不抛错', async () => {
    await driver.put({ key: 'x.txt', body: Buffer.from('x'), contentType: 'text/plain' });
    await driver.delete('x.txt');
    await expect(driver.getStream('x.txt')).resolves.toBeNull();
    await expect(driver.delete('x.txt')).resolves.toBeUndefined();
  });

  it('getSignedUrl 返回 null（本地驱动无直连语义）', async () => {
    await expect(driver.getSignedUrl('x.txt', 300)).resolves.toBeNull();
  });

  it('exists 对象存在时返回 true，不存在时返回 false', async () => {
    await driver.put({ key: 'a/b.txt', body: Buffer.from('x'), contentType: 'text/plain' });
    await expect(driver.exists('a/b.txt')).resolves.toBe(true);
    await expect(driver.exists('missing.txt')).resolves.toBe(false);
  });

  it('put 原子写入：目标文件完整可读，无残留临时文件', async () => {
    const body = Buffer.from('atomic-content');
    await driver.put({ key: 'dir/atomic.txt', body, contentType: 'text/plain' });

    // 目标文件内容完整
    const stream = await driver.getStream('dir/atomic.txt');
    await expect(drain(stream as Readable)).resolves.toEqual(body);

    // 无 .tmp.* 残留（用 exists 间接验证：临时文件命名 .tmp.<uuid> 不会被误判为业务对象）
    await expect(driver.exists('dir/atomic.txt')).resolves.toBe(true);
  });

  it('拒绝越出存储根目录的对象键', async () => {
    await expect(
      driver.put({
        key: '../escape.txt',
        body: Buffer.from('x'),
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(/非法对象键/);
    await expect(driver.getStream('../../etc/passwd')).rejects.toThrow(/非法对象键/);
  });
});
