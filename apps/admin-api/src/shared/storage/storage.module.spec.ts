import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { createStorageDriver } from './storage.module.js';

describe('createStorageDriver', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('未配置或 driver=local 时返回本地驱动', () => {
    expect(createStorageDriver(undefined)).toBeInstanceOf(LocalStorageDriver);
    expect(createStorageDriver({ driver: 'local', localRoot: 'data' })).toBeInstanceOf(
      LocalStorageDriver,
    );
  });

  it('driver=s3 时返回 S3 驱动', () => {
    const driver = createStorageDriver({
      driver: 's3',
      s3: {
        region: 'us-east-1',
        bucket: 'b',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      },
    });
    expect(driver).toBeInstanceOf(S3StorageDriver);
    expect(driver.kind).toBe('s3');
  });

  it('driver=s3 缺 bucket / region 时启动期快速失败', () => {
    expect(() =>
      createStorageDriver({ driver: 's3', s3: { region: 'us-east-1' } })).toThrow(
      /STORAGE_S3_BUCKET/,
    );
    expect(() => createStorageDriver({ driver: 's3', s3: { bucket: 'b' } })).toThrow(
      /STORAGE_S3_REGION/,
    );
  });
});
