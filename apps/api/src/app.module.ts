import { HealthModule } from '@fedstack/health';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './shared/database/prisma.module.js';
import { PrismaService } from './shared/database/prisma.service.js';

@Module({
  imports: [
    // 全局配置模块：统一读取 .env 与进程环境变量
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局日志模块：pino 结构化日志，自动记录每个 HTTP 请求
    LoggerModule.forRoot(),
    PrismaModule,
    // 共享健康检查底座（@fedstack/health，见 ADR-004）：
    // 本 app 尚未接入 RedisCacheModule，cache 项按 degraded 上报（不就绪判死）；
    // 接入 @fedstack/redis 后自动升级为真实三态检查
    HealthModule.forRootAsync({
      // PrismaModule 刻意非全局，经 imports 显式暴露给装配工厂
      imports: [PrismaModule],
      inject: [PrismaHealthIndicator, PrismaService],
      useFactory: (db: PrismaHealthIndicator, prisma: PrismaService) => ({
        readinessChecks: [
          // PrismaHealthIndicator 内部执行 SELECT 1，默认 1000ms 超时
          () => db.pingCheck('database', prisma),
        ],
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
