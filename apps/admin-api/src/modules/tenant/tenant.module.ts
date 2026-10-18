import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';

/** 租户管理模块（平台级，P0 只读 + 有限更新）。依赖全局 PrismaModule。 */
@Module({
  controllers: [TenantController],
  providers: [TenantService],
})
export class TenantModule {}
