import { Module } from '@nestjs/common';
import { DeptController } from './dept.controller.js';
import { DeptService } from './dept.service.js';

/** 部门管理模块（租户内组织架构）。依赖全局 PrismaModule / ContextModule / PermissionModule。 */
@Module({
  controllers: [DeptController],
  providers: [DeptService],
})
export class DeptModule {}
