import type {
  MessagePayload,
  MessageProvider,
  MessageSendResult,
} from './message-provider.interface.js';
import { MessageTemplateChannel } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';

/**
 * 短信 Provider（P3b，占位实现）。
 *
 * 服务商未定，当前占位抛 503；待确定服务商后引入对应 SDK。
 */
@Injectable()
export class SmsMessageProvider implements MessageProvider {
  private readonly logger = new Logger(SmsMessageProvider.name);

  readonly channel = MessageTemplateChannel.SMS;

  async send(payload: MessagePayload): Promise<MessageSendResult> {
    this.logger.warn(`短信投递占位：服务商未配置，recipient=${payload.recipientId}`);
    return { success: false, errorMsg: '短信服务商未配置，通道暂不可用' };
  }
}
