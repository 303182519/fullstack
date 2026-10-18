import { Module } from '@nestjs/common';
import { DictDataService } from './dict-data.service.js';
import { DictTypeService } from './dict-type.service.js';
import { DictController } from './dict.controller.js';

/** 字典管理（P2，ADR-009）：ScopeResolver / CacheService 均来自全局模块，无需显式 import */
@Module({
  controllers: [DictController],
  providers: [DictTypeService, DictDataService],
})
export class DictModule {}
