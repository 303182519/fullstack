import { Module } from '@nestjs/common';
import { MessageTemplateController } from './message-template.controller.js';
import { MessageTemplateService } from './message-template.service.js';

/** 消息模板模块（P3b，ADR-013 D4）：遮蔽语义复用 ADR-009 */
@Module({
  controllers: [MessageTemplateController],
  providers: [MessageTemplateService],
  exports: [MessageTemplateService],
})
export class MessageTemplateModule {}
