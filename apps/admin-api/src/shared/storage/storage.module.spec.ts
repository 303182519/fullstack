import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { STORAGE_DRIVER } from './storage.constants.js';
import { StorageHealthIndicator } from './storage.health.js';
import { createStorageDriver, StorageModule } from './storage.module.js';

/**
 * 全局 Config 模块：真实 app 中 ConfigModule.forRoot({ isGlobal: true }) 使 ConfigService 全局可用；
 * 测试中用 @Global() 模块模拟同一效果，供 StorageModule 的 useFactory 注入。
 */
@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: {} }],
  exports: [ConfigService],
})
class GlobalConfigModule {}

/** 包装模块：导入全局 Config + Storage，验证 DI 装配。 */
@Module({
  imports: [GlobalConfigModule, StorageModule],
})
class TestRootModule {}

// 模块编译测试需要 getConfig 返回有效 storage 配置
vi.mock('@/config/configuration.js', () => ({
  getConfig: () => ({ storage: { driver: 'local', localRoot: 'storage' } }),
}));

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

describe('storageModule DI', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('编译通过并解析 STORAGE_DRIVER 与 StorageHealthIndicator', async () => {
    const module = await Test.createTestingModule({
      imports: [TestRootModule],
    }).compile();

    expect(module.get(STORAGE_DRIVER)).toBeInstanceOf(LocalStorageDriver);
    expect(module.get(StorageHealthIndicator)).toBeDefined();
  });
});
