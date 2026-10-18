import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { DataScope, RoleStatus } from '@fedstack/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { DataScopeService } from '@/shared/permission/data-scope.service.js';

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

describe('dataScopeService', () => {
  const prisma = {
    sysRole: { findMany: vi.fn() },
    sysUser: { findFirst: vi.fn() },
  };
  const requestContext = { requireUser: vi.fn() };

  let service: DataScopeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DataScopeService(
      prisma as unknown as PrismaService,
      requestContext as unknown as RequestContextService,
    );
    requestContext.requireUser.mockReturnValue(makePrincipal());
  });

  describe('resolve', () => {
    it('超管返回 ALL', async () => {
      requestContext.requireUser.mockReturnValue(makePrincipal({ isSuper: true }));

      const scope = await service.resolve();

      expect(scope).toEqual({ type: 'ALL' });
      expect(prisma.sysRole.findMany).not.toHaveBeenCalled();
    });

    it('任一角色为 ALL 即取最宽为 ALL', async () => {
      prisma.sysRole.findMany.mockResolvedValue([
        { dataScope: DataScope.DEPT_AND_CHILD },
        { dataScope: DataScope.ALL },
      ]);

      const scope = await service.resolve();

      expect(scope).toEqual({ type: 'ALL' });
      expect(prisma.sysUser.findFirst).not.toHaveBeenCalled();
    });

    it('无 ALL 角色时收敛为 DEPT_AND_CHILD 并取主体部门路径', async () => {
      prisma.sysRole.findMany.mockResolvedValue([{ dataScope: DataScope.DEPT_AND_CHILD }]);
      prisma.sysUser.findFirst.mockResolvedValue({ dept: { path: '/1/3/' } });

      const scope = await service.resolve();

      expect(scope).toEqual({ type: 'DEPT_AND_CHILD', deptPath: '/1/3/' });
      const { where } = prisma.sysRole.findMany.mock.calls[0]?.[0];
      expect(where).toMatchObject({
        tenantId: 10n,
        deletedAt: null,
        status: RoleStatus.ACTIVE,
        userRoles: { some: { userId: 1n } },
      });
    });

    it('主体无角色或无部门时 deptPath 为 null（不放大可见范围）', async () => {
      prisma.sysRole.findMany.mockResolvedValue([]);
      prisma.sysUser.findFirst.mockResolvedValue({ dept: null });

      const scope = await service.resolve();

      expect(scope).toEqual({ type: 'DEPT_AND_CHILD', deptPath: null });
    });
  });

  describe('scopeUserWhere', () => {
    it('aLL 不加条件', () => {
      expect(service.scopeUserWhere({ type: 'ALL' })).toEqual({});
    });

    it('dEPT_AND_CHILD 且无部门路径时仅命中未分配部门的用户', () => {
      expect(service.scopeUserWhere({ type: 'DEPT_AND_CHILD', deptPath: null })).toEqual({
        deptId: null,
      });
    });

    it('dEPT_AND_CHILD 时按部门路径前缀过滤', () => {
      expect(service.scopeUserWhere({ type: 'DEPT_AND_CHILD', deptPath: '/1/3/' })).toEqual({
        dept: { path: { startsWith: '/1/3/' } },
      });
    });
  });

  describe('scopeDeptWhere', () => {
    it('aLL 不加条件', () => {
      expect(service.scopeDeptWhere({ type: 'ALL' })).toEqual({});
    });

    it('dEPT_AND_CHILD 且无部门路径时命中空集（子树不可见）', () => {
      expect(service.scopeDeptWhere({ type: 'DEPT_AND_CHILD', deptPath: null })).toEqual({
        id: { in: [] },
      });
    });

    it('dEPT_AND_CHILD 时按路径前缀过滤', () => {
      expect(service.scopeDeptWhere({ type: 'DEPT_AND_CHILD', deptPath: '/1/3/' })).toEqual({
        path: { startsWith: '/1/3/' },
      });
    });
  });
});
