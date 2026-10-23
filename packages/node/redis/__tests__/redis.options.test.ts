import { describe, expect, it } from 'vitest';
import {
  buildRedisUrl,
  validateRedisModuleOptions,
} from '../src/redis.options.js';

describe('buildRedisUrl', () => {
  it('显式 url 优先于离散参数', () => {
    expect(
      buildRedisUrl({ url: 'redis://example:6380/2', host: 'ignored' }),
    ).toBe('redis://example:6380/2');
  });

  it('host 缺省时返回 undefined（内存降级信号）', () => {
    expect(buildRedisUrl({})).toBeUndefined();
    expect(buildRedisUrl({ port: 6379 })).toBeUndefined();
  });

  it('host 拼接：默认端口 6379、无密码、无 db', () => {
    expect(buildRedisUrl({ host: '127.0.0.1' })).toBe('redis://127.0.0.1:6379');
  });

  it('密码做 URI 编码，db 拼路径', () => {
    expect(
      buildRedisUrl({
        host: 'cache.internal',
        port: 6380,
        password: 'p@ss/word',
        db: 3,
      }),
    ).toBe(`redis://:${encodeURIComponent('p@ss/word')}@cache.internal:6380/3`);
  });
});

describe('validateRedisModuleOptions', () => {
  const valid = { keyPrefix: 'admin-api', defaultTtl: 300 };

  it('合法配置原样透传', () => {
    expect(validateRedisModuleOptions(valid)).toBe(valid);
  });

  it('keyPrefix 缺失或为空时 fail-fast（多 app 隔离纪律）', () => {
    expect(() =>
      validateRedisModuleOptions({ defaultTtl: 300 } as never),
    ).toThrow(/keyPrefix/);
    expect(() =>
      validateRedisModuleOptions({ keyPrefix: '', defaultTtl: 300 }),
    ).toThrow(/keyPrefix/);
  });

  it('defaultTtl 非法时 fail-fast', () => {
    expect(() =>
      validateRedisModuleOptions({ keyPrefix: 'a', defaultTtl: Number.NaN }),
    ).toThrow(/defaultTtl/);
    expect(() =>
      validateRedisModuleOptions({ keyPrefix: 'a', defaultTtl: -1 }),
    ).toThrow(/defaultTtl/);
  });
});
