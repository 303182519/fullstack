import type { RedisClientType } from '@fedstack/redis';
import type { SseEnvelope } from '@/shared/sse/sse.util.js';
import { KeyPrefixer, REDIS_CLIENT, withRedis } from '@fedstack/redis';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Redis Stream per-entity 事件入口（jobs/:id/events + 未来 agent/runs/:id/events）。
 *
 * 设计要点：
 *   - 每个实体（jobId / agentRunId）有**专属 Redis Stream key**，天然支持断线续传；
 *   - 发布（XADD）复用共享 REDIS_CLIENT（非阻塞命令，不影响 Pub/Sub / 缓存连接）；
 *   - 订阅（XREAD BLOCK）duplicate 独占连接（阻塞命令会占用连接，必须隔离）；
 *   - 每条 Stream 用 XADD MAXLEN 限制条目数 + EXPIRE 设置过期，防止 Redis 无限膨胀；
 *   - 所有 key 经 KeyPrefixer 加前缀，多 app 共享 Redis 实例时自动隔离。
 *
 * 连接纪律（与 PubSubService 一致）：
 *   发布方（XADD）── 共享 REDIS_CLIENT（普通命令连接，不阻塞）
 *   订阅方（XREAD BLOCK）── duplicate 独占连接（阻塞命令必须隔离）
 */
