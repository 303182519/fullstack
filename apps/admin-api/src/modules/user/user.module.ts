import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/shared/auth/auth-core.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

/**
 * 用户管理模块。
 *
 * 依赖：AuthCoreModule 提供 PasswordService / SessionService（改密与强制下线需要）。
 * 无独立对外导出：用户查询能力当前仅由本模块控制器消费（角色/权限模块如需再评估）。
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
