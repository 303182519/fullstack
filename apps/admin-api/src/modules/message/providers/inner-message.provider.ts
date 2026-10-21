import type {
  MessagePayload,
  MessageProvider,
  MessageSendResult,
} from './message-provider.interface.js';
import { MessageTemplateChannel } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';

/**
 * 站内信 Provider（ADR-013 D1/D2）。
 *
 * 写入 `sys_user_message` 表，用户侧通过 user-message 模块自助读取/标记已读。
 */
@Injectable()
export class InnerMessageProvider implements MessageProvider {
  private readonly logger = new Logger(InnerMessageProvider.name);

  readonly channel = MessageTemplateChannel.INNER;

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: MessagePayload): Promise<MessageSendResult> {
    try {
      await this.prisma.sysUserMessage.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: payload.tenantId,
          userId: BigInt(payload.recipientId),
          title: payload.title,
          content: payload.content,
          category: payload.category ?? null,
          sourceType: payload.sourceType ?? null,
          sourceId: payload.sourceId ?? null,
        },
      });
      return { success: true };
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`站内信投递失败: ${msg}`, err instanceof Error ? err.stack : undefined);
      return { success: false, errorMsg: msg };
    }
  }
}
