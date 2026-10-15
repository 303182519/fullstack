import type { RedisClientType } from '@keyv/redis';
import type { DynamicModule, OnApplicationBootstrap, OnModuleDestroy, Provider } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
} from './redis.options.js';
import KeyvRedis from '@keyv/redis';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Inject, Logger, Module } from '@nestjs/common';
import { createCacheStores } from './cache-stores.js';
import { CacheHealthIndicator } from './cache.health.js';
import { KeyPrefixer } from './cache.prefixer.js';
import { CacheService } from './cache.service.js';
import { REDIS_CLIENT, REDIS_STORE } from './cache.tokens.js';
import { HashCacheService } from './hash-cache.service.js';
import { RedisLockService } from './redis-lock.service.js';
import {
  buildRedisUrl,
  REDIS_MODULE_OPTIONS,
  validateRedisModuleOptions,
} from './redis.options.js';
import { SortedSetCacheService } from './sorted-set-cache.service.js';

/**
 * Redis 缓存模块（共享基础设施，见 ADR-003）。
 *
 * 边界：
 *   - 只提供「任何 app 都一致」的连接纪律与封装，不携带任何业务 key / 业务策略；
 *   - 配置由消费 app 通过 forRootAsync 注入（包不读环境变量）；
 *   - keyPrefix 必填：多 app 共享 Redis 实例时的唯一隔离手段。
 *
 * 业务模块只注入 CacheService / 各数据结构服务，不直接接触底层 Redis 客户端；
 * 确需直连时注入 REDIS_CLIENT + KeyPrefixer，并经 withRedis() 统一降级。
 */
@Module({})
export class RedisCacheModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheModule.name);

  constructor(
    @Inject(REDIS_MODULE_OPTIONS)
    private readonly options: RedisModuleOptions,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly health: CacheHealthIndicator,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType | null,
  ) {}

  static forRootAsync(asyncOptions: RedisModuleAsyncOptions): DynamicModule {
    // useFactory 会被调用两次（此处一次、下方 CacheModule.registerAsync 一次），
    // 契约上要求幂等（配置读取天然满足）；validate 放在这里统一收口，
    // 保证两次拿到的都是经过 fail-fast 校验的同形状配置。
    const resolveOptions = async (
      ...args: Array<any>
    ): Promise<RedisModuleOptions> =>
      validateRedisModuleOptions(await asyncOptions.useFactory(...args));

    const optionsProvider: Provider = {
      provide: REDIS_MODULE_OPTIONS,
      useFactory: resolveOptions,
      inject: asyncOptions.inject ?? [],
    };

    return {
      module: RedisCacheModule,
      global: true,
      imports: [
        ...(asyncOptions.imports ?? []),
        CacheModule.registerAsync({
          isGlobal: true,
          imports: asyncOptions.imports ?? [],
          inject: asyncOptions.inject ?? [],
          useFactory: async (...args: Array<any>) => {
            const options = await resolveOptions(...args);
            return {
              stores: createCacheStores(options),
              // cache-manager 的 ttl 单位为毫秒；配置契约 defaultTtl 为秒
              ttl: options.defaultTtl * 1000,
            };
          },
        }),
      ],
      providers: [
        optionsProvider,
        {
          // KeyvRedis store 实例（内存模式为 null）。namespace / separator 的单一真相源：
          // KeyPrefixer、CacheService.invalidatePattern 都从这里派生前缀口径。
          provide: REDIS_STORE,
          inject: [CACHE_MANAGER],
          useFactory: (cache: Cache) => {
            for (const keyv of cache.stores) {
              const store = keyv.store;
              if (store instanceof KeyvRedis)
                return store as KeyvRedis<unknown>;
            }

            return null;
          },
        },
        {
          provide: REDIS_CLIENT,
          inject: [REDIS_STORE],
          useFactory: (store: KeyvRedis<unknown> | null) => store?.client ?? null,
        },
        CacheService,
        HashCacheService,
        CacheHealthIndicator,
        KeyPrefixer,
        RedisLockService,
        SortedSetCacheService,
      ],
      exports: [
        CacheService,
        HashCacheService,
        KeyPrefixer,
        RedisLockService,
        SortedSetCacheService,
        REDIS_CLIENT,
      ],
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    const url = buildRedisUrl(this.options);

    if (!url) {
      this.logger.warn('Redis 未配置，缓存模块使用内存 store');
      return;
    }

    const healthy = await this.health.ping();
    if (healthy) {
      this.logger.log(`Redis 连接正常 (prefix=${this.options.keyPrefix})`);
      return;
    }

    this.logger.error('Redis 已配置但不可达，启动终止');
    throw new Error('Redis is configured but not reachable');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    // @nestjs/cache-manager 的 onModuleDestroy 会先于本模块执行，
    // 通过遍历 stores 断开底层 @redis/client（node-redis）连接。
    // 因此到达这里时 isOpen 通常已为 false，属于正常行为。
    if (this.redisClient.isOpen) {
      try {
        await this.redisClient.quit();
        this.logger.log('Redis 连接已优雅关闭');
      }
      catch (err) {
        this.logger.warn(
          `Redis 关闭异常: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    else {
      this.logger.log('Redis 连接已关闭 (由 cache-manager 生命周期管理)');
    }
  }
}
