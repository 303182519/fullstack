import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/shared/auth/auth-core.module.js';
import { LoginLogQueryService } from './login-log-query.service.js';
import { LoginLogController, OnlineController, OperLogController } from './monitor.controller.js';
import { OnlineService } from './online.service.js';
import { OperLogQueryService } from './oper-log-query.service.js';

/** 系统监控（P2）：AuthCoreModule 提供 SessionService（在线用户踢单/下线） */
@Module({
  imports: [AuthCoreModule],
  controllers: [OperLogController, LoginLogController, OnlineController],
  providers: [OperLogQueryService, LoginLogQueryService, OnlineService],
})
export class MonitorModule {}
