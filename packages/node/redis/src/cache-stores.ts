import type { RedisClientType } from '@keyv/redis';
import type { RedisModuleOptions } from './redis.options.js';
import KeyvRedis from '@keyv/redis';
import { Logger } from '@nestjs/common';
import { Keyv } from 'keyv';
import { buildRedisUrl } from './redis.options.js';

/**
 * 连接工厂：按配置构建 cache-manager 的 Keyv stores。
 *
 * 刻意写成独立于 NestJS DI 的纯函数：连接纪律（双层 error handler、
 * disableOfflineQueue、namespace 口径）是集群级正确性约束，必须可被单测覆盖。
 *
 * 未配置 Redis 时降级为进程内内存 store（Keyv 默认 Map），应用正常启动，
 * 适合本地开发或单机测试。
 */
export function createCacheStores(options: RedisModuleOptions): Keyv[] {
  const url = buildRedisUrl(options);

  if (!url) {
    // useKeyPrefix: false —— 进程内 Map 无需命名空间隔离，
    // 且保持与 Redis 模式一致的「前缀只由 KeyvRedis 负责」口径
    return [new Keyv({ namespace: options.keyPrefix, useKeyPrefix: false })];
  }

  const keyvRedis = new KeyvRedis(url, {
    // 让 KeyvRedis 单独承担命名空间职责，避免与 Keyv 的 useKeyPrefix 形成双重前缀
    namespace: options.keyPrefix,
    // 用 ':' 替代默认 '::'：更短、与业务 key 风格一致、运维更易读
    keyPrefixSeparator: ':',
    // 默认 true 会在连接失败时抛错；降级策略由模块 OnApplicationBootstrap 处理
    throwOnConnectError: false,
  });

  // 断连期间命令立即 reject，而不是挂进 offline queue 无限等重连——
  // 否则一个 get 能把请求挂住几十秒，业务层的 withRedis 降级也来不及生效。
  // 注意：当前 URL 直连只产生单机 client；若将来接入集群（createCluster），
  // cluster 的 options 结构不同，此处的单机断言需要同步改造（见 ADR-002 D4-3）。
  const redisClient = keyvRedis.client as RedisClientType;
  if (redisClient.options) {
    redisClient.options.disableOfflineQueue = true;
  }

  // KeyvRedis.initClient 会把底层 client 的 error 转发到自己身上；
  // 无人监听 adapter 的 error 事件时 EventEmitter 默认 throw，
  // 会升级成 uncaughtException 拖崩进程。这里仅日志吞错。
  keyvRedis.on('error', (err: unknown) => {
    Logger.warn(
      `Redis client error: ${err instanceof Error ? err.message : String(err)}`,
      'RedisCacheModule',
    );
  });

  // 底层 @redis/client 自身也会独立 emit 'error'（如 SocketClosedUnexpectedly），
  // KeyvRedis adapter 的 error 监听无法兜住所有场景；
  // 必须在原始 client 上也挂 error handler，否则 EventEmitter 默认 throw 会拖崩进程
  redisClient.on('error', (err: unknown) => {
    Logger.warn(
      `Redis underlying client error: ${err instanceof Error ? err.message : String(err)}`,
      'RedisCacheModule',
    );
  });

  // Keyv 构造时会强制把 store.namespace 覆盖成自己的 namespace（默认 'keyv'），
  // 所以必须显式传 namespace，否则 KeyvRedis 的 namespace 会被冲成 'keyv'
  // useKeyPrefix: false —— 关闭 Keyv 的二次前缀化，前缀完全由 KeyvRedis 负责
  // 这样落盘 key = `${namespace}${separator}${key}` = `admin-api:posts:list:xxx`
  // 与 cache.service 的 invalidatePattern（namespace+separator 派生）完全一致
  return [
    new Keyv({
      store: keyvRedis,
      namespace: options.keyPrefix,
      useKeyPrefix: false,
    }),
  ];
}
