import type { Transporter } from 'nodemailer';
import type {
  MessagePayload,
  MessageProvider,
  MessageSendResult,
} from './message-provider.interface.js';
import { MessageTemplateChannel } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { getConfig } from '@/config/configuration.js';

/**
 * 邮件 Provider（P3b，ADR-013 D1）。
 *
 * 使用 nodemailer 投递，配置走 env（SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS）。
 * 外部网络 IO，投递走 BullMQ 队列（Task 8 接入）。
 */
@Injectable()
export class EmailMessageProvider implements MessageProvider {
  private readonly logger = new Logger(EmailMessageProvider.name);
  private transporter: Transporter | null = null;

  readonly channel = MessageTemplateChannel.EMAIL;

  constructor(private readonly configService: ConfigService) {
    const smtp = getConfig(configService).smtp;
    if (smtp.host) {
      this.transporter = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      });
    }
  }

  async send(payload: MessagePayload): Promise<MessageSendResult> {
    if (!this.transporter) {
      this.logger.warn('SMTP 未配置，邮件投递降级为 no-op');
      return { success: false, errorMsg: 'SMTP 未配置' };
    }

    try {
      await this.transporter.sendMail({
        to: payload.recipientId,
        subject: payload.subject ?? payload.title,
        html: payload.content,
      });
      return { success: true };
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`邮件投递失败: ${msg}`, err instanceof Error ? err.stack : undefined);
      return { success: false, errorMsg: msg };
    }
  }
}
