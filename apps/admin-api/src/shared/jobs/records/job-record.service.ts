import type {
  JobRunStatus as JobRunStatusType,
  JobTriggerType,
  SysJobRunModel as PrismaSysJobRun,
} from '@fedstack/database';
import type {
  IJobDeadLetterView,
  IJobRunCreateData,
  IJobRunView,
  IListJobsQuery,
} from '../types/job.types.js';
import type { SseEnvelope } from '@/shared/sse/sse.util.js';
import { JobRunStatus, Prisma } from '@fedstack/database';
import { KeyPrefixer } from '@fedstack/redis';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { StreamEventsService } from '@/shared/sse/stream-events.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import {
  JOB_SSE_EVENT,
  JOB_TERMINAL_STATUSES,
} from '../constants/job.constants.js';
import { jobErrors } from '../errors.js';

/** errorMessage 字段的 DB 列长度上限（见 SysJobRun 定义 @db.VarChar(2000)） */
const MAX_ERROR_MESSAGE_LENGTH = 2000;

/**
 * 任务执行记录（SysJobRun）持久化层。
 *
 * 职责：把领域状态机（queued/delayed → active → completed/failed/cancelled）翻译成
 * Prisma 写操作，并保证关键状态推进是**条件更新**（WHERE 带上旧状态），
 * 从而在并发 / 重复消费下不产生双重执行或错误的终态覆盖。
 *
 * 对外只返回领域视图 IJobRunView，不暴露 Prisma 行类型 PrismaSysJobRun。
 *
 * 不负责 BullMQ 操作（由 JobQueueService 负责）。
 *
 * 状态变更事件（ADR-013 D5）：每次成功推进状态机后，向 `rt:job:{tenantId|platform}`
 * 频道发布「有变化」提醒（仅 id + status，不含业务数据），前端收到后走拉取接口对齐。
 * 发布为 fire-and-forget：失败仅 warn，绝不影响状态机主流程（best-effort）。
 */
@Injectable()
export class JobRecordService {
  private readonly logger = new Logger(JobRecordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefixer: KeyPrefixer,
    private readonly streamEvents: StreamEventsService,
  ) {}

  // ── 映射：DB 行 → 领域视图 ────────────────────────────────────

