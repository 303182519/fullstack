import type { KeyPrefixer, RedisClientType } from '@fedstack/redis';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import {
  LOGIN_LOCKOUT,
  LoginAttemptService,
} from '@/shared/caching/login-attempt.service.js';

function makePrefixer(): KeyPrefixer {
  return { prefix: vi.fn((key: string) => key) } as unknown as KeyPrefixer;
}

function makeRedis() {
  return {
    get: vi.fn(),
    eval: vi.fn(),
    del: vi.fn(),
  };
}

const TENANT = '10';
const USER = 'alice';
const WINDOW_SEC = LOGIN_LOCKOUT.lockMinutes * 60;
const FAIL_KEY = CacheKeys.AUTH_LOGIN_FAIL(TENANT, USER);

describe('loginAttemptService', () => {
  let redis: ReturnType<typeof makeRedis>;
  let service: LoginAttemptService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    redis = makeRedis();
    service = new LoginAttemptService(redis as unknown as RedisClientType, makePrefixer());
  });

  it('getMaxAttempts 返回锁定阈值', () => {
    expect(service.getMaxAttempts()).toBe(LOGIN_LOCKOUT.maxAttempts);
  });

  describe('getFailures', () => {
    it('读取到正整数返回该次数', async () => {
      redis.get.mockResolvedValue('3');
      await expect(service.getFailures(TENANT, USER)).resolves.toBe(3);
      expect(redis.get).toHaveBeenCalledWith(FAIL_KEY);
    });

    it('非法值与零一律归一为 0', async () => {
      redis.get.mockResolvedValue('not-a-number');
      await expect(service.getFailures(TENANT, USER)).resolves.toBe(0);
      redis.get.mockResolvedValue('0');
      await expect(service.getFailures(TENANT, USER)).resolves.toBe(0);
      redis.get.mockResolvedValue(null);
      await expect(service.getFailures(TENANT, USER)).resolves.toBe(0);
    });

    it('redis 未配置时降级返回 0', async () => {
      const nullService = new LoginAttemptService(null, makePrefixer());
      await expect(nullService.getFailures(TENANT, USER)).resolves.toBe(0);
    });

    it('读取异常时降级返回 0', async () => {
      redis.get.mockRejectedValue(new Error('boom'));
      await expect(service.getFailures(TENANT, USER)).resolves.toBe(0);
    });
  });

  describe('isLocked', () => {
    it('达到阈值判定为已锁定', async () => {
      redis.get.mockResolvedValue(String(LOGIN_LOCKOUT.maxAttempts));
      await expect(service.isLocked(TENANT, USER)).resolves.toBe(true);
    });

    it('未达阈值判定为未锁定', async () => {
      redis.get.mockResolvedValue(String(LOGIN_LOCKOUT.maxAttempts - 1));
      await expect(service.isLocked(TENANT, USER)).resolves.toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('自增并返回累计次数与是否锁定', async () => {
      redis.eval.mockResolvedValue(1);
      await expect(service.recordFailure(TENANT, USER)).resolves.toEqual({
        attempts: 1,
        locked: false,
      });

      redis.eval.mockResolvedValue(LOGIN_LOCKOUT.maxAttempts);
      await expect(service.recordFailure(TENANT, USER)).resolves.toEqual({
        attempts: LOGIN_LOCKOUT.maxAttempts,
        locked: true,
      });
    });

    it('以 KEYS/ARGV 形式原子自增并携带窗口秒数', async () => {
      redis.eval.mockResolvedValue(1);
      await service.recordFailure(TENANT, USER);

      const [script, args] = redis.eval.mock.calls[0] ?? [];
      expect(script).toContain('INCR');
      expect(args).toEqual({ keys: [FAIL_KEY], arguments: [String(WINDOW_SEC)] });
    });

    it('redis 未配置时 fail-open 返回零计数', async () => {
      const nullService = new LoginAttemptService(null, makePrefixer());
      await expect(nullService.recordFailure(TENANT, USER)).resolves.toEqual({
        attempts: 0,
        locked: false,
      });
    });

    it('执行异常时 fail-open 返回零计数', async () => {
      redis.eval.mockRejectedValue(new Error('boom'));
      await expect(service.recordFailure(TENANT, USER)).resolves.toEqual({
        attempts: 0,
        locked: false,
      });
    });
  });

  describe('clear', () => {
    it('删除失败计数键', async () => {
      redis.del.mockResolvedValue(1);
      await service.clear(TENANT, USER);
      expect(redis.del).toHaveBeenCalledWith(FAIL_KEY);
    });

    it('redis 故障时静默降级不抛错', async () => {
      redis.del.mockRejectedValue(new Error('boom'));
      await expect(service.clear(TENANT, USER)).resolves.toBeUndefined();
    });

    it('redis 未配置时不抛错', async () => {
      const nullService = new LoginAttemptService(null, makePrefixer());
      await expect(nullService.clear(TENANT, USER)).resolves.toBeUndefined();
    });
  });
});
