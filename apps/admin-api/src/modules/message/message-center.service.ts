import type { MessagePayload, MessageProvider } from './providers/message-provider.interface.js';
import { MessageSendStatus, MessageTemplateChannel } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { MessageTemplateService } from '@/modules/message-template/message-template.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { messageErrors } from './errors.js';
import { EmailMessageProvider } from './providers/email-message.provider.js';
import { InnerMessageProvider } from './providers/inner-message.provider.js';
import { SmsMessageProvider } from './providers/sms-message.provider.js';

/**
 * 消息中心编排服务（ADR-013 D1）。
 *
 * 职责：
 * 1. 模板解析（P3b 接入 SysMessageTemplate）
 * 2. 通道选择 → 投递
 * 3. 写 SysMessageSendLog 投递流水
 */
@Injectable()
export class MessageCenterService {
  private readonly logger = new Logger(MessageCenterService.name);
  private readonly providers: Map<MessageTemplateChannel, MessageProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageTemplateService: MessageTemplateService,
    innerProvider: InnerMessageProvider,
    emailProvider: EmailMessageProvider,
    smsProvider: SmsMessageProvider,
  ) {
    this.providers = new Map<MessageTemplateChannel, MessageProvider>([
      [innerProvider.channel, innerProvider],
      [emailProvider.channel, emailProvider],
      [smsProvider.channel, smsProvider],
    ]);
  }

  /**
   * 直发消息（不经模板）。
   *
   * 用于业务模块直接投递通知（如审批结果、系统提醒等）。
   */
  async sendDirect(
    channel: MessageTemplateChannel,
    payload: MessagePayload,
  ): Promise<void> {
    const provider = this.providers.get(channel);
    if (!provider)
      throw messageErrors.channelUnsupported(channel);

    const result = await provider.send(payload);

    await this.writeLog({
      templateKey: null,
      channel,
      tenantId: payload.tenantId,
      recipient: payload.recipientId,
      subject: payload.subject ?? null,
      content: payload.content,
      status: result.success ? MessageSendStatus.SUCCESS : MessageSendStatus.FAILURE,
      errorMsg: result.errorMsg ?? null,
      sentAt: result.success ? new Date() : null,
    });

    if (!result.success) {
      // 先记流水再抛异常——任务中心重试时每次投递尝试都有完整记录
      throw messageErrors.sendFailed(channel, result.errorMsg);
    }
  }

  /**
   * 按模板发送。
   *
   * 流程：模板遮蔽解析（+变量替换）→ 取对应 provider → 投递 → 写流水。
   */
  async sendTemplate(
    templateKey: string,
    channel: MessageTemplateChannel,
    payload: Omit<MessagePayload, 'title' | 'content'>,
    variables?: Record<string, string>,
  ): Promise<void> {
    const rendered = await this.messageTemplateService.effectiveTemplate(
      templateKey,
      channel,
      variables,
    );

    const provider = this.providers.get(channel);
    if (!provider)
      throw messageErrors.channelUnsupported(channel);

    const messagePayload: MessagePayload = {
      tenantId: payload.tenantId,
      recipientId: payload.recipientId,
      title: rendered.subject ?? '',
      content: rendered.content,
      subject: rendered.subject ?? undefined,
      category: payload.category,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
    };

    const result = await provider.send(messagePayload);

    await this.writeLog({
      templateKey: rendered.templateKey,
      channel,
      tenantId: payload.tenantId,
      recipient: payload.recipientId,
      subject: rendered.subject ?? null,
      content: rendered.content,
      status: result.success ? MessageSendStatus.SUCCESS : MessageSendStatus.FAILURE,
      errorMsg: result.errorMsg ?? null,
      sentAt: result.success ? new Date() : null,
    });

    if (!result.success) {
      // 先记流水再抛异常——任务中心重试时每次投递尝试都有完整记录
      throw messageErrors.sendFailed(channel, result.errorMsg);
    }
  }

  /** 写投递流水（只增表，失败也不阻断业务） */
  private async writeLog(data: {
    templateKey: string | null;
    channel: MessageTemplateChannel;
    tenantId: bigint;
    recipient: string;
    subject: string | null;
    content: string;
    status: MessageSendStatus;
    errorMsg: string | null;
    sentAt: Date | null;
  }): Promise<void> {
    try {
      await this.prisma.sysMessageSendLog.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          ...data,
        },
      });
    }
    catch (err) {
      // 日志写失败不阻断业务，但打 warn 便于排查
      this.logger.warn('消息投递日志写入失败', err instanceof Error ? err.stack : undefined);
    }
  }
}
