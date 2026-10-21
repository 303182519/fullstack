import { Module } from '@nestjs/common';
import { UserMessageController } from './user-message.controller.js';
import { UserMessageService } from './user-message.service.js';

/** 站内信自助模块（P3a，ADR-013 D2/D9）：自助端点，无权限码 */
@Module({
  controllers: [UserMessageController],
  providers: [UserMessageService],
})
export class UserMessageModule {}
