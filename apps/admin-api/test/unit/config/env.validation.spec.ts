import { describe, expect, it } from 'vitest';
import { validationSchema } from '@/config/env.validation.js';

// 必填项的合法占位值，让校验聚焦在 Redis 段
const REQUIRED_ENV = {
  JWT_SECRET: 'test-secret',
  DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
};

describe('env.validation Redis 段', () => {
  it('缺省 REDIS_KEY_PREFIX 时默认 admin-api（多 app 前缀隔离，ADR-003）', () => {
    const { error, value } = validationSchema.validate(REQUIRED_ENV);

    expect(error).toBeUndefined();
    expect(value.REDIS_KEY_PREFIX).toBe('admin-api');
  });

  it('显式设置 REDIS_KEY_PREFIX 时尊重配置', () => {
    const { error, value } = validationSchema.validate({
      ...REQUIRED_ENV,
      REDIS_KEY_PREFIX: 'custom-prefix',
    });

    expect(error).toBeUndefined();
    expect(value.REDIS_KEY_PREFIX).toBe('custom-prefix');
  });

  it('同时提供 REDIS_URL 与 REDIS_HOST 时报互斥错误（二选一，也可都不提供）', () => {
    const conflict = validationSchema.validate({
      ...REQUIRED_ENV,
      REDIS_URL: 'redis://localhost:6379',
      REDIS_HOST: 'localhost',
    });
    expect(conflict.error).toBeDefined();

    const none = validationSchema.validate(REQUIRED_ENV);
    expect(none.error).toBeUndefined();
  });
});

describe('env.validation 文件存储与上传段', () => {
  it('缺省时默认 local 驱动、本地根目录与签名 TTL', () => {
    const { error, value } = validationSchema.validate(REQUIRED_ENV);

    expect(error).toBeUndefined();
    expect(value.STORAGE_DRIVER).toBe('local');
    expect(value.STORAGE_LOCAL_ROOT).toBe('storage');
    expect(value.STORAGE_SIGNED_URL_TTL).toBe(300);
  });

  it('sTORAGE_DRIVER 取值非法时报错', () => {
    const { error } = validationSchema.validate({
      ...REQUIRED_ENV,
      STORAGE_DRIVER: 'ftp',
    });
    expect(error).toBeDefined();
  });

  it('driver=s3 时缺 bucket / region 报错，齐备时通过', () => {
    const missingBucket = validationSchema.validate({
      ...REQUIRED_ENV,
      STORAGE_DRIVER: 's3',
      STORAGE_S3_REGION: 'us-east-1',
    });
    expect(missingBucket.error).toBeDefined();

    const missingRegion = validationSchema.validate({
      ...REQUIRED_ENV,
      STORAGE_DRIVER: 's3',
      STORAGE_S3_BUCKET: 'bucket',
    });
    expect(missingRegion.error).toBeDefined();

    const complete = validationSchema.validate({
      ...REQUIRED_ENV,
      STORAGE_DRIVER: 's3',
      STORAGE_S3_REGION: 'us-east-1',
      STORAGE_S3_BUCKET: 'bucket',
    });
    expect(complete.error).toBeUndefined();
  });

  it('上传约束缺省值生效，显式覆盖被尊重', () => {
    const defaults = validationSchema.validate(REQUIRED_ENV);
    expect(defaults.value.UPLOAD_MAX_BYTES).toBe(5_242_880);
    expect(defaults.value.UPLOAD_MAX_BYTES_OTHER).toBe(20_971_520);
    expect(defaults.value.UPLOAD_COVER_MAX_WIDTH).toBe(1600);
    expect(defaults.value.UPLOAD_COVER_FORMAT).toBe('webp');

    const overridden = validationSchema.validate({
      ...REQUIRED_ENV,
      UPLOAD_MAX_BYTES: 1024,
      UPLOAD_COVER_FORMAT: 'png',
    });
    expect(overridden.value.UPLOAD_MAX_BYTES).toBe(1024);
    expect(overridden.value.UPLOAD_COVER_FORMAT).toBe('png');
  });
});

describe('env.validation 实时推送段（ADR-013 D5/D6）', () => {
  it('缺省时默认 1000 连接上限与 30s 心跳', () => {
    const { error, value } = validationSchema.validate(REQUIRED_ENV);

    expect(error).toBeUndefined();
    expect(value.REALTIME_MAX_CONNECTIONS).toBe(1000);
    expect(value.REALTIME_HEARTBEAT_MS).toBe(30_000);
  });

  it('非法取值（非正整数）被拒绝，显式覆盖被尊重', () => {
    const invalid = validationSchema.validate({
      ...REQUIRED_ENV,
      REALTIME_MAX_CONNECTIONS: 0,
    });
    expect(invalid.error).toBeDefined();

    const overridden = validationSchema.validate({
      ...REQUIRED_ENV,
      REALTIME_MAX_CONNECTIONS: 50,
      REALTIME_HEARTBEAT_MS: 15_000,
    });
    expect(overridden.error).toBeUndefined();
    expect(overridden.value.REALTIME_MAX_CONNECTIONS).toBe(50);
    expect(overridden.value.REALTIME_HEARTBEAT_MS).toBe(15_000);
  });
});
