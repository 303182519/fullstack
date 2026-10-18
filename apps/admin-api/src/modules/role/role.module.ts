import { Module } from '@nestjs/common';
import { MenuModule } from '@/modules/menu/menu.module.js';
import { RoleController } from './role.controller.js';
import { RoleService } from './role.service.js';

/**
 * 角色管理模块（租户内 RBAC 载体）。
 * 依赖全局 PrismaModule / ContextModule，并导入 MenuModule 以复用其「租户可用菜单」解析能力。
 */
@Module({
  imports: [MenuModule],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
