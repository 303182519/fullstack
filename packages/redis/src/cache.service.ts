import type { Cache } from 'cache-manager';
import KeyvRedis from '@keyv/redis';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';

/** SCAN + DELETE 操作所需的最小节点接口 */
interface ScanNode {
  scanIterator: (opts: {
    MATCH: string;
    COUNT: number;
  }) => AsyncIterable<string | string[]>;
  unlink: (keys: string[]) => Promise<number>;
  del: (keys: string[]) => Promise<number>;
}

/**
 * 统一封装的缓存读写入口，业务模块只接触它。
 *
 * 降级契约（与 redis-fallback.ts 的「可选层」哲学一致）：
 * 运行期 Redis 故障（断连 / 超时 / 命令 reject）时——
 *   - 读（get / wrap）：按缓存 miss 处理，返回 undefined / 直接回源 loader；
 *   - 写（set / del）：warn 日志后放行，不阻断业务（旧值由 TTL 与下次回源自愈）；
 *   - loader 自身抛出的业务错误原样上抛，绝不吞掉。
 * 「未配置 Redis」与「运行期故障」对调用方是同一个结果：缓存层不可用，按 miss / no-op 降级。
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * 当前缓存底层是否为 Redis。
   * 业务模块可据此切换"Redis 模式"与"无 Redis 时的回退实现"。
   */
  isRedisEnabled(): boolean {
    return this.getRedisStore() !== null;
  }

  /** 读。缓存层故障时按 miss 返回 undefined，由调用方回源。 */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cache.get<T>(key);
    }
    catch (err) {
      this.logger.warn(
        `get 降级为 miss (key=${key}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /**
   * 写。缓存层故障时 warn 放行（一致性由 TTL 与下次回源兜底）。
   * @param key 缓存键（建议走 CacheKeys 工厂）
   * @param value 缓存值（需可 JSON 序列化）
   * @param ttlSeconds 秒；不传则使用模块默认 TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<T> {
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds * 1000 : undefined;
    try {
      return await this.cache.set<T>(key, value, ttl);
    }
    catch (err) {
      this.logger.warn(
        `set 降级为 no-op (key=${key}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return value;
    }
  }

  /** 删。缓存层故障时 warn 放行并返回 false（下次读 miss 自然回源，可自愈）。 */
  async del(key: string | string[]): Promise<boolean> {
    try {
      if (Array.isArray(key))
        return await this.cache.mdel(key);
      return await this.cache.del(key);
    }
    catch (err) {
      this.logger.warn(
        `del 降级为 no-op (key=${String(key)}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * 命中直接返回；未命中执行 loader 后写入。
   * 手写「get → loader → set」而非 cache-manager 的 wrap()：
   * 缓存层异常走 get/set 的降级路径，loader 的业务异常原样上抛，两者不混淆。
   * 注意：不做 singleflight / 分布式锁，热点 key 击穿场景请改用 RedisLockService。
   */
  async wrap<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined)
      return cached;

    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * 按 pattern 失效缓存（仅 Redis store 支持；内存 store 下 warn 并返回 0）。
   * pattern 是 Redis SCAN 的 MATCH 模式，会自动叠加 keyPrefix 命名空间。
   * 例：传入 "user:*" 删除所有以 "user:" 开头的缓存
   *
   * 拓扑无关：自动检测单机 / 集群。
   *   - 单机：对唯一节点执行 SCAN + DELETE
   *   - 集群：key 按 hash slot 分布在多个 master 上，逐 master 并行 SCAN + DELETE，
   *     单节点失败不阻塞其余（已删的 key 不会复活，剩余节点下次调用可补齐）
   * 集群检测基于 @redis/client v5 API：RedisCluster.masters 是 MasterNode[] 数组，
   * 每个 MasterNode.client 是该节点的独立连接。
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const redisStore = this.getRedisStore();
    if (!redisStore) {
      this.logger.warn(
        `invalidatePattern 在内存 store 下不支持，已忽略 pattern=${pattern}`,
      );
      return 0;
    }

    const namespace = redisStore.namespace;
    const separator = redisStore.keyPrefixSeparator;
    const fullPattern = namespace
      ? `${namespace}${separator}${pattern}`
      : pattern;

    const client = redisStore.client as unknown;
    const useUnlink = redisStore.useUnlink;

    const masters = this.getClusterMasterNodes(client);
    if (masters) {
      const settled = await Promise.allSettled(
        masters.map(node => this.scanAndDeleteNode(node, fullPattern, useUnlink)),
      );

      let deleted = 0;
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          deleted += result.value;
        }
        else {
          this.logger.warn(
            `invalidatePattern 集群节点 SCAN 失败，已跳过: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          );
        }
      }
      return deleted;
    }

    return this.scanAndDeleteNode(
      client as ScanNode,
      fullPattern,
      useUnlink,
    );
  }

  /**
   * 若 client 是 @redis/client v5 的 RedisCluster，返回各 master 节点的连接数组；
   * 否则返回 null（单机）。MasterNode.client 在集群未就绪时可能为 undefined，过滤之。
   */
  private getClusterMasterNodes(client: unknown): ScanNode[] | null {
    if (
      client != null
      && typeof client === 'object'
      && 'masters' in client
      && Array.isArray((client as { masters: unknown }).masters)
    ) {
      return (client as { masters: Array<{ client?: ScanNode }> }).masters.map(m => m.client).filter((c): c is ScanNode => c != null);
    }
    return null;
  }

  /** 对单个 Redis 节点执行 SCAN 匹配 + 批量删除，返回删除数量。 */
  private async scanAndDeleteNode(
    node: ScanNode,
    pattern: string,
    useUnlink: boolean,
  ): Promise<number> {
    let deleted = 0;
    const batch: string[] = [];
    const flush = async () => {
      if (batch.length === 0)
        return;
      const fn = useUnlink ? node.unlink : node.del;
      deleted += await fn.call(node, batch.splice(0));
    };

    for await (const chunk of node.scanIterator({
      MATCH: pattern,
      COUNT: 200,
    })) {
      if (Array.isArray(chunk))
        batch.push(...chunk);
      else batch.push(chunk);
      if (batch.length >= 500)
        await flush();
    }
    await flush();
    return deleted;
  }

  private getRedisStore(): KeyvRedis<unknown> | null {
    for (const keyv of this.cache.stores) {
      const store = (keyv as unknown as { store?: unknown }).store;
      if (store instanceof KeyvRedis)
        return store as KeyvRedis<unknown>;
    }
    return null;
  }
}
