import { Module } from '@nestjs/common';
import { PackageController } from './package.controller.js';
import { PackageService } from './package.service.js';

/** 租户套餐模块（平台级）。依赖全局 PrismaModule。 */
@Module({
  controllers: [PackageController],
  providers: [PackageService],
})
export class PackageModule {}
