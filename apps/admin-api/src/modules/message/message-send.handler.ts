import type { MessagePayload } from './providers/message-provider.interface.js';
import type { IJobContext, IJobHandler } from '@/shared/jobs/types/job.types.js';
import { MessageTemplateChannel } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { JobRegistryService } from '@/shared/jobs/registry/job-registry.service.js';
import { MessageCenterService } from './message-center.service.js';

/** BullMQ payload 形状 */
export interface MessageSendPayload {
  channel: MessageTemplateChannel;
  payload: MessagePayload;
}

/** handler 执行结果（写入 SysJobRun.result） */
export interface MessageSendResult {
  channel: MessageTemplateChannel;
  recipientId: string;
  tenantId?: string;
  sentAt: string;
}

/**
 * 消息投递处理器（IJobHandler 模式，Phase 2）。
 *
 * 替代旧 EmailProcessor（BullMQ Worker 硬编码 channel 判断）。
 * 现在：一个 handler 覆盖邮件/短信/站内信三种通道，由 MessageCenterService 按 channel 分发。
 *
 * BullMQ payload 形状：
 *   { channel: MessageTemplateChannel, payload: MessagePayload }
 *
 * 与旧实现的关键差异：
 *   1. BullMQ Worker 层只有 JobProcessor（路由 registry 分发），不再有 channel 硬编码 processor
 *   2. 消息投递失败直接 throw → JobProcessor 自动 markAttemptFailure，走 BullMQ 重试
 *   3. 处理器注册靠构造函数里 `registry.register(this)`（NestJS DI 创建实例时自动注册）
 *
 * 进度更新：
 *   即使单次投递是同步操作，也需要 updateProgress 打点——它同时是"任务活着"的 heartbeat 信号，
 *   慢通道（如 SMTP 超时 30s）下 progress=10 能与"刚激活未开始"的 progress=0 区分开。
 *
 * 泛型兼容说明：
 *   IJobHandler 接口的 handle 参数必须是 `IJobContext<unknown>`（registry 用 unknown 存储），
 *   所以具体 handler 内部用 `as MessageSendPayload` 断言——这是安全的，因为提交方
 *   （JobService.submit）负责保证 payload 形状正确。
 */
@Injectable()
export class MessageSendHandler implements IJobHandler<MessageSendPayload, MessageSendResult> {
  readonly name = 'message-send';
  private readonly logger = new Logger(MessageSendHandler.name);

  constructor(
    private readonly messageCenter: MessageCenterService,
    registry: JobRegistryService,
  ) {
    registry.register(this);
  }

  async handle(ctx: IJobContext<MessageSendPayload>): Promise<MessageSendResult> {
    // 类型断言安全：submit 时由调用方保证 payload 形状
    const { channel, payload } = ctx.payload;

    this.logger.log(
      `消息投递任务: jobId=${ctx.jobId} channel=${channel} recipient=${payload.recipientId}`,
    );

    // heartbeat：标记"已开始投递"——慢通道场景下 progress=10 区分真卡死 vs 等待超时
    await ctx.updateProgress(10);

    await this.messageCenter.sendDirect(channel, payload);

    const sentAt = new Date().toISOString();
    await ctx.updateProgress(100);

    this.logger.log(
      `消息投递成功: jobId=${ctx.jobId} channel=${channel} recipient=${payload.recipientId}`,
    );

    return {
      channel,
      recipientId: payload.recipientId,
      tenantId: payload.tenantId?.toString(),
      sentAt,
    };
  }
}
