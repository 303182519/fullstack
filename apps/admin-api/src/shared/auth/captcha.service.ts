import type { RedisClientType } from '@fedstack/redis';
import { randomUUID } from 'node:crypto';
import { KeyPrefixer, REDIS_CLIENT } from '@fedstack/redis';
import { Inject, Injectable, Logger } from '@nestjs/common';
import svgCaptcha from 'svg-captcha';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { CAPTCHA_LENGTH, CAPTCHA_TTL_SECONDS } from './auth.constants.js';
import { authErrors } from './auth.errors.js';

export interface CaptchaChallenge {
  captchaId: string;
  /** SVG 图片字符串（前端可直接内联渲染） */
  svg: string;
  /** 答案有效期（秒） */
  expiresIn: number;
}

/**
 * 图形验证码（ADR-007 D4）。
 *
 * 一次性使用：校验采用 Redis `GETDEL`（读+删原子），成功后答案立即失效，
 * 失败（答案错）时也一并删除——重放同一 captchaId 必须失败，因此不能「保留 TTL 内可重试」，
 * 否则攻击者可对同一张图反复试答案。
 *
 * Redis 不可用时抛 503：验证码的答案只能存 Redis，无法校验就不能放行登录。
 * 由于登录本身也依赖 Redis 建会话，此处 fail-fast 与整体语义一致。
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType | null,
    private readonly prefixer: KeyPrefixer,
  ) {}

  private requireClient(): RedisClientType {
    if (!this.redis) {
      this.logger.error('Redis 未配置，验证码服务不可用');
      throw authErrors.unavailable('验证码服务不可用（Redis 未配置）');
    }
    return this.redis;
  }

  /** 生成验证码并写入答案（小写归一化存储），返回 captchaId 与 SVG */
  async generate(): Promise<CaptchaChallenge> {
    const client = this.requireClient();

    // 排除易混淆字符，降低人工识别失败率（o/O/0、l/1/i 之类）
    const captcha = svgCaptcha.create({
      size: CAPTCHA_LENGTH,
      noise: 3,
      color: true,
      ignoreChars: '0oO1ilI',
      width: 120,
      height: 40,
    });

    const captchaId = randomUUID();
    await client.set(
      this.prefixer.prefix(CacheKeys.AUTH_CAPTCHA(captchaId)),
      captcha.text.trim().toLowerCase(),
      { EX: CAPTCHA_TTL_SECONDS },
    );

    return {
      captchaId,
      svg: captcha.data,
      expiresIn: CAPTCHA_TTL_SECONDS,
    };
  }

  /**
   * 校验并消费验证码。返回 true 表示校验通过。
   * 失败（Redis 故障）上抛 503；答案错误返回 false 且答案已被消费。
   */
  async consume(captchaId: string, text: string): Promise<boolean> {
    const client = this.requireClient();
    const key = this.prefixer.prefix(CacheKeys.AUTH_CAPTCHA(captchaId));

    // GETDEL：读到的同时删除，保证一次性
    const expected = await client.getDel(key);
    if (!expected)
      return false;

    return expected === text.trim().toLowerCase();
  }
}
