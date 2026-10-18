import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

/**
 * 菜单管理模块。
 * 导出 MenuService：角色授权（RoleService）需用它校验「租户被许可菜单集合」。
 */
@Module({
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
