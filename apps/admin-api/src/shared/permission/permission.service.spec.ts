import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { MenuStatus, RoleStatus } from '@fedstack/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { PermissionService } from '@/shared/permission/permission.service.js';

function makePrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    userId: '1',
    tenantId: '10',
    username: 'admin',
    isSuper: false,
    sessionId: 's',
    ...overrides,
  };
}

describe('permissionService', () => {
  const prisma = { sysMenu: { findMany: vi.fn() } };

  let service: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PermissionService(prisma as unknown as PrismaService);
  });

  describe('resolvePermissionCodes', () => {
    it('平台超级管理员返回 null（不受功能权限约束）', async () => {
      const codes = await service.resolvePermissionCodes(makePrincipal({ isSuper: true }));

      expect(codes).toBeNull();
      expect(prisma.sysMenu.findMany).not.toHaveBeenCalled();
    });

    it('按角色链路解析菜单权限编码集合', async () => {
      prisma.sysMenu.findMany.mockResolvedValue([
        { permCode: 'system:user:add' },
        { permCode: 'system:user:edit' },
      ]);

      const codes = await service.resolvePermissionCodes(makePrincipal());

      expect([...(codes ?? [])].sort()).toEqual(['system:user:add', 'system:user:edit']);
      const { where } = prisma.sysMenu.findMany.mock.calls[0]?.[0];
      expect(where).toMatchObject({
        status: MenuStatus.ACTIVE,
        deletedAt: null,
        OR: [{ tenantId: null }, { tenantId: 10n }],
      });
      expect(where.roleMenus.some.role).toMatchObject({
        tenantId: 10n,
        status: RoleStatus.ACTIVE,
        deletedAt: null,
        userRoles: { some: { userId: 1n } },
      });
    });

    it('过滤掉空权限编码', async () => {
      prisma.sysMenu.findMany.mockResolvedValue([{ permCode: null }, { permCode: 'a:b:c' }]);

      const codes = await service.resolvePermissionCodes(makePrincipal());

      expect([...(codes ?? [])]).toEqual(['a:b:c']);
    });
  });

  describe('hasAnyPermission', () => {
    it('超管恒通过', async () => {
      const allowed = await service.hasAnyPermission(
        makePrincipal({ isSuper: true }),
        ['system:user:add'],
      );
      expect(allowed).toBe(true);
    });

    it('命中任意一个所需编码即通过', async () => {
      prisma.sysMenu.findMany.mockResolvedValue([{ permCode: 'system:user:edit' }]);

      const allowed = await service.hasAnyPermission(makePrincipal(), [
        'system:user:add',
        'system:user:edit',
      ]);
      expect(allowed).toBe(true);
    });

    it('未命中任何所需编码即拒绝', async () => {
      prisma.sysMenu.findMany.mockResolvedValue([{ permCode: 'system:user:edit' }]);

      const allowed = await service.hasAnyPermission(makePrincipal(), ['system:user:add']);
      expect(allowed).toBe(false);
    });
  });
});
