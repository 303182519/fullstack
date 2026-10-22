import { Module } from '@nestjs/common';
import { MessageTemplateModule } from '@/modules/message-template/message-template.module.js';
import { MessageCenterService } from './message-center.service.js';
import { MessageSendHandler } from './message-send.handler.js';
import { EmailMessageProvider } from './providers/email-message.provider.js';
import { InnerMessageProvider } from './providers/inner-message.provider.js';
import { SmsMessageProvider } from './providers/sms-message.provider.js';

/**
 * 消息中心模块（P3a/P3b，ADR-013）。
 *
 * 职责：
 *   - 消息编排（MessageCenterService）：模板解析 → 通道选择 → 投递 → 写流水
 *   - 站内信通道（InnerMessageProvider）：写 sys_user_message 表
 *   - 邮件通道（EmailMessageProvider）：nodemailer 投递，SMTP 配置走 env
 *   - 短信通道（SmsMessageProvider）：占位抛 503，待确定服务商后引入 SDK
 *   - 异步投递处理器（MessageSendHandler）：IJobHandler 模式，注册到 JobRegistryService
 *     —— 构造函数里 registry.register(this)，NestJS DI 创建实例时自动注册
 *
 * 依赖的全局模块：PrismaModule、ConfigModule、JobsModule（@Global，无需显式 imports）。
 */
@Module({
  imports: [MessageTemplateModule],
  providers: [
    MessageCenterService,
    InnerMessageProvider,
    EmailMessageProvider,
    SmsMessageProvider,
    // IJobHandler：BullMQ 队列异步投递的处理器。
    // 构造函数注入 JobRegistryService 并自注册——Handler 生命周期 = NestJS DI 单例
    MessageSendHandler,
  ],
  exports: [MessageCenterService, EmailMessageProvider, SmsMessageProvider],
})
export class MessageModule {}
