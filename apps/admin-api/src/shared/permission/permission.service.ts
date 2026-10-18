import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { MenuStatus, RoleStatus } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';

/**
 * 功能权限解析（按钮/API 级，见 ADR-008 D1/D3）。
 *
 * 解析链路：当前用户 → 角色（同租户、启用、未删除）→ 角色-菜单绑定 → 菜单 perm_code。
 * 菜单范围为「平台级（tenantId=null）+ 本租户级」，二者同租户/跨租户污染由查询条件约束。
 *
 * 性能取舍（P1 有意不缓存）：受控端点每次请求做一次索引查询（sys_role_menu / sys_user_role 均为索引）。
 * 后台管理端流量低，一次查询的开销可忽略；相较加缓存，省去了「授权变更后失效缓存」的一致性风险
 * （授权变更后旧缓存未及时失效会造成越权或误拒，属安全敏感）。后续如流量上升，再引入带显式失效的缓存。
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 解析主体的功能权限编码集合。
   * 返回 `null` 表示「不受功能权限约束」（平台超级管理员）。
   */
  async resolvePermissionCodes(principal: AuthPrincipal): Promise<Set<string> | null> {
    if (principal.isSuper)
      return null;

    const tenantId = BigInt(principal.tenantId);
    const userId = BigInt(principal.userId);

    // 从`sys_menu` 反向校验「这个菜单是否被当前用户在本租户内的某个可用角色绑定过」
    /*
    SELECT m.perm_code
    FROM sys_menu m
    WHERE m.perm_code IS NOT NULL  -- 菜单自身条件（略）
      AND EXISTS (                 -- roleMenus: some
        SELECT 1 FROM sys_role_menu rm
        JOIN sys_role r ON r.id = rm.role_id  -- role: {…}
        WHERE rm.menu_id = m.id
          AND r.tenant_id = 1001
          AND r.status = 'ACTIVE'
          AND r.deleted_at IS NULL
          AND EXISTS (              -- userRoles: some
            SELECT 1 FROM sys_user_role ur
            WHERE ur.role_id = r.id
              AND ur.user_id = 9001
          )
      )
    */
    const rows = await this.prisma.sysMenu.findMany({
      where: {
        permCode: { not: null },
        status: MenuStatus.ACTIVE,
        deletedAt: null,
        OR: [{ tenantId: null }, { tenantId }],
        roleMenus: {
          some: {
            role: {
              tenantId,
              status: RoleStatus.ACTIVE,
              deletedAt: null,
              userRoles: { some: { userId } },
            },
          },
        },
      },
      select: { permCode: true },
    });

    return new Set(
      rows
        .map(row => row.permCode)
        .filter((code): code is string => code !== null),
    );
  }

  /** 主体是否满足所需编码中的任意一个（isSuper 恒通过）。 */
  async hasAnyPermission(principal: AuthPrincipal, codes: string[]): Promise<boolean> {
    const granted = await this.resolvePermissionCodes(principal);
    if (granted === null)
      return true;
    return codes.some(code => granted.has(code));
  }
}
