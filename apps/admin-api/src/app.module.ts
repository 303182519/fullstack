import { HealthModule } from '@fedstack/health';
import { RedisCacheModule } from '@fedstack/redis';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { CommonModule } from '@/common/common.module.js';
import { ContextModule } from '@/common/context/context.module.js';
import { AppConfigModule } from '@/config/config.module.js';
import { getConfig } from '@/config/configuration.js';
import { CachingModule } from '@/shared/caching/caching.module.js';
import { PrismaModule } from '@/shared/database/prisma.module.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { LoggerModule } from '@/shared/logger/logger.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ContextModule,
    AppConfigModule,
    CommonModule,
    LoggerModule,
    PrismaModule,
    // 共享缓存基础设施（@fedstack/redis）：配置由本 app 配置层注入，见 ADR-003
    RedisCacheModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => getConfig(configService).redis,
    }),
    // 应用层缓存业务（登录锁定策略、业务 key 工厂）
    CachingModule,
    // 共享健康检查底座（@fedstack/health，见 ADR-004）：
    // Redis 检查内置；本 app 装配数据库就绪检查
    HealthModule.forRootAsync({
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
