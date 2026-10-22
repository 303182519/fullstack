import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BULL_JOB_ID_PREFIX, DEFAULT_JOB_QUEUE } from '../constants/job.constants.js';
import { IBullJobData } from '../types/job.types.js';

/**
 * BullMQ 队列操作层（Phase 2）。
 *
 * 职责：
 *   - 幂等入队（雪花 jobId 加 `job-` 前缀规避 BullMQ Custom Id 校验）
 *   - 移除队列中指定 job（cancel 时调用）
 *   - 查询队列中是否存在某 job（compensate 死信补偿时用）
 *
 * 为什么 BullMQ jobId 需要加前缀：
 *   BullMQ 的 `Job.validateOptions()` 内部有 `` `${parseInt(jobId, 10)}` === jobId `` 判定，
 *   纯数字字符串同样被拒绝（parseInt 解析出的整数再转字符串 === 原值即抛）。
 *   本项目业务 jobId 是雪花 ID（纯数字串），原始透传必然被 BullMQ 拒绝。
 *
 * 设计纪律：本服务**只管 BullMQ 操作**，不触碰 DB。
 * 业务层（JobService）负责"落库 → 入队 → 补写 bullJobId"这条链路的原子性。
 */
@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  constructor(
    @InjectQueue(DEFAULT_JOB_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * 构造 BullMQ 可用的 jobId（雪花 ID → job- 前缀）。
   *
   * 对外暴露为工具方法——JobService.submit 在 bullJobData 里需要原始雪花串，
   * BullMQ opts.jobId 里需要带前缀的版本，两处由同一入口构造。
   */
  buildBullJobId(jobId: string): string {
    return `${BULL_JOB_ID_PREFIX}${jobId}`;
  }

  /**
   * 入队任务。
   *
   * 幂等：同一 jobId 重复调用 BullMQ 会在队列里产生多个同名 job（BullMQ 的 add()
   * 对同一 opts.jobId 是幂等的——第二次 add 会返回已有的 job 对象，不会重复入队）。
   * 因此 submit 流程里"DB 记录已存在 + BullMQ add 成功"是天然幂等的。
   *
   * @returns BullMQ 内部 job id（带 job- 前缀）—— 供 JobService 回写 DB
   */
  async enqueue(
    jobId: string,
    name: string,
    data: IBullJobData,
    opts?: {
      delayMs?: number; // 延迟入队时间，默认 0ms
      attempts?: number; // 重试次数，默认 1 次
      backoffMs?: number; // 固定间隔重试，默认 0ms
    },
  ): Promise<string> {
    const bullJobId = this.buildBullJobId(jobId);

    await this.queue.add(name, data, {
      jobId: bullJobId,
      delay: opts?.delayMs,
      attempts: opts?.attempts ?? 1,
      backoff: opts?.backoffMs
        ? { type: 'fixed', delay: opts.backoffMs }
        : undefined,
    });

    this.logger.debug(`入队成功: jobId=${jobId} bullJobId=${bullJobId} name=${name}`);
    return bullJobId;
  }

  /**
   * 从 BullMQ 移除 job（cancel 流程调用）。
   *
   * BullMQ queue.remove(jobId) 返回被移除的 Job 对象或 undefined，
   * 不是 boolean。这里简化处理：尝试移除，忽略具体返回值（cancel 是幂等的——
   * 已消费/已完成时返回 undefined 是正常分支）。
   */
  async remove(jobId: string): Promise<void> {
    const bullJobId = this.buildBullJobId(jobId);
    const result = await this.queue.remove(bullJobId);
    if (!result) {
      this.logger.debug(`BullMQ remove 无效果: jobId=${jobId}（已不在队列中，正常分支）`);
    }
  }

  /**
   * 查询 BullMQ 队列中是否仍存在某 job（compensate 死信补偿时决策用）。
   *
   * 返回 true → 队列里还有，说明只是 DB 状态卡住了；
   * 返回 false → BullMQ 已经没有这个 job，需要重新入队或标记 failed。
   */
  async exists(jobId: string): Promise<boolean> {
    const bullJobId = this.buildBullJobId(jobId);
    const job = await this.queue.getJob(bullJobId);
    return job !== null && job !== undefined;
  }
}
