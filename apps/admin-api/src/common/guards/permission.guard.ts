import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authErrors } from '@/shared/auth/auth.errors.js';
import { PermissionService } from '@/shared/permission/permission.service.js';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

/**
 * 全局功能权限守卫（按钮/API 级）。
 *
 * 执行位置：注册在 APP_GUARD 中、**排在 JwtAuthGuard 之后**，因此运行时可从 `request.user`
 * 取到已鉴权的主体（全局守卫执行顺序 = 注册顺序）。
 *
 * 校验口径（见 ADR-008 D1/D3）：
 * - 端点未标 `@RequirePermission` → 直接放行（本层不校验，登录约束仍由 JwtAuthGuard 提供）；
 * - 端点已标注 → 主体不存在即拒绝（拒绝优先，不因缺主体而放行）；
 * - isSuper 主体不受功能权限约束；
 * - 否则校验用户角色链路上的菜单 perm_code 是否命中所需编码（任一命中即通过）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0)
      return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user)
      throw authErrors.invalidAccessToken();

    if (await this.permissionService.hasAnyPermission(user, required))
      return true;

    throw authErrors.forbidden(`缺少权限：${required.join(' / ')}`);
  }
}
