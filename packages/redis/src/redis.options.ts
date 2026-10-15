import type { ModuleMetadata, Type } from '@nestjs/common';

/**
 * Redis 模块配置契约。
 *
 * 包不读取任何环境变量、不做 env 校验（与 ADR-001 D6 同一哲学：
 * 环境契约属于各 app 的配置层，共享包只接收解析后的选项）。
 */
export interface RedisModuleOptions {
  /** `redis://[:password@]host:port[/db]`；与 host 二选一，也可都不提供（降级内存 store） */
  url?: string;
  /** 主机；与 url 二选一 */
  host?: string;
  /** 端口，默认 6379 */
  port?: number;
  password?: string;
  /** DB 索引 (0-15) */
  db?: number;
  /**
   * Key 前缀（Keyv namespace），**必填**。
   * 多 app 共享同一 Redis 实例时，前缀是唯一的隔离手段；
   * 包刻意不提供默认值，防止两个 app 静默共用同一命名空间撞 key。
   */
  keyPrefix: string;
  /** 默认 TTL（秒），0 = 不过期 */
  defaultTtl: number;
}

/** 模块运行时选项的注入令牌（模块内部使用，不对外导出）。 */
export const REDIS_MODULE_OPTIONS = Symbol('REDIS_MODULE_OPTIONS');

/**
 * forRootAsync 入参。inject/useFactory 语义与 NestJS 标准异步模块一致。
 *
 * 注意：useFactory 会被调用两次（一次构建 cache-manager stores，一次产生
 * REDIS_MODULE_OPTIONS 供模块生命周期使用），因此必须保持幂等——
 * 「从 ConfigService 读配置」天然满足。
 */
export interface RedisModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: Array<Type<unknown> | string | symbol>;
  useFactory: (
    ...args: Array<any>
  ) => RedisModuleOptions | Promise<RedisModuleOptions>;
}

/** 由 host/port/password/db 拼连接串；显式 url 优先。两者皆无时返回 undefined（内存降级）。 */
export function buildRedisUrl(redis: {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}): string | undefined {
  if (redis.url)
    return redis.url;
  if (!redis.host)
    return undefined;
  const auth = redis.password ? `:${encodeURIComponent(redis.password)}@` : '';
  const db = typeof redis.db === 'number' ? `/${redis.db}` : '';
  return `redis://${auth}${redis.host}:${redis.port ?? 6379}${db}`;
}

/**
 * 启动期 fail-fast 校验：配置形状错误（尤其 keyPrefix 缺失）应让进程起不来，
 * 而不是带着撞 key 风险上线。
 */
export function validateRedisModuleOptions(
  options: RedisModuleOptions,
): RedisModuleOptions {
  if (typeof options?.keyPrefix !== 'string' || options.keyPrefix.length === 0) {
    throw new Error(
      'RedisModuleOptions.keyPrefix 必填：多 app 共享 Redis 实例时前缀是唯一隔离手段',
    );
  }
  if (
    typeof options.defaultTtl !== 'number'
    || Number.isNaN(options.defaultTtl)
    || options.defaultTtl < 0
  ) {
    throw new Error(
      'RedisModuleOptions.defaultTtl 必须是非负数字（秒，0 = 不过期）',
    );
  }
  return options;
}
