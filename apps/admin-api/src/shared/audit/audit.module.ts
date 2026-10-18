import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoginLogService } from './login-log.service.js';
import { OperLogInterceptor } from './oper-log.interceptor.js';
import { OperLogService } from './oper-log.service.js';

/**
 * 审计底座（ADR-009）：操作日志 + 登录日志。
 *
 * - @Global：审计写入器被全应用注入（业务模块无需逐个 import）；
 * - OperLogInterceptor 以 APP_INTERCEPTOR 注册为全局拦截器，
 *   仅对标注 @OperLog 的端点生效；
 * - 两个写入器都是 best-effort（失败吞掉并告警），绝不阻塞业务主链路。
 */
@Global()
@Module({
  providers: [
    OperLogService,
    LoginLogService,
    { provide: APP_INTERCEPTOR, useClass: OperLogInterceptor },
  ],
  exports: [OperLogService, LoginLogService],
})
export class AuditModule {}
