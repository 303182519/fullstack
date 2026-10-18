import type { RedisClientType } from '@fedstack/redis';
import type { ExecutionContext } from '@nestjs/common';
import { REDIS_CLIENT } from '@fedstack/redis';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '@/config/config.module.js';
import { getConfig } from '@/config/configuration.js';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';

/**
 * 探针路径跳过全局限流：k8s 存活/就绪探针高频调用，被限流会导致探针失败进而误重启 Pod。
 */
function isHealthPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return path === '/health' || path === '/health/ready';
}

/**
 * 生成可读的限流 key。
 *
 * 默认 @nestjs/throttler 的 generateKey 会对 `Class-Handler-name-tracker` 做 SHA256，
 * 落盘 key 全是 hash，redis-cli 不可读。这里 override 为可读格式，
 * 同时保留 Class + Handler 维度的隔离（login 和 register 各自 10/min 互不影响）。
 *
 * 最终落盘：throttle:{counter|block}:{name}:{Class}-{Handler}-{name}-{tracker}
 * 示例：throttle:block:default:AuthController-login-default-user:abc123
 */
function readableGenerateKey(context: ExecutionContext, tracker: string, name: string): string {
  const className = context.getClass().name;
  const handlerName = context.getHandler().name;
  return `${className}-${handlerName}-${name}-${tracker}`;
}

@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (
        configService: ConfigService,
        redisClient: RedisClientType | null,
      ) => {
        const { throttler } = getConfig(configService);

        const storage = new RedisThrottlerStorage(redisClient);

        return {
          errorMessage: throttler.errorMessage,
          // 探针路径跳过全局限流
          skipIf: (context: ExecutionContext) =>
            isHealthPath(
              context
                .switchToHttp()
                .getRequest<{ originalUrl?: string }>().originalUrl,
            ),
          throttlers: [
            {
              name: 'default',
              ttl: throttler.ttl,
              limit: throttler.limit,
              blockDuration: throttler.blockDuration,
            },
          ],
          storage,
          generateKey: readableGenerateKey,
          // 不向响应中写入 X-RateLimit-* / Retry-After 头
          setHeaders: false,
        };
      },
    }),
  ],
})
export class ThrottlerConfigModule {}
