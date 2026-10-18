import { Global, Module } from '@nestjs/common';
import { DataScopeService } from './data-scope.service.js';
import { PermissionService } from './permission.service.js';

/**
 * 权限底座模块（功能权限 + 数据权限）。
 *
 * 设为 @Global：PermissionGuard（全局守卫，注册在 AppModule）需要 PermissionService；
 * 各业务模块（user / dept / role）需要 DataScopeService 做数据范围过滤。
 * 二者都是「全应用一致的基础设施能力」，符合 @Global 的标准场景（同 PrismaModule / CachingModule）。
 */
@Global()
@Module({
  providers: [PermissionService, DataScopeService],
  exports: [PermissionService, DataScopeService],
})
export class PermissionModule {}
