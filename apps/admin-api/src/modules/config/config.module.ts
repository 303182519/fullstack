import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller.js';
import { ConfigService } from './config.service.js';

/** 参数配置（P2，ADR-009）：ScopeResolver / CacheService 均来自全局模块，无需显式 import */
@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
})
export class ConfigModule {}