@Injectable()
export class StreamEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamEventsService.name);
  private readonly subscribers = new Set<RedisClientType>();

  /** 每条 Stream 保留的最大条目数（XADD MAXLEN）。超过时淘汰最旧的。 */
  private readonly streamMaxLen = 1000;
  /** Stream key 的默认过期时间（秒）。终止态实体的 Stream 在此时间后自动清理。 */
  private readonly streamTtlSeconds = 60 * 60 * 24; // 24h

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType | null,
    private readonly prefixer: KeyPrefixer,
  ) {}

  // ── 发布 ────────────────────────────────────────────────────────

  /**
   * 向指定实体的 Stream 追加一条事件。
   *
   * @param keyType Stream key 前缀类型，如 'job' / 'agent'
   * @param entityId 实体标识（jobId / agentRunId）
   * @param envelope 事件信封
   * @returns XADD 返回的 entry id（如 `1735044000000-0`）；Redis 不可用时返回 null
   */
  async publish<TData>(
    keyType: string,
    entityId: string,
    envelope: SseEnvelope<TData>,
  ): Promise<string | null> {
    if (!this.redis) {
      this.logger.warn(`Redis 未配置，Stream ${keyType}:${entityId} publish 降级 no-op`);
      return null;
    }
    const key = this.streamKey(keyType, entityId);
    try {
      // XADD MAXLEN ~ 1000 表示近似裁剪（更快），通常 99% 准确，足够
      const id = await this.redis.xAdd(
        key,
        '*',
        { event: envelope.event, data: JSON.stringify(envelope.data) },
        { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: this.streamMaxLen } },
      );
      // 每次发布都刷新 TTL，活跃实体的 Stream 不会被清理
      await this.redis.expire(key, this.streamTtlSeconds);
      return id;
    }
    catch (err) {
      this.logger.warn(
        `Stream ${keyType}:${entityId} publish 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  // ── 回放（历史事件） ─────────────────────────────────────────────

  /**
   * 回放指定 Stream 的历史事件（XRANGE）。
   *
   * 断线重连时传入 Last-Event-ID，服务端返回该 id 之后的所有事件供客户端对齐。
   * 不传 afterId 时返回全部历史（但受 MAXLEN 限制最多 1000 条）。
   *
   * @param keyType Stream key 前缀类型
   * @param entityId 实体标识
   * @param afterId 起点 entry id（不包含）；undefined 则从最早可用事件开始
   * @param limit 最多返回多少条；默认 1000
   */
  async listBacklog<TData = unknown>(
    keyType: string,
    entityId: string,
    afterId?: string,
    limit = 1000,
  ): Promise<StreamEntry<TData>[]> {
    if (!this.redis)
      return [];
    const key = this.streamKey(keyType, entityId);
    try {
      // XRANGE key (afterId+1 或 -) + COUNT limit
      const start = afterId ? this.incrStreamId(afterId) : '-';
      const raw = await this.redis.xRange(key, start, '+', { COUNT: limit });
      return raw.map(e => this.parseEntry<TData>(e));
    }
    catch (err) {
      this.logger.warn(
        `Stream ${keyType}:${entityId} backlog 回放失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  // ── 订阅（尾读新事件） ────────────────────────────────────────────

  /**
   * 创建 XREAD BLOCK 尾读迭代器（async generator）。
   *
   * 迭代器 yield StreamEntry<TData> 或 null（BLOCK 超时无新事件时）。
   * 调用方 for await 消费，遇到 null 时决定是继续等待还是因实体已终态而退出。
   *
   * 终止方式二选一：
   *   1. AbortSignal.abort() — 最直接，立刻关闭 subscriber 让 XREAD BLOCK 抛连接错，
   *      generator catch → finally 清理（推荐，teardown 时调用）
   *   2. for await 循环自然退出 — generator finally 清理，但需等 BLOCK 超时或有新事件
   *
   * @param keyType Stream key 前缀类型
   * @param entityId 实体标识
   * @param options.afterId 起始 entry id（从该 id 之后开始读）；不传则从 stream 末尾开始
   * @param options.blockMs BLOCK 超时（毫秒）；超时后 yield null 并继续阻塞
   * @param options.signal 外部中止信号；abort 时立刻关闭 subscriber 让迭代器退出
   */
  async* createTail<TData = unknown>(
    keyType: string,
    entityId: string,
    options: { afterId?: string; blockMs?: number; signal?: AbortSignal } = {},
  ): AsyncGenerator<StreamEntry<TData> | null, void, void> {
    if (!this.redis)
      return;

    const streamKey = this.streamKey(keyType, entityId);
    const blockMs = options.blockMs ?? 30_000;
    // 起始位置：有 afterId 则从它之后，没有则用 $（仅新消息）
    const startId = options.afterId ?? '$';

    // duplicate 独占连接：XREAD BLOCK 会阻塞连接，不能和共享 client 混用
    let subscriber: RedisClientType | null = null;
    try {
      subscriber = this.redis.duplicate();
      this.subscribers.add(subscriber);
      await subscriber.connect();
    }
    catch (err) {
      this.logger.warn(
        `Stream ${keyType}:${entityId} XREAD BLOCK 连接失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (subscriber)
        this.subscribers.delete(subscriber);
      return;
    }

    // AbortSignal 触发时立刻关闭 subscriber——XREAD BLOCK 会抛连接错让迭代器退出
    const onAbort = () => {
      if (subscriber?.isOpen) {
        try {
          subscriber.quit();
        }
        catch { /* socket 可能已关闭 */ }
      }
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      let cursor = startId;
      while (!options.signal?.aborted) {
        try {
          const result = await subscriber.xRead(
            [{ key: streamKey, id: cursor }],
            { BLOCK: blockMs, COUNT: 100 },
          );
          if (!result) {
            // BLOCK 超时无新事件
            yield null;
            continue;
          }
          for (const stream of result) {
            for (const e of stream.messages) {
              cursor = e.id;
              yield this.parseEntry<TData>(e);
            }
          }
        }
        catch (err) {
          // XREAD BLOCK 异常（abort 触发的连接关闭、Redis 故障等）：退出迭代器
          if (options.signal?.aborted)
            return; // abort 主动触发——静默退出
          this.logger.warn(
            `Stream ${keyType}:${entityId} XREAD 异常: ${err instanceof Error ? err.message : String(err)}`,
          );
          yield null;
          return;
        }
      }
    }
    finally {
      options.signal?.removeEventListener('abort', onAbort);
      this.subscribers.delete(subscriber);
      if (subscriber.isOpen) {
        try {
          await subscriber.quit();
        }
        catch { /* socket 已销毁等 */ }
      }
    }
  }

  // ── 工具 ────────────────────────────────────────────────────────

  /** 构造 Stream key：`{prefix}:rt:stream:{type}:{entityId}` */
  private streamKey(type: string, entityId: string): string {
    return this.prefixer.prefix(`rt:stream:${type}:${entityId}`);
  }

  /**
   * 把 XRANGE / XREAD 返回的 `{ id: "timestamp-seq", message: Record<string, string> }`
   * 转为 StreamEntry。data 字段是 JSON 字符串，parse 失败时保留原始字符串。
   */
  private parseEntry<TData>(raw: {
    id: string;
    message: Record<string, unknown>;
  }): StreamEntry<TData> {
    const rawEvent = String(raw.message.event ?? '');
    const rawDataStr = String(raw.message.data ?? '');
    let data: TData;
    try {
      data = JSON.parse(rawDataStr) as TData;
    }
    catch {
      data = rawDataStr as unknown as TData;
    }
    return {
      id: raw.id,
      event: rawEvent,
      data,
    };
  }

  /**
   * 计算 entry id 的「后继」（XRANGE 需要起点是 afterId 的**下一个** id）。
   *
   * Redis Stream entry id 格式 `timestamp-sequence`。在 sequence 段 +1 得到下一个。
   * 边界：timestamp 9999999999999、sequence 999999 几乎不可能——此时回退 `+`（最大可能）。
   */
  private incrStreamId(id: string): string {
    const m = /^(\d+)-(\d+)$/.exec(id);
    if (!m)
      return '+';
    const ts = m[1];
    const seq = Number(m[2]);
    if (seq < Number.MAX_SAFE_INTEGER)
      return `${ts}-${seq + 1}`;
    return '+';
  }

  async onModuleDestroy(): Promise<void> {
    for (const s of this.subscribers) {
      if (s.isOpen) {
        try {
          await s.quit();
        }
        catch { /* socket 已销毁 */ }
      }
    }
    this.subscribers.clear();
  }
}

/**
 * 解析后的 Stream entry。
 */
export interface StreamEntry<TData = unknown> {
  /** Redis Stream entry id，如 `1735044000000-0` */
  id: string;
  /** SSE event 行值（如 job.snapshot / job.completed） */
  event: string;
  /** 业务数据（XADD 时的 data JSON） */
  data: TData;
}
