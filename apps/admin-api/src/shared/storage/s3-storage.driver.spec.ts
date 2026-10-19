import { Buffer } from 'node:buffer';
import { Readable as NodeReadable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3StorageDriver } from './s3-storage.driver.js';

// 替身：把 S3Client 换成仅暴露 send 的桩，命令类保持真实（便于断言 instanceof）
const { sendMock, presignMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  presignMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    S3Client: class {
      send = sendMock;
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: presignMock }));

const OPTIONS = {
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
};

describe('s3StorageDriver', () => {
  let driver: S3StorageDriver;

  beforeEach(() => {
    sendMock.mockReset();
    presignMock.mockReset();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    driver = new S3StorageDriver(OPTIONS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kind 标识为 s3', () => {
    expect(driver.kind).toBe('s3');
  });

  it('put 以 PutObjectCommand 写入并带上 bucket / key / contentType', async () => {
    sendMock.mockResolvedValue({});
    await driver.put({ key: 'a/b.txt', body: Buffer.from('hi'), contentType: 'text/plain' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('test-bucket');
    expect(command.input.Key).toBe('a/b.txt');
    expect(command.input.ContentType).toBe('text/plain');
  });

  it('getStream 命中对象时返回对象流', async () => {
    const body = NodeReadable.from(['data']);
    sendMock.mockResolvedValue({ Body: body });
    await expect(driver.getStream('a/b.txt')).resolves.toBe(body);
  });

  it('getStream 对象不存在（NoSuchKey）时返回 null', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
    await expect(driver.getStream('gone.txt')).resolves.toBeNull();
  });

  it('getStream 兼容端点只给 404 状态码时也返回 null', async () => {
    sendMock.mockRejectedValue(
      Object.assign(new Error('not found'), { $metadata: { httpStatusCode: 404 } }),
    );
    await expect(driver.getStream('gone.txt')).resolves.toBeNull();
  });

  it('getStream 其它错误向上抛出', async () => {
    sendMock.mockRejectedValue(new Error('network down'));
    await expect(driver.getStream('a/b.txt')).rejects.toThrow('network down');
  });

  it('delete 失败仅告警不抛出（best-effort）', async () => {
    sendMock.mockRejectedValue(new Error('boom'));
    await expect(driver.delete('a/b.txt')).resolves.toBeUndefined();
  });

  it('delete 发出 DeleteObjectCommand', async () => {
    sendMock.mockResolvedValue({});
    await driver.delete('a/b.txt');
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('getSignedUrl 委托预签名器并透传 TTL', async () => {
    presignMock.mockResolvedValue('https://signed.example/x');
    await expect(driver.getSignedUrl('a/b.txt', 300)).resolves.toBe(
      'https://signed.example/x',
    );

    const call = (presignMock.mock.calls[0] ?? []) as unknown as [
      unknown,
      GetObjectCommand,
      { expiresIn: number },
    ];
    expect(call[1]).toBeInstanceOf(GetObjectCommand);
    expect(call[2]).toEqual({ expiresIn: 300 });
  });
});
