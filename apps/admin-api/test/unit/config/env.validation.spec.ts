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
