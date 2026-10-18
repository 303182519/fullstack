import type { ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { createParamDecorator } from '@nestjs/common';

/**
 * 从请求取出当前登录主体（由 JwtAuthGuard 写入 `request.user`）。
 *
 * 用法：
 * - `@CurrentUser() user: AuthPrincipal` 取整个主体；
 * - `@CurrentUser('tenantId') tenantId: string` 取单个字段。
 *
 * 注意：`request.user` 与 CLS 中的用户是**同一个不可变对象引用**（守卫同时写入两处）：
 * request.user 供控制器参数装饰器读取，CLS 供 Service / 日志读取，二者不是两份数据源。
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