  toDomain(row: PrismaSysJobRun): IJobRunView {
    return {
      id: row.id.toString(),
      name: row.name,
      queueName: row.queueName,
      status: row.status as JobRunStatusType,
      progress: row.progress,
      payload: row.payload ?? undefined,
      result: row.result ?? undefined,
      errorMessage: row.errorMessage,
      attemptsMade: row.attemptsMade,
      maxAttempts: row.maxAttempts,
      // Prisma enum 值由写入路径保证合法，此处直接收窄为领域类型
      triggerType: row.triggerType as JobTriggerType,
      createdBy: row.createdBy ? row.createdBy.toString() : null,
      tenantId: row.tenantId ? row.tenantId.toString() : null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  // ── 创建 / 状态机推进 ──────────────────────────────────────────

  /**
   * 创建 queued 状态的任务记录（JobService.submit 流程的第一步）。
   *
   * 生成雪花 ID，落库状态按 delayMs 决定（delayed/queued）。
   * 返回带 id 的领域视图，供调用方拿 id 去入队 BullMQ（bullJobData 里回传这个 id）。
   */
  async createQueued(data: IJobRunCreateData): Promise<IJobRunView> {
    const row = await this.prisma.sysJobRun.create({
      data: {
        id: BigInt(generateSnowflakeId()),
        tenantId: data.tenantId ? BigInt(data.tenantId) : undefined,
        name: data.name,
        queueName: data.queueName,
        triggerType: data.triggerType,
        status: data.status ?? JobRunStatus.QUEUED,
        maxAttempts: data.maxAttempts ?? 1,
        createdBy: data.createdBy ? BigInt(data.createdBy) : undefined,
        ...(data.payload != null ? { payload: data.payload as Prisma.InputJsonValue } : {}),
      },
    });
    const view = this.toDomain(row);
    // 新任务出现（queued / delayed）：通知任务中心刷新列表
    this.publishStatusEvent(view.id, view.status);
    return view;
  }

  /**
   * 条件激活：仅当任务仍可执行（queued / delayed）时推进到 active。
   *
   * 返回 false 表示取消或其他终态已抢先写入，worker 应跳过执行
   * （不会在 BullMQ 侧影响重试——worker 侧应返回 skip 结果，让 BullMQ 正常完成该 job）。
   *
   * startedAt 只在首次激活时写入（null → now()），重试场景保留原值。
   */
  async markActive(
    jobId: string,
    bullJobId?: string,
    attemptsMade?: number,
  ): Promise<boolean> {
    const bigintId = BigInt(jobId);

    // 先查 startedAt 是否已存在——重试场景不覆盖
    const existing = await this.prisma.sysJobRun.findUnique({
      where: { id: bigintId },
      select: { startedAt: true },
    });

    const result = await this.prisma.sysJobRun.updateMany({
      where: {
        id: bigintId,
        status: { in: [JobRunStatus.QUEUED, JobRunStatus.DELAYED] },
      },
      data: {
        status: JobRunStatus.ACTIVE,
        ...(bullJobId != null ? { bullJobId } : {}),
        ...(typeof attemptsMade === 'number' ? { attemptsMade } : {}),
        // COALESCE(started_at, NOW()) 等价：仅首次激活时写入
        ...(!existing?.startedAt ? { startedAt: new Date() } : {}),
      },
    });

    if (result.count > 0) {
      this.publishStatusEvent(jobId, JobRunStatus.ACTIVE);
    }
    return result.count > 0;
  }

  /**
   * 更新执行进度（0-100 归一化）。
   *
   * 条件更新：仅 active 状态可推进进度，防止 cancel 后继续更新进度。
   * progress 归一化：Math.max(0, Math.min(100, Math.round(progress)))。
   */
  async updateProgress(jobId: string, progress: number): Promise<void> {
    const normalized = Math.max(0, Math.min(100, Math.round(progress)));
    const bigintId = BigInt(jobId);

    await this.prisma.sysJobRun.updateMany({
      where: {
        id: bigintId,
        status: JobRunStatus.ACTIVE,
      },
      data: {
        progress: normalized,
        status: JobRunStatus.ACTIVE,
      },
    });
  }

  /**
   * 条件标记完成：仅 active 状态可推进到 completed。
   *
   * 如果任务已被 cancel/complete（条件不匹配导致 count=0），
   * 静默跳过——不会错误覆盖终态。
   */
  async markCompleted(
    jobId: string,
    result: unknown,
    attemptsMade?: number,
  ): Promise<void> {
    const bigintId = BigInt(jobId);

    const updated = await this.prisma.sysJobRun.updateMany({
      where: {
        id: bigintId,
        status: JobRunStatus.ACTIVE,
      },
      data: {
        status: JobRunStatus.COMPLETED,
        progress: 100,
        result: (result as Prisma.InputJsonValue) ?? Prisma.DbNull,
        errorMessage: null,
        ...(typeof attemptsMade === 'number' ? { attemptsMade } : {}),
        finishedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      this.logger.warn(
        `markCompleted 跳过: jobId=${jobId} 当前状态非 active（可能已被 cancel 或完成）`,
      );
      return;
    }
    // tenantId 未知，由发布方法内补查（主键索引，低频事件可接受）
    this.publishStatusEvent(jobId, JobRunStatus.COMPLETED);
  }

  /**
   * 补写 BullMQ job id 到 DB。
   *
   * JobService.submit 在 BullMQ enqueue 成功后回写——失败不影响任务执行
   * （bullJobId 仅用于队列查询/取消，worker 照样消费）。
   */
  async attachBullJobId(jobId: string, bullJobId: string): Promise<void> {
    await this.prisma.sysJobRun.update({
      where: { id: BigInt(jobId) },
      data: { bullJobId },
    });
  }

  /**
   * 条件标记失败。
   *
   * - isFinal=true：直接推进至 failed 终态（attemptsMade >= maxAttempts）
   * - isFinal=false：回退至 queued 等待 BullMQ 下次重试（attemptsMade < maxAttempts）
   *
   * 条件更新 WHERE status = active：防止并发 cancel 后被错误恢复。
   */
  async markAttemptFailure(
    jobId: string,
    attemptsMade: number,
    error: unknown,
    isFinal: boolean,
  ): Promise<void> {
    const bigintId = BigInt(jobId);
    const errorMessage = this.stringifyError(error);

    if (isFinal) {
      // 终态失败：无条件写入（不做 status 守卫——万一任务已被 markCompleted/cancelled，
      // 就让 completed/cancelled 胜出；但如果条件匹配不到会静默跳过）
      const updated = await this.prisma.sysJobRun.updateMany({
        where: { id: bigintId },
        data: {
          status: JobRunStatus.FAILED,
          attemptsMade,
          errorMessage,
          finishedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        this.logger.warn(
          `markAttemptFailure(isFinal=true) 跳过: jobId=${jobId}`,
        );
        return;
      }
      this.publishStatusEvent(jobId, JobRunStatus.FAILED);
      return;
    }

    // 非终态失败：条件回退至 queued（仅 active 状态可回退）
    const retried = await this.prisma.sysJobRun.updateMany({
      where: {
        id: bigintId,
        status: JobRunStatus.ACTIVE,
      },
      data: {
        status: JobRunStatus.QUEUED,
        attemptsMade,
        errorMessage,
      },
    });
    if (retried.count > 0)
      this.publishStatusEvent(jobId, JobRunStatus.QUEUED);
  }

  /**
   * 条件取消：仅 queued / delayed 状态可被 cancel 拦截。
   *
   * 返回 null 表示已不可取消（已被 worker 抢走或已达终态），
   * 调用方应向上抛 JOB_NOT_CANCELLABLE。
   *
   * 并发安全：条件更新 count=0 时不会产生覆盖。
   */
  async markCancelledIfCancellable(jobId: string): Promise<PrismaSysJobRun | null> {
    const bigintId = BigInt(jobId);

    const result = await this.prisma.sysJobRun.updateMany({
      where: {
        id: bigintId,
        status: { in: [JobRunStatus.QUEUED, JobRunStatus.DELAYED] },
      },
      data: {
        status: JobRunStatus.CANCELLED,
        finishedAt: new Date(),
      },
    });

    if (!result.count) {
      return null;
    }

    const row = await this.prisma.sysJobRun.findUniqueOrThrow({
      where: { id: bigintId },
    });
    this.publishStatusEvent(jobId, JobRunStatus.CANCELLED);
    return row;
  }

  // ── 查询 ───────────────────────────────────────────────────────

  async getEntityOrFail(jobId: string): Promise<PrismaSysJobRun> {
    const bigintId = BigInt(jobId);
    const row = await this.prisma.sysJobRun.findUnique({
      where: { id: bigintId },
    });
    if (!row)
      throw jobErrors.notFound(jobId);
    return row;
  }

  async getViewOrFail(jobId: string): Promise<IJobRunView> {
    return this.toDomain(await this.getEntityOrFail(jobId));
  }

  /**
   * 分页查询。findMany + count 用 Prisma 原生 $transaction 保证同一快照。
   *
   * 排序：createdAt DESC + id DESC（雪花 ID 与 createdAt 同序，稳定次级键，防止分页漂移）。
   *
   * 租户过滤语义（scopeTenantId 由 JobService 经 ScopeResolverService 解析，非客户端原始值）：
   *   - undefined/null scopeTenantId → 不加租户过滤（超管平台级视图，全部可见）
   *   - bigint scopeTenantId → 精确租户 + 平台级（tenantId=null）都可见
   */
  async list(query: IListJobsQuery): Promise<{
    list: IJobRunView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SysJobRunWhereInput = {};

    // 租户过滤：bigint scope 时包含平台级（tenantId=null）；null/undefined scope 时不加过滤
    if (query.scopeTenantId !== undefined && query.scopeTenantId !== null) {
      where.OR = [
        { tenantId: query.scopeTenantId },
        { tenantId: null },
      ];
    }

    if (query.name)
      where.name = query.name;
    if (query.status)
      where.status = query.status;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.sysJobRun.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sysJobRun.count({ where }),
    ]);

    return {
      list: list.map(row => this.toDomain(row)),
      total,
      page,
      pageSize,
    };
  }

  // ── 死信检测 ───────────────────────────────────────────────────

  /**
   * 查询死信任务：DB 记录处于非终态且超过阈值仍未推进。
   *
   * 典型成因：
   *   - worker 进程崩溃/重启，active 状态无人推进
   *   - BullMQ job 被 Redis 清理（重启/maxLen 策略），queued/delayed 无人消费
   *   - Redis 断连期间 BullMQ 丢失 job，DB 记录未同步更新
   *
   * @param timeoutMs 阈值（毫秒）。非终态记录 updatedAt < now - timeoutMs 视为死信
   * @param name 可选按任务名过滤
   * @param scopeTenantId 已解析的租户作用域（JobService 注入）。bigint = 精确租户 + 平台级；null = 全部
   */
  async findDeadLetters(
    timeoutMs: number,
    name?: string,
    scopeTenantId?: bigint | null,
  ): Promise<IJobDeadLetterView[]> {
    const cutoff = new Date(Date.now() - timeoutMs);

    const where: Prisma.SysJobRunWhereInput = {
      status: { notIn: [...JOB_TERMINAL_STATUSES] }, // 还没结束
      updatedAt: { lt: cutoff }, // 但已经很久没被写过
    };

    if (name)
      where.name = name;

    // 租户过滤（同 list 语义）
    if (scopeTenantId !== undefined && scopeTenantId !== null) {
      where.OR = [
        { tenantId: scopeTenantId },
        { tenantId: null },
      ];
    }

    const rows = await this.prisma.sysJobRun.findMany({
      where,
      // `updatedAt` 越小 = 卡住越久 = 越该优先补偿。
      orderBy: [{ updatedAt: 'asc' }, { id: 'desc' }],
      take: 200,
    });

    return rows.map((row) => {
      const status = row.status as JobRunStatusType;
      let deadReason: IJobDeadLetterView['deadReason'];
      if (status === JobRunStatus.ACTIVE)
        deadReason = 'stuck_active';
      else if (status === JobRunStatus.DELAYED)
        deadReason = 'stuck_delayed';
      else
        deadReason = 'stuck_queued';

      return {
        id: row.id.toString(),
        name: row.name,
        status,
        progress: row.progress,
        attemptsMade: row.attemptsMade,
        maxAttempts: row.maxAttempts,
        errorMessage: row.errorMessage,
        tenantId: row.tenantId ? row.tenantId.toString() : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
        deadReason,
      };
    });
  }

  // ── 工具 ───────────────────────────────────────────────────────

  /**
   * 发布状态变更事件到 Redis Stream（per-entity，best-effort）。
   *
   * 供 JobsController GET /jobs/:id/events 端点消费：每条任务有专属 Stream key
   * `{prefix}:rt:stream:job:{jobId}`，支持 Last-Event-ID 断线续传。
   * Stream 自动 MAXLEN 1000 + EXPIRE 24h，防止 Redis 膨胀。
   *
   * fire-and-forget：不 await、不阻塞状态机；失败（Redis 不可用等）仅 warn。
   * DB（SysJobRun）是权威真相源，推送是辅助——客户端重连后以 Stream 回放对齐。
   *
   * @param jobId 任务记录 ID（雪花字符串）
   * @param status 本次推进到的目标状态
   * @param snapshot 完整领域视图。已知时传入（省一次查询）；
   *                 不传时方法内补查（主键索引）。
   */
  private publishStatusEvent(
    jobId: string,
    status: JobRunStatusType,
    snapshot?: IJobRunView,
  ): void {
    void (async () => {
      let jobView = snapshot;
      if (!jobView) {
        const row = await this.prisma.sysJobRun.findUnique({
          where: { id: BigInt(jobId) },
        });
        if (!row) {
          // 记录刚被清理（极少见），静默退出
          return;
        }
        jobView = this.toDomain(row);
      }

      const eventName = this.resolveSseEventName(status);
      const envelope: SseEnvelope<IJobRunView> = { event: eventName, data: jobView };
      await this.streamEvents.publish('job', jobId, envelope);
    })().catch((err: unknown) => {
      this.logger.warn(`任务 Stream 发布失败: jobId=${jobId} status=${status}`, err);
    });
  }

  /** JobRunStatus → SSE event name 映射 */
  private resolveSseEventName(status: JobRunStatusType): string {
    switch (status) {
      case JobRunStatus.COMPLETED: return JOB_SSE_EVENT.COMPLETED;
      case JobRunStatus.FAILED: return JOB_SSE_EVENT.FAILED;
      case JobRunStatus.CANCELLED: return JOB_SSE_EVENT.CANCELLED;
      default: return JOB_SSE_EVENT.UPDATED;
    }
  }

  /**
   * 把未知类型的 error 安全序列化成字符串。
   *
   * 截断到 MAX_ERROR_MESSAGE_LENGTH（DB 列长度 @db.VarChar(2000)），
   * 超出部分截断并追加 "...（已截断）"。
   */
  private stringifyError(error: unknown): string {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    else if (typeof error === 'string') {
      message = error;
    }
    else {
      try {
        message = JSON.stringify(error);
      }
      catch {
        message = String(error);
      }
    }

    if (message.length > MAX_ERROR_MESSAGE_LENGTH) {
      return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...（已截断）`;
    }
    return message;
  }
}
