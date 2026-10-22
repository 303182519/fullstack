import type { JobRunStatus as JobRunStatusType } from '@fedstack/database';
import type {
  IJobDeadLetterView,
  IJobRunView,
  IListJobsQuery,
  ISubmitJobInput,
} from '../types/job.types.js';
import { JobRunStatus, JobTriggerType } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { jobErrors } from '../errors.js';
import { JobQueueService } from '../queue/job-queue.service.js';
import { JobRecordService } from '../records/job-record.service.js';
import { JobRegistryService } from '../registry/job-registry.service.js';

/**
 * 异步任务业务入口（Phase 2）。
 *
 * 本服务是模块对外唯一提交点——业务模块不直接碰 JobRecordService / JobQueueService，
 * 统一调 JobService.submit() / cancel() / compensate()。
 *
 * submit 原子链路：
 *   1. registry.get(name) 校验 handler 已注册（400）
 *   2. records.createQueued() 落库（初始状态 queued 或 delayed 按 delayMs 决定）
 *   3. queue.enqueue() BullMQ 入队（带 job- 前缀的幂等 jobId）
 *   4. records.attachBullJobId() 回写 bullJobId
 *   ✅ 步骤 3 失败时：DB 记录推进至 failed 终态 → 抛异常（防止悬空 queued 记录）
 *
 * cancel 双端推进：
 *   1. records.markCancelledIfCancellable(jobId) — DB 条件更新，返回 null 说明已被抢占
 *   2. queue.remove(jobId) — BullMQ 移除（即使 DB 条件更新已返回 null 也尝试，幂等）
 *   ✅ DB 条件更新失败时抛 JOB_NOT_CANCELLABLE
 *
 * compensate 死信补偿：
 *   1. records.findDeadLetters() 查出 DB 卡在非终态的记录
 *   2. records.getEntityOrFail(jobId) 取当前 DB 状态
 *   3. queue.exists(jobId) 查 BullMQ 队列里是否仍存在
 *      - DB 非终态 + BullMQ 存在 → 说明只是 DB 状态卡住，无需干预（Worker 会继续推进）
 *      - DB 非终态 + BullMQ 不存在 → 重新入队（queue.enqueue）或标记 failed
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly records: JobRecordService,
    private readonly registry: JobRegistryService,
    private readonly queue: JobQueueService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  // ── 提交任务 ─────────────────────────────────────────────────

  /**
   * 提交异步任务。
   *
   * @throws JOB_HANDLER_NOT_FOUND 任务名未在 registry 注册
   */
  async submit(input: ISubmitJobInput): Promise<IJobRunView> {
    // Step 1: handler 存在性校验
    this.registry.get(input.name); // 不存在时抛 400

    // Step 2: 落库
    const jobView = await this.records.createQueued({
      name: input.name,
      queueName: 'default',
      payload: input.payload,
      maxAttempts: input.attempts ?? 1,
      triggerType: input.triggerType ?? (input.delayMs ? JobTriggerType.SYSTEM : JobTriggerType.MANUAL),
      createdBy: input.createdBy,
      tenantId: input.tenantId,
      status: input.delayMs ? JobRunStatus.DELAYED : JobRunStatus.QUEUED,
    });

    try {
      // Step 3: BullMQ 入队
      const bullJobId = await this.queue.enqueue(
        jobView.id,
        input.name,
        { jobId: jobView.id, name: input.name, payload: input.payload },
        {
          delayMs: input.delayMs,
          attempts: input.attempts,
          backoffMs: input.backoffMs,
        },
      );

      // Step 4: 补写 bullJobId 到 DB（领域视图 IJobRunView 不暴露 BullMQ 内部 id，
      // 所以直接返回 createQueued 拿到的 jobView 即可，无需额外 DB round-trip）
      await this.records.attachBullJobId(jobView.id, bullJobId);
      return jobView;
    }
    catch (error) {
      // 入队失败关键保护：DB 记录不能悬空在 queued/delayed——直接推进至 failed 终态
      this.logger.error(
        `submit 入队失败，DB 记录推进至 failed: jobId=${jobView.id} name=${input.name} error=${error}`,
      );
      await this.records.markAttemptFailure(
        jobView.id,
        0,
        error,
        true, // isFinal: 入队失败无法重试
      );
      throw error;
    }
  }

  // ── 查询 / 取消 ────────────────────────────────────────────────

  async findById(jobId: string): Promise<IJobRunView> {
    const row = await this.records.getEntityOrFail(jobId);
    this.assertTenantAccess(row.tenantId);
    return this.records.toDomain(row);
  }

  /**
   * 分页查询。租户隔离由 ScopeResolverService 保证：
   *   - 租户管理员忽略客户端 tenantId，强制本租户 + 平台级；
   *   - 平台超管默认全部，显式传 tenantId 时代管该租户。
   */
  async list(
    query: Omit<IListJobsQuery, 'scopeTenantId'>,
    delegatedTenantId?: string,
  ): Promise<ReturnType<JobRecordService['list']>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    return this.records.list({ ...query, scopeTenantId: scope.tenantId });
  }

  /**
   * 取消任务。租户隔离校验：非超管只能取消本租户 + 平台级任务。
   *
   * @throws JOB_NOT_CANCELLABLE 已被 worker 抢占或达终态
   * @throws JOB_TENANT_FORBIDDEN 非超管取消其他租户任务
   */
  async cancel(jobId: string): Promise<IJobRunView> {
    const row = await this.records.getEntityOrFail(jobId);
    this.assertTenantAccess(row.tenantId);

    // DB 条件更新优先：queued/delayed 才可被拦截
    const cancelled = await this.records.markCancelledIfCancellable(jobId);
    if (!cancelled)
      throw jobErrors.notCancellable(jobId);

    // BullMQ 移除（幂等：已消费/已完成时 BullMQ 返回 false，忽略即可）
    await this.queue.remove(jobId);

    return this.records.toDomain(cancelled);
  }

  // ── 死信补偿 ──────────────────────────────────────────────────

  /**
   * 查询死信（DB 卡在非终态且超过阈值未推进的任务）。
   *
   * 阈值默认 10 分钟。租户隔离同 list()。
   */
  async findDeadLetters(
    timeoutMs = 10 * 60 * 1000,
    name?: string,
    delegatedTenantId?: string,
  ): Promise<IJobDeadLetterView[]> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    return this.records.findDeadLetters(timeoutMs, name, scope.tenantId);
  }

  /**
   * 补偿单个死信任务。租户隔离校验同 cancel()。
   *
   * 决策逻辑：
   *   - DB 已达终态 → 抛 JOB_COMPENSATE_FAILED（不可补偿）
   *   - DB 非终态 + BullMQ 队列里还存在 → 无需干预（Worker 会继续推进），返回 null
   *   - DB 非终态 + BullMQ 队列里不存在 → 重新入队（queue.enqueue），返回新的领域视图
   *
   * 幂等：同一个死信任务重复调 compensate 不会产生双重入队——
   * 先查 queue.exists 确认 BullMQ 状态再决策。
   */
  async compensate(jobId: string): Promise<IJobRunView | null> {
    const row = await this.records.getEntityOrFail(jobId);
    this.assertTenantAccess(row.tenantId);

    const status = row.status as JobRunStatusType;

    // 终态任务不可补偿
    if (status === JobRunStatus.COMPLETED
      || status === JobRunStatus.FAILED
      || status === JobRunStatus.CANCELLED) {
      throw jobErrors.compensateFailed(jobId);
    }

    // BullMQ 仍存在 → Worker 还在处理，不干预
    const exists = await this.queue.exists(jobId);
    if (exists) {
      this.logger.debug(`compensate 跳过: jobId=${jobId} BullMQ 队列中仍存在（Worker 处理中）`);
      return null;
    }

    // 重新入队
    this.logger.warn(`compensate 重新入队: jobId=${jobId} 原状态=${status}`);
    const bullJobId = await this.queue.enqueue(
      jobId,
      row.name,
      { jobId, name: row.name, payload: row.payload },
      {
        attempts: row.maxAttempts,
      },
    );

    // 把 BullMQ 侧的实际 job id 写回数据库，使 DB 记录与队列中的状态相互对应 。
    await this.records.attachBullJobId(jobId, bullJobId);
    return this.records.getViewOrFail(jobId);
  }

  /**
   * 租户越权校验。
   *
   * 规则：
   *   - 超管平台级（scope.tenantId === null）→ 全量可见，放行；
   *   - 平台级任务（row.tenantId === null）→ 所有人可见，放行；
   *   - 其余 → scope.tenantId 必须等于 row.tenantId。
   */
  private assertTenantAccess(rowTenantId: bigint | null | undefined): void {
    const scope = this.scopeResolver.resolve();
    if (scope.tenantId === null)
      return; // 超管平台级：全量可见
    if (rowTenantId === null || rowTenantId === undefined)
      return; // 平台级任务：所有人可见
    if (scope.tenantId !== rowTenantId)
      throw jobErrors.tenantForbidden(rowTenantId.toString(), scope.tenantId.toString());
  }
}
