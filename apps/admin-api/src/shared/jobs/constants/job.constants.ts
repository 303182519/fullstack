import type { JobRunStatus as JobRunStatusType } from '@fedstack/database';
import { JobRunStatus, JobTriggerType } from '@fedstack/database';

/** BullMQ 队列名 */
export const JOB_QUEUE_NAME = {
  DEFAULT: 'default',
} as const;

/** BullMQ 默认队列名（JobProcessor / JobQueueService 统一入口） */
export const DEFAULT_JOB_QUEUE = JOB_QUEUE_NAME.DEFAULT;

/**
 * 预注册的业务任务名。
 *
 * 实际业务任务由各模块在 IJobHandler.name 中声明并构造函数里 registry.register(this)
 * 注册——此常量对象仅用于：
 *   - 上游 README 示例列举（文档用途）；
 *   - 未来 SSE 事件推送时按任务名做差异化处理（预留）。
 * 新增任务**不必**到此文件追加，在 handler 内声明 name 即可。
 */
export const JOB_NAMES = {
  /** 邮件 / 短信投递（P3b） */
  MESSAGE_SEND: 'message-send',
  /** 审计日志落库（P3b） */
  AUDIT_LOG: 'audit-log',
  /** 文件物理删除补偿（P3b） */
  FILE_CLEANUP: 'file-cleanup',
} as const;

/** 终态集合：已不可逆 */
export const JOB_TERMINAL_STATUSES: readonly JobRunStatusType[] = [
  JobRunStatus.COMPLETED,
  JobRunStatus.FAILED,
  JobRunStatus.CANCELLED,
] as const;

/** 可取消态集合：仅 queued / delayed 可被 cancel 拦截 */
export const JOB_CANCELLABLE_STATUSES: readonly JobRunStatusType[] = [
  JobRunStatus.QUEUED,
  JobRunStatus.DELAYED,
] as const;

/**
 * BullMQ 自定义 jobId 的固定前缀。
 *
 * BullMQ 的 `Job.validateOptions()` 会执行 `` `${parseInt(jobId, 10)}` === jobId `` 判定，
 * 命中即抛 `Custom Id cannot be integers` —— 纯整数字符串同样被拒绝。
 * 本项目的业务 jobId 取自雪花 ID，是纯数字串，原样透传必然被拒。
 *
 * 另一条 BullMQ 兼容性约束：jobId 不得含 `:`（除非 split(':').length === 3），
 * 用 `-` 可同时避开两条限制。
 */
export const BULL_JOB_ID_PREFIX = 'job-';

export const JOB_SSE_EVENT = {
  /** 快照事件：连接建立时立即下发当前 DB 状态（无 id 行，Last-Event-ID 保持最后一个数字序列号） */
  SNAPSHOT: 'job.snapshot',
  /** 状态/进度变化事件（非终态） */
  UPDATED: 'job.updated',
  /** 终态事件 */
  COMPLETED: 'job.completed',
  FAILED: 'job.failed',
  CANCELLED: 'job.cancelled',
} as const;

export type JobSseEventName = (typeof JOB_SSE_EVENT)[keyof typeof JOB_SSE_EVENT];

export { JobRunStatus, JobTriggerType };
