import type { Params } from 'nestjs-pino';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { RequestContextService } from '@/common/context/request-context.service.js';

import { createPinoConfig } from './pino-logger.config.js';

/**
 * 企业级 Pino 日志模块
 *
 * 特性：
 * - 结构化 JSON 日志（生产环境 stdout + 文件）
 * - 请求上下文自动关联（requestId）
 * - 文件按大小轮转、错误日志独立落盘（pino-roll）
 * - 敏感字段脱敏（请求头凭证 + URL 查询参数 + 常见业务字段）
 * - 访问日志 / 慢请求 / 客户端中断分级
 * - 与 NestJS Logger 兼容（由 main.ts 通过 app.useLogger 桥接）
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService, RequestContextService],
      useFactory: (configService: ConfigService, requestContext: RequestContextService): Params => {
        return createPinoConfig(configService, requestContext);
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
