import type {
  JobRunStatus,
  JobTriggerType,
  SysJobRunModel,
} from '@fedstack/database';
import type { JobSseEventName } from '../constants/job.constants.js';

// ── Handler 接口 ─────────────────────────────────────────────────

/**
 * 任务执行上下文。由 JobProcessor 构造后传给 IJobHandler.handle()。
 *
 * 提供：
 * - 任务身份（jobId / bullJobId / name / payload）
 * - 重试状态（attemptsMade / maxAttempts）
 * - updateProgress：调用方上报进度，内部同时回写 DB + BullMQ
 */
export interface IJobContext<TPayload = unknown> {
  /** 业务 jobId（雪花 ID，纯数字串） */
  jobId: string;
  /** BullMQ 内部 job id（含 "job-" 前缀，仅用于队列查询/取消） */
  bullJobId?: string;
  /** 任务名（对应 IJobHandler.name） */
  name: string;
  /** 任务参数 */
  payload: TPayload;
  /** 当前是第几次尝试（从 1 开始计数；attemptsMade + 1） */
  attemptsMade: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 上报进度（0-100）。内部同时回写 SysJobRun.progress 和 BullMQ job 进度 */
  updateProgress: (progress: number) => Promise<void>;
}

/**
 * 异步任务处理器接口。业务模块实现此接口，在构造函数中
 * `registry.register(this)` 自注册，JobProcessor 按 name 路由。
 *
 * 生命周期：
 *   JobProcessor.process() 激活 DB 记录（条件更新 WHERE status IN queued/delayed）
 *   → registry.get(name) 找到 handler
 *   → handler.handle(ctx) 执行业务逻辑
 *   → 成功：markCompleted(result)
 *   → 失败：markAttemptFailure(error, isFinal=attemptsMade>=maxAttempts)
 */
export interface IJobHandler<TPayload = unknown, TResult = unknown> {
  /** 任务唯一标识；在 JobRegistryService 中注册后不可变更/重复 */
  readonly name: string;
  /** 执行任务。返回值写入 SysJobRun.result，reject/throw 写入 errorMessage */
  handle: (ctx: IJobContext<TPayload>) => Promise<TResult>;
}

// ── 提交 / 查询输入 ───────────────────────────────────────────────

/** JobService.submit() 入参 */
export interface ISubmitJobInput {
  /** 任务名（必须已在 JobRegistryService 注册） */
  name: string;
  /** 任务参数 */
  payload?: unknown;
  /** 延迟执行时间（毫秒）。> 0 时初始状态为 delayed */
  delayMs?: number;
  /** 最大尝试次数，默认 1（不重试） */
  attempts?: number;
  /** 重试间隔（毫秒），仅 attempts > 1 时生效 */
  backoffMs?: number;
  /** 触发类型，默认 MANUAL */
  triggerType?: JobTriggerType;
  /** 触发者用户 ID（雪花串）。仅用于审计快照，不建外键 */
  createdBy?: string;
  /** 租户 ID（雪花串，可空表示平台级任务） */
  tenantId?: string;
}

/** JobRecordService.createQueued() 入参（Service 内部用，不经 BullMQ） */
export interface IJobRunCreateData {
  name: string;
  queueName: string;
  payload?: unknown;
  maxAttempts: number;
  triggerType: JobTriggerType;
  createdBy?: string;
  tenantId?: string;
  status?: JobRunStatus;
}

/**
 * JobRecordService.list() 分页查询入参。
 *
 * scopeTenantId 由 JobService 经 ScopeResolverService 解析后注入，
 * 不是客户端原始值（安全边界：ADR-009 + AGENTS.md §15）。
 *   - null  → 超管平台级：不加租户过滤
 *   - bigint → 精确过滤该租户（含平台级任务，因为 Prisma where 不会自动包含 null）
 *   - 注意：要包含平台级任务（tenantId=null），JobRecordService 需要显式处理
 */
export interface IListJobsQuery {
  /** 已解析的租户作用域：null = 平台级看全部，bigint = 精确租户 + 平台级 */
  scopeTenantId?: bigint | null;
  name?: string;
  status?: JobRunStatus;
  page?: number;
  pageSize?: number;
}

// ── BullMQ Job 数据形状 ──────────────────────────────────────────

/** BullMQ job.data 的统一形状。JobProcessor 解析入口 */
export interface IBullJobData {
  /** 业务 jobId（雪花 ID 纯数字串，BullMQ opts.jobId 由 JobQueueService 加前缀后传入） */
  jobId: string;
  name: string;
  payload?: unknown;
}

// ── 领域视图（JobRunView） ────────────────────────────────────────

/**
 * 任务执行记录领域视图。对外只返回此类型，不暴露 Prisma 行对象。
 *
 * SysJobRun 行 → IJobRunView 映射由 JobRecordService.toDomain() 统一处理。
 */
export interface IJobRunView {
  id: string;
  name: string;
  queueName: string;
  status: JobRunStatus;
  progress: number;
  payload?: unknown;
  result?: unknown;
  errorMessage?: string | null;
  attemptsMade: number;
  maxAttempts: number;
  triggerType: JobTriggerType;
  createdBy?: string | null;
  tenantId?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

/** SSE 事件形状。用于 JobsController 的 /events 端点 */
export interface IJobSseEvent {
  /** SSE event id。常规事件为递增数字序列号；快照事件省略（Last-Event-ID 保持最后一个数字序列号） */
  id?: string;
  event: JobSseEventName;
  data: IJobRunView;
}

/**
 * 死信任务视图。DB 记录处于非终态但超过阈值仍未推进。
 *
 * deadReason 标识成因：
 *   - stuck_queued ：BullMQ job 丢失（Redis 重启/数据清理），queued 无人消费
 *   - stuck_active ：worker 崩溃/重启，active 状态无人推进
 *   - stuck_delayed：同 queued，delayed 状态无人触发
 */
export interface IJobDeadLetterView {
  id: string;
  name: string;
  status: JobRunStatus;
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  errorMessage?: string | null;
  tenantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  deadReason: 'stuck_queued' | 'stuck_active' | 'stuck_delayed';
}

/** SysJobRun Prisma 行类型（内部用，供 toDomain() / getEntityOrFail() 返回） */
export type SysJobRunRow = SysJobRunModel;
