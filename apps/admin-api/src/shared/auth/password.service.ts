import type { HashOptions } from 'argon2';
import { Injectable } from '@nestjs/common';
import { hash as argon2Hash, argon2id, verify as argon2Verify } from 'argon2';
import {
  PASSWORD_COMPLEXITY,
  PASSWORD_HISTORY_SIZE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
} from './auth.constants.js';
import { authErrors } from './auth.errors.js';

/**
 * argon2id 参数（ADR-007 D3）。
 * memoryCost=65536（64MB）、timeCost=3、parallelism=4 —— 与 argon2 库默认值一致，
 * 但仍显式声明：策略值必须可审计，不能依赖第三方库默认值漂移。
 */
const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

/**
 * 密码哈希与密码策略。
 *
 * 职责边界：只做「哈希 / 校验 / 复杂度 / 历史比对」，不碰数据库与事务——
 * 密码历史的持久化由调用方（UserService）在事务内完成。
 * 这样本服务可独立单测（无需 DB / Redis）。
 */
@Injectable()
export class PasswordService {
  /** 生成 argon2id 哈希；先做复杂度校验，不合规直接拒绝 */
  async hash(plain: string): Promise<string> {
    this.assertComplexity(plain);
    return argon2Hash(plain, ARGON2_OPTIONS);
  }

  /**
   * 校验明文与哈希是否匹配。
   * 哈希串损坏 / 非法时 argon2 会抛错，此处按「不匹配」返回 false，
   * 避免脏数据导致登录接口 500（应表现为「密码错误」而不是服务故障）。
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2Verify(hash, plain);
    }
    catch {
      return false;
    }
  }

  /** 复杂度校验：长度 + 大小写字母 + 数字；不合规抛业务异常 */
  assertComplexity(plain: string): void {
    const tooShort = plain.length < PASSWORD_MIN_LENGTH;
    const tooLong = plain.length > PASSWORD_MAX_LENGTH;
    if (tooShort || tooLong || !PASSWORD_COMPLEXITY.test(plain)) {
      throw authErrors.passwordPolicy(PASSWORD_POLICY_MESSAGE);
    }
  }

  /**
   * 明文是否命中历史密码（禁止复用最近 N 次密码）。
   * 历史里存的是哈希，只能逐条 verify（argon2 无法反推明文再比对）。
   */
  async isReusedPassword(
    plain: string,
    history: readonly string[],
  ): Promise<boolean> {
    for (const previous of history) {
      if (await this.verify(previous, plain))
        return true;
    }
    return false;
  }

  /**
   * 把新哈希并入历史并截断到最近 N 条。
   * 调用方应在改密成功后落库（同一事务内完成，见 ADR-007 §5 并发风险评估）。
   */
  appendHistory(newHash: string, history: readonly string[]): string[] {
    return [newHash, ...history].slice(0, PASSWORD_HISTORY_SIZE);
  }

  /**
   * 把数据库中的 Json 列安全解析成字符串数组。
   * 列类型是 Json?，历史值可能是 null / 非数组 / 混入非字符串元素，
   * 这里统一净化，避免脏数据让调用方到处写类型判断。
   */
  normalizeHistory(value: unknown): string[] {
    if (!Array.isArray(value))
      return [];
    return value.filter((item): item is string => typeof item === 'string');
  }
}
