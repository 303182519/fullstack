import type { RedisClientType } from '@keyv/redis';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { REDIS_CLIENT } from './cache.tokens.js';
import { withRedis } from './redis-fallback.js';

/**
 * Redis Pub/Sub 薄封装（见 ADR-003 修订：连接分层纪律）。
 *
 * 职责：为实时推送、跨实例事件分发等场景提供发布/订阅能力。
 *
 * 连接纪律（关键约束）：
 *   - 发布：复用共享 REDIS_CLIENT（普通命令连接）；
 *   - 订阅：Redis 客户端一旦进入 subscribe 模式，就不能再执行普通命令（会抛错）。
 *     因此本服务在首次 subscribe 时从共享 client `duplicate()` 出**独占订阅连接**，
 *     之后所有订阅都挂在这条专用连接上，直到模块销毁。
 *   - 这保证「发布方」与「订阅方」在连接层面隔离，互不阻塞。
 *
 * 边界：与 KeyPrefixer 一致，本服务只管连接纪律，**频道命名等业务语义由消费方 app 决定**。
 *
 * 降级：Redis 未配置（client 为 null）或运行期故障时，
 *   - publish 静默 no-op（返回 false）
 *   - subscribe/unsubscribe 静默 no-op（返回 false）
 *   调用方据此回退到拉取接口（实时推送为 best-effort，DB 是权威真相源）。
 */
@Injectable()
export class PubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private subscriber: RedisClientType | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType | null,
  ) {}

  /**
   * 发布消息到指定频道。
   * @param channel 频道名（建议经 KeyPrefixer 加前缀）
   * @param message 消息体（通常 JSON 序列化后字符串）
   * @returns 是否发布成功；Redis 不可用返回 false
   */
  async publish(channel: string, message: string): Promise<boolean> {
    const result = await withRedis(
      this.redis,
      r => r.publish(channel, message),
      -1,
      'PubSubService.publish',
    );
    return result >= 0;
  }

  /**
   * 订阅频道。首次调用时创建独占订阅连接（duplicate 自共享 client）。
   * @param channel 频道名
   * @param handler 消息回调
   * @returns 是否订阅成功；Redis 不可用返回 false
   */
  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<boolean> {
    if (!this.redis) {
      this.logger.warn(`Redis 未配置，订阅 ${channel} 降级为 no-op`);
      return false;
    }
    try {
      const sub = await this.ensureSubscriber();
      await sub.subscribe(channel, handler);
      this.logger.log(`已订阅频道: ${channel}`);
      return true;
    }
    catch (err) {
      this.logger.warn(
        `订阅 ${channel} 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * 退订频道。若无活跃订阅则静默 no-op。
   * @param channel 频道名
   */
  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) {
      return;
    }
    try {
      await this.subscriber.unsubscribe(channel);
      this.logger.log(`已退订频道: ${channel}`);
    }
    catch (err) {
      this.logger.warn(
        `退订 ${channel} 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber) {
      return;
    }
    try {
      if (this.subscriber.isOpen) {
        await this.subscriber.quit();
        this.logger.log('Pub/Sub 订阅连接已关闭');
      }
    }
    catch (err) {
      this.logger.warn(
        `Pub/Sub 订阅连接关闭异常: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 惰性初始化独占订阅连接。
   * 从共享 client duplicate() 得到同配置新连接，专门用于 subscribe。
   */
  private async ensureSubscriber(): Promise<RedisClientType> {
    if (this.subscriber) {
      return this.subscriber;
    }
    if (!this.redis) {
      throw new Error('Redis client is not available');
    }
    const sub = this.redis.duplicate();
    await sub.connect();
    this.subscriber = sub;
    return sub;
  }
}
