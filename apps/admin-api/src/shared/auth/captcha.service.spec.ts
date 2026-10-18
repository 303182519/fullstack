import type { KeyPrefixer, RedisClientType } from '@fedstack/redis';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_LENGTH, CAPTCHA_TTL_SECONDS } from '@/shared/auth/auth.constants.js';
import { CaptchaService } from '@/shared/auth/captcha.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';

function makePrefixer(): KeyPrefixer {
  return { prefix: vi.fn((key: string) => key) } as unknown as KeyPrefixer;
}

function makeRedis() {
  return {
    set: vi.fn(),
    getDel: vi.fn(),
  };
}

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

describe('captchaService', () => {
  let redis: ReturnType<typeof makeRedis>;
  let service: CaptchaService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    redis = makeRedis();
    service = new CaptchaService(redis as unknown as RedisClientType, makePrefixer());
  });

  describe('generate', () => {
    it('返回 captchaId/svg/expiresIn 并写入小写答案', async () => {
      redis.set.mockResolvedValue('OK');

      const result = await service.generate();

      expect(result.captchaId).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof result.svg).toBe('string');
      expect(result.svg).toContain('<svg');
      expect(result.expiresIn).toBe(CAPTCHA_TTL_SECONDS);

      const [key, answer, options] = redis.set.mock.calls[0] ?? [];
      expect(key).toBe(CacheKeys.AUTH_CAPTCHA(result.captchaId));
      expect(typeof answer).toBe('string');
      expect(answer).toBe((answer as string).toLowerCase());
      expect(answer).toHaveLength(CAPTCHA_LENGTH);
      expect(options).toEqual({ EX: CAPTCHA_TTL_SECONDS });
    });

    it('redis 未配置时上抛 503', async () => {
      const nullService = new CaptchaService(null, makePrefixer());
      const error = await nullService.generate().catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });
  });

  describe('consume', () => {
    it('答案匹配（忽略大小写与空格）返回 true', async () => {
      redis.getDel.mockResolvedValue('abcd');
      await expect(service.consume('id-1', ' ABcd ')).resolves.toBe(true);
    });

    it('答案不匹配返回 false', async () => {
      redis.getDel.mockResolvedValue('abcd');
      await expect(service.consume('id-1', 'zzzz')).resolves.toBe(false);
      expect(redis.getDel).toHaveBeenCalledWith(CacheKeys.AUTH_CAPTCHA('id-1'));
    });

    it('答案缺失（已消费/过期）返回 false', async () => {
      redis.getDel.mockResolvedValue(null);
      await expect(service.consume('id-1', 'abcd')).resolves.toBe(false);
    });

    it('redis 未配置时上抛 503', async () => {
      const nullService = new CaptchaService(null, makePrefixer());
      const error = await nullService.consume('id-1', 'abcd').catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });
  });
});
