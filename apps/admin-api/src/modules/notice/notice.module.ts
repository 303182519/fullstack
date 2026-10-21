import { Module } from '@nestjs/common';
import { NoticeController } from './notice.controller.js';
import { NoticeService } from './notice.service.js';

/** 通知公告模块（P3a，ADR-013 D2/D3）：ScopeResolver 来自全局模块 */
@Module({
  controllers: [NoticeController],
  providers: [NoticeService],
})
export class NoticeModule {}
