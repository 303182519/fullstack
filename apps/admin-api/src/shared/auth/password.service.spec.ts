import { beforeAll, describe, expect, it } from 'vitest';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { PASSWORD_HISTORY_SIZE } from '@/shared/auth/auth.constants.js';
import { AuthBizCode } from '@/shared/auth/auth.errors.js';
import { PasswordService } from '@/shared/auth/password.service.js';

/** 从异常对象上取业务码（BaseException.code）；无 code 时返回 undefined */
function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

/** 同步抛错场景：捕获异常并返回业务码；未抛错时返回 undefined */
function captureCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  }
  catch (error) {
    return codeOf(error);
  }
}

describe('passwordService', () => {
  const service = new PasswordService();
  const plain = 'Abcd1234';
  let hash: string;

  // 真实 argon2id 哈希代价较高（64MB 内存），共享一份哈希给多个断言，避免重复计算
  beforeAll(async () => {
    hash = await service.hash(plain);
  });

  describe('hash', () => {
    it('生成以 $argon2id$ 开头的哈希', () => {
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('复杂度不足时抛密码策略异常', async () => {
      const error = await service.hash('abc').catch(e => e);
      expect(error).toBeInstanceOf(BaseException);
      expect(codeOf(error)).toBe(AuthBizCode.PASSWORD_POLICY);
    });
  });

  describe('verify', () => {
    it('明文正确返回 true', async () => {
      await expect(service.verify(hash, plain)).resolves.toBe(true);
    });

    it('明文错误返回 false', async () => {
      await expect(service.verify(hash, 'Wrong9999')).resolves.toBe(false);
    });

    it('哈希串损坏返回 false 而非抛错', async () => {
      await expect(
        service.verify('$argon2id$not-a-valid-hash', plain),
      ).resolves.toBe(false);
    });
  });

  describe('assertComplexity', () => {
    it('过短抛异常', () => {
      expect(captureCode(() => service.assertComplexity('Ab1'))).toBe(
        AuthBizCode.PASSWORD_POLICY,
      );
    });

    it('过长抛异常', () => {
      const tooLong = `A1${'a'.repeat(63)}`;
      expect(tooLong.length).toBeGreaterThan(64);
      expect(captureCode(() => service.assertComplexity(tooLong))).toBe(
        AuthBizCode.PASSWORD_POLICY,
      );
    });

    it('缺少大写字母抛异常', () => {
      expect(captureCode(() => service.assertComplexity('abcd1234'))).toBe(
        AuthBizCode.PASSWORD_POLICY,
      );
    });

    it('缺少数字抛异常', () => {
      expect(captureCode(() => service.assertComplexity('Abcdefgh'))).toBe(
        AuthBizCode.PASSWORD_POLICY,
      );
    });

    it('合规密码不抛异常', () => {
      expect(captureCode(() => service.assertComplexity('Abcd1234'))).toBeUndefined();
    });
  });

  describe('isReusedPassword', () => {
    it('命中历史密码返回 true', async () => {
      await expect(service.isReusedPassword(plain, [hash])).resolves.toBe(true);
    });

    it('未命中返回 false', async () => {
      await expect(service.isReusedPassword('Other123', [hash])).resolves.toBe(false);
    });

    it('空历史返回 false', async () => {
      await expect(service.isReusedPassword(plain, [])).resolves.toBe(false);
    });
  });

  describe('appendHistory', () => {
    it('新哈希置顶并截断到历史容量上限', () => {
      const history = ['h1', 'h2', 'h3', 'h4', 'h5'];
      const next = service.appendHistory('new', history);

      expect(next).toHaveLength(PASSWORD_HISTORY_SIZE);
      expect(next[0]).toBe('new');
      expect(next).not.toContain('h5');
    });
  });

  describe('normalizeHistory', () => {
    it('非数组返回空数组', () => {
      expect(service.normalizeHistory(null)).toEqual([]);
      expect(service.normalizeHistory('oops')).toEqual([]);
    });

    it('过滤掉非字符串元素', () => {
      expect(service.normalizeHistory([1, 'a', null, 'b', {}])).toEqual(['a', 'b']);
    });
  });
});
