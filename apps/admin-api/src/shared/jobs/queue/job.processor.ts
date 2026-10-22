import type { IBullJobData, IJobContext } from '../types/job.types.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DEFAULT_JOB_QUEUE } from '../constants/job.constants.js';
import { JobRecordService } from '../records/job-record.service.js';
import { JobRegistryService } from '../registry/job-registry.service.js';

/**
 * 通用任务处理器（Phase 2）。
 *
 * 这是 BullMQ Worker 端的唯一入口——它不包含任何业务逻辑，
 * 只做三件事：
 *   1. **状态机推进**：markActive → 执行 handler → markCompleted / markAttemptFailure
 *   2. **Handler 路由**：registry.get(job.name) 找到业务 handler 并调用
 *   3. **并发安全守卫**：markActive 返回 false 时跳过（已被 cancel / 终态）
 *
 * 业务 handler 实现 IJobHandler 接口，在自身构造函数里 `registry.register(this)` 自注册。
 *
 * BullMQ 重试语义：
 *   BullMQ 内部管理 attemptsMade 递增，每次重试都会重新调用 process()。
 *   DB 侧的 attemptsMade 也在 markActive 时同步写入——保证 DB 记录能反映真实重试次数。
 *
 * 进度上报：
 *   handler 调 ctx.updateProgress(n) → 同时回写 DB（sys_job_run.progress）和 BullMQ job.progress()。
 *
 * 与旧 EmailProcessor 的关键差异：
 *   旧：processor 硬编码 job.name + channel 判断，新增任务类型必须改 processor
 *   新：processor 零 case 分支，完全靠 registry 分发，新增任务类型不改任何基础设施代码
 */
@Processor(DEFAULT_JOB_QUEUE)
export class JobProcessor extends WorkerHost {
  private readonly logger = new Logger(JobProcessor.name);

  constructor(
    private readonly registry: JobRegistryService,
    private readonly records: JobRecordService,
  ) {
    super();
  }

  async process(job: Job<IBullJobData>): Promise<void> {
    const { jobId, name, payload } = job.data;
    const attemptsMade = job.attemptsMade;

    this.logger.debug(
      `开始执行任务: jobId=${jobId} name=${name} attempt=${attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    );

    // ── Step 1: 条件激活 DB 记录 ────────────────────────────
    // markActive 条件：WHERE status IN (queued, delayed)
    // 返回 false 表示已被 cancel 或终态抢占——跳过执行，BullMQ 正常完成该 job（不重试）
    const activated = await this.records.markActive(
      jobId,
      job.id, // BullMQ 内部 job id（含 job- 前缀）
      attemptsMade,
    );
    if (!activated) {
      this.logger.warn(
        `markActive 返回 false，跳过执行: jobId=${jobId} name=${name}（任务已被 cancel 或达终态）`,
      );
      // BullMQ 视角：正常完成（返回值是 skip 语义，不算失败不重试）
      return;
    }

    // ── Step 2: 找 handler ──────────────────────────────────
    // registry.get 不存在时抛 JOB_HANDLER_NOT_FOUND（400）—— 此时 DB 已 active，
    // 走 catch 分支 markAttemptFailure(isFinal=true) 标记失败
    const handler = this.registry.get(name);

    // ── Step 3: 构造执行上下文 ──────────────────────────────
    const ctx: IJobContext = {
      jobId,
      bullJobId: job.id,
      name,
      payload,
      attemptsMade: attemptsMade + 1, // 业务 handler 视角是第几次尝试（从 1 起）
      maxAttempts: job.opts.attempts ?? 1,
      updateProgress: async (progress: number) => {
        await this.records.updateProgress(jobId, progress);
        await job.updateProgress(progress);
      },
    };

    // ── Step 4: 执行 handler ───────────────────────────────
    try {
      const result = await handler.handle(ctx);
      await this.records.markCompleted(jobId, result, attemptsMade);
      this.logger.debug(`任务完成: jobId=${jobId} name=${name}`);
    }
    catch (error) {
      const isFinal = attemptsMade >= (job.opts.attempts ?? 1) - 1;
      await this.records.markAttemptFailure(
        jobId,
        attemptsMade + 1,
        error,
        isFinal,
      );
      if (isFinal) {
        this.logger.error(
          `任务最终失败: jobId=${jobId} name=${name} error=${this.extractError(error)}`,
        );
      }
      else {
        this.logger.warn(
          `任务失败将重试: jobId=${jobId} name=${name} error=${this.extractError(error)}`,
        );
      }
      // BullMQ 视角：抛异常 → BullMQ 按 opts.attempts 自动重试（非终态）或标记 failed
      throw error;
    }
  }

  private extractError(error: unknown): string {
    if (error instanceof Error)
      return `${error.name}: ${error.message}`;
    return JSON.stringify(error).slice(0, 200);
  }
}
