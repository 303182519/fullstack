import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration.js';
import { JobQueueService } from './job-queue.service.js';

/**
 * BullMQ 队列接入层（Phase 2，上游 build-server 架构对齐）。
 *
 * 本模块与 Phase 1 的持久化层（JobsModule）解耦：
 *   - JobsModule 负责 DB 状态机（SysJobRun 条件更新）+ Handler 注册中心
 *   - 本模块负责 BullMQ Worker / Queue 的连接 + 入队 + 移除
 *   - JobService 聚合两者（submit = 落库 → 入队 → 补写 bullJobId；cancel 双端推进）
 *
 * BullMQ 调优：
 *   - Redis 未配置时**直接 throw**（不静默降级）：任务中心在生产必须显式提供 Redis。
 *     开发/测试环境同样要求显式配置——避免在"没启 Redis 的 CI"里悄悄退化成不可用状态。
 *   - keyPrefix = `${REDIS_KEY_PREFIX}:bull`：多 app 共享同一 Redis 实例时 BullMQ 数据隔离。
 *   - maxRetriesPerRequest: null（在 connection 级）：BullMQ Worker 无 per-request 并发重试队列，
 *     重试由 BullMQ 内部机制 + JobProcessor 统一处理。
 *   - enableReadyCheck: false（在 connection 级）：Worker 启动时跳过 ready 探测。
 *   - removeOnComplete / removeOnFail = { count: 1000 }（在 registerQueue 的 defaultJobOptions 里）：
 *     Redis 只保留最近 1000 条状态快照，权威执行记录在 MySQL sys_job_run 表。
 *   - streams.events.maxLen = 10000（在 forRootAsync 顶层）：QueueEvents 回放窗口上限，防止 Redis 无限膨胀。
 *
 * 队列命名：统一 `default`（Phase 2 替代旧 QueueModule 的 `message` 队列）。
 * 所有业务任务（message-send / audit-log / file-cleanup / 未来新增）
 * 共用 BullMQ 队列，靠 job.name + IJobHandler 注册中心分发。
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redis = getConfig(configService).redis;

        // 严格模式：必须显式配置 Redis，否则启动直接失败。
        // 任务中心没有"无 Redis fallback"的合法运行态。
        if (!redis.url && !redis.host) {
          throw new Error(
            '[JobQueueModule] REDIS_URL 或 REDIS_HOST 未配置。'
            + ' 任务中心依赖 Redis 作为 BullMQ 队列后端，不支持无 Redis 降级。',
          );
        }

        const keyPrefix = redis.keyPrefix ?? 'admin-api';

        return {
          connection: buildRedisConnection(redis),
          // BullMQ 内部 key 前缀：`admin-api:bull:queue:...`
          prefix: `${keyPrefix}:bull`,
          // 限制 BullMQ 内部 events Stream 的最大条目数，防止无限增长。
          // 仅用于 QueueEvents 回放，保留最近 10000 条足够覆盖运维排查窗口。
          streams: { events: { maxLen: 10000 } },
        };
      },
    }),
    BullModule.registerQueue({
      name: 'default',
      // 自动清理已完成 / 已失败的 Job 数据，防止 Redis 无限膨胀。
      // 项目已用 MySQL（job_runs 表）作为权威持久化存储，Redis 仅保留最近 1000 条
      // 供 BullMQ 运行时查询和短期运维排查，历史数据以 MySQL 为准。
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    }),
  ],
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobQueueModule {}

/**
 * 解析 Redis 连接配置为 BullMQ ioredis 形状。
 *
 * 关键：BullMQ 的 `connection` 对象同时也是 ioredis 配置——
 * `maxRetriesPerRequest: null` 和 `enableReadyCheck: false` 是 ioredis 级字段，
 * 必须放在 connection 对象里才能生效。
 *
 * 支持两种输入：
 *   1. `redis.url`（redis://user:pass@host:port/db）—— 优先使用
 *   2. 拆分 host/port/password/db —— url 缺失时 fallback
 *
 * URL 解析额外处理：
 *   - username（Redis 6 ACL 场景）
 *   - tls（rediss:// 或查询参数 `tls=true`）
 */
function buildRedisConnection(redis: {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}): Record<string, unknown> {
  // ioredis 级配置：BullMQ Worker 无 per-request 并发重试队列
  const base = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  if (redis.url) {
    const parsed = new URL(redis.url);
    const conn: Record<string, unknown> = {
      ...base,
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      db: Number(parsed.pathname?.slice(1)) || 0,
    };
    if (parsed.password)
      conn.password = decodeURIComponent(parsed.password);
    if (parsed.username)
      conn.username = decodeURIComponent(parsed.username);
    // rediss:// 或 url?tls=1 → 开启 TLS
    if (parsed.protocol === 'rediss:' || parsed.searchParams.get('tls'))
      conn.tls = {};
    return conn;
  }

  // fallback：拆分字段
  const conn: Record<string, unknown> = {
    ...base,
    host: redis.host ?? 'localhost',
    port: redis.port ?? 6379,
    db: redis.db ?? 0,
  };
  if (redis.password)
    conn.password = redis.password;
  return conn;
}
