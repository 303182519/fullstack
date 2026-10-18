import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Injectable } from '@nestjs/common';
import { authErrors } from '@/shared/auth/auth.errors.js';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

/**
 * 平台级端点守卫：要求当前主体是平台超级管理员（`isSuper`）。
 *
 * 用于「租户管理」等跨租户的平台运维端点（ADR-008 D4：租户表属平台级数据边界）。
 * 依赖 JwtAuthGuard 已先执行并写入 `request.user`（全局守卫先于控制器级守卫执行）。
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user)
      throw authErrors.invalidAccessToken();
    if (!user.isSuper)
      throw authErrors.forbidden('仅平台超级管理员可访问');
    return true;
  }
}
