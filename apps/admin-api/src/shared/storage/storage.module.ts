import type { StorageDriver } from './storage.types.js';
import type { StorageConfig } from '@/config/configuration.interface.js';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { STORAGE_DRIVER } from './storage.constants.js';

/**
 * 依据配置构造**单一活动驱动**（ADR-012 D1）。
 *
 * 密钥 / 端点 / bucket 全部来自注入的配置（最终来源是 env），本函数只做装配与启动期自检，
 * 不读取 env、不打印任何凭据。
 */
export function createStorageDriver(config: StorageConfig | undefined): StorageDriver {
  const driver = config?.driver ?? 'local';

  if (driver === 's3') {
    const s3 = config?.s3 ?? {};
    // 启动期快速失败：缺关键配置时不要等到第一次上传才暴露
    if (!s3.bucket)
      throw new Error('STORAGE_DRIVER=s3 时必须配置 STORAGE_S3_BUCKET');
    if (!s3.region)
      throw new Error('STORAGE_DRIVER=s3 时必须配置 STORAGE_S3_REGION');

    Logger.log(
      `[storage] 使用 S3 兼容驱动：endpoint=${s3.endpoint ?? '(默认)'} bucket=${s3.bucket}`,
      'StorageModule',
    );
    return new S3StorageDriver({
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      forcePathStyle: s3.forcePathStyle,
    });
  }

  const localRoot = config?.localRoot ?? 'storage';
  Logger.log(`[storage] 使用本地存储驱动：root=${localRoot}`, 'StorageModule');
  return new LocalStorageDriver(localRoot);
}

/**
 * 文件存储模块（ADR-012）。
 *
 * 与 @fedstack/redis / @fedstack/database 同哲学：模块不读 env，配置由 config 层注入。
 * 对外只暴露 `STORAGE_DRIVER` 令牌，消费方（file 模块）依赖 `StorageDriver` 接口，
 * 不感知具体驱动。
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): StorageDriver =>
        createStorageDriver(getConfig(configService).storage),
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
