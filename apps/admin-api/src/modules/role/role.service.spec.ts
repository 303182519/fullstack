import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Prisma, RoleStatus } from '@fedstack/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { MenuService } from '@/modules/menu/menu.service.js';
import { CreateRoleDto } from '@/modules/role/dto/create-role.dto.js';
import { QueryRoleDto } from '@/modules/role/dto/query-role.dto.js';
import { UpdateRoleDto } from '@/modules/role/dto/update-role.dto.js';
import { RoleService } from '@/modules/role/role.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['tenant_id', 'role_code'] },
  });
}

function makeRoleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    roleName: '部门管理员',
    roleCode: 'dept_manager',
    description: null,
    dataScope: 'ALL',
    status: RoleStatus.ACTIVE,
    isSystem: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const principal: AuthPrincipal = {
  userId: '1',
  tenantId: '10',
  username: 'admin',
  isSuper: false,
  sessionId: 's',
};

function makeCreateRoleDto(overrides: Partial<CreateRoleDto> = {}): CreateRoleDto {
  return Object.assign(new CreateRoleDto(), { roleName: '运营', roleCode: 'operator' }, overrides);
}

describe('roleService', () => {
  const prisma = {
    sysRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sysUserRole: { count: vi.fn() },
    sysRoleMenu: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const requestContext = { requireUser: vi.fn() };
  const menuService = { resolveLicensedMenuIds: vi.fn() };

  let service: RoleService;

  beforeAll(() => {
    initSnowflake(BigInt(0), BigInt(0));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RoleService(
      prisma as unknown as PrismaService,
      requestContext as unknown as RequestContextService,
      menuService as unknown as MenuService,
    );
    requestContext.requireUser.mockReturnValue(principal);
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  });

  describe('list', () => {
    it('按当前租户分页查询并映射列表项', async () => {
      const query = new QueryRoleDto();
      query.roleCode = 'dept';
      prisma.sysRole.findMany.mockResolvedValue([makeRoleRow()]);
      prisma.sysRole.count.mockResolvedValue(1);

      const result = await service.list(query);

      expect(prisma.sysRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 10n,
            deletedAt: null,
            roleCode: { contains: 'dept' },
          }),
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: '1', roleCode: 'dept_manager' }),
      );
    });
  });

  describe('detail', () => {
    it('角色不存在时抛 30A01', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      const error = await service.detail(1n).catch(e => e);
      expect(codeOf(error)).toBe('30A01');
    });
  });

  describe('create', () => {
    it('角色编码已存在时抛 30A02', async () => {
      prisma.sysRole.findFirst.mockResolvedValue({ id: 9n });
      const error = await service.create(makeCreateRoleDto()).catch(e => e);
      expect(codeOf(error)).toBe('30A02');
    });

    it('创建成功且 isSystem 恒为 false', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      prisma.sysRole.create.mockResolvedValue(makeRoleRow({ roleCode: 'operator' }));

      const result = await service.create(makeCreateRoleDto());

      const createArgs = prisma.sysRole.create.mock.calls[0]?.[0];
      expect(createArgs.data).toMatchObject({
        tenantId: 10n,
        roleCode: 'operator',
        isSystem: false,
      });
      expect(result.roleCode).toBe('operator');
    });

    it('唯一约束冲突映射为编码冲突', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      prisma.sysRole.create.mockRejectedValue(uniqueViolation());
      const error = await service.create(makeCreateRoleDto()).catch(e => e);
      expect(codeOf(error)).toBe('30A02');
    });
  });

  describe('update', () => {
    it('角色不存在时抛 30A01', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      const error = await service.update(1n, new UpdateRoleDto()).catch(e => e);
      expect(codeOf(error)).toBe('30A01');
    });

    it('系统内置角色改编码时抛 30A03', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(
        makeRoleRow({ isSystem: true, roleCode: 'system_code' }),
      );
      const dto = new UpdateRoleDto();
      dto.roleCode = 'changed_code';

      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('30A03');
    });

    it('改编码命中已有编码时抛 30A02', async () => {
      prisma.sysRole.findFirst
        .mockResolvedValueOnce(makeRoleRow({ roleCode: 'old_code' }))
        .mockResolvedValueOnce({ id: 9n });
      const dto = new UpdateRoleDto();
      dto.roleCode = 'new_code';

      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('30A02');
    });

    it('更新成功写入变更字段', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      prisma.sysRole.update.mockResolvedValue(makeRoleRow({ roleName: '新名称' }));
      const dto = new UpdateRoleDto();
      dto.roleName = '新名称';

      const result = await service.update(1n, dto);

      expect(prisma.sysRole.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1n }, data: { roleName: '新名称' } }),
      );
      expect(result.roleName).toBe('新名称');
    });
  });

  describe('remove', () => {
    it('角色不存在时抛 30A01', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('30A01');
    });

    it('系统内置角色禁止删除时抛 30A03', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow({ isSystem: true }));
      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('30A03');
    });

    it('角色被用户引用时抛 30A04', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      prisma.sysUserRole.count.mockResolvedValue(1);
      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('30A04');
    });

    it('删除成功：墓碑化编码并置为禁用', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(
        makeRoleRow({ id: 5n, roleCode: 'c'.repeat(80) }),
      );
      prisma.sysUserRole.count.mockResolvedValue(0);
      prisma.sysRole.update.mockResolvedValue(makeRoleRow({ id: 5n }));

      await service.remove(5n);

      const { data } = prisma.sysRole.update.mock.calls[0]?.[0];
      expect(data.status).toBe(RoleStatus.DISABLED);
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.roleCode).toContain('__deleted__5');
      expect((data.roleCode as string).length).toBeLessThanOrEqual(50);
    });
  });

  describe('listMenus', () => {
    it('角色不存在时抛 30A01', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      const error = await service.listMenus(1n).catch(e => e);
      expect(codeOf(error)).toBe('30A01');
    });

    it('返回角色已授权的菜单 ID 集合', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      prisma.sysRoleMenu.findMany.mockResolvedValue([{ menuId: 2n }, { menuId: 3n }]);

      const result = await service.listMenus(1n);

      expect(prisma.sysRoleMenu.findMany).toHaveBeenCalledWith({
        where: { roleId: 1n },
        select: { menuId: true },
      });
      expect(result.menuIds).toEqual(['2', '3']);
    });
  });

  describe('authorizeMenus', () => {
    it('角色不存在时抛 30A01', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(null);
      const error = await service
        .authorizeMenus(1n, { menuIds: ['2'] })
        .catch(e => e);
      expect(codeOf(error)).toBe('30A01');
    });

    it('含未许可菜单时抛 30A05', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      menuService.resolveLicensedMenuIds.mockResolvedValue(new Set(['2']));

      const error = await service
        .authorizeMenus(1n, { menuIds: ['2', '3'] })
        .catch(e => e);
      expect(codeOf(error)).toBe('30A05');
      expect(prisma.sysRoleMenu.createMany).not.toHaveBeenCalled();
    });

    it('授权成功：事务内删旧插新（全量替换）', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      menuService.resolveLicensedMenuIds.mockResolvedValue(new Set(['2', '3']));
      prisma.sysRoleMenu.deleteMany.mockResolvedValue({ count: 1 });
      prisma.sysRoleMenu.createMany.mockResolvedValue({ count: 2 });

      const result = await service.authorizeMenus(1n, { menuIds: ['2', '3'] });

      expect(prisma.sysRoleMenu.deleteMany).toHaveBeenCalledWith({ where: { roleId: 1n } });
      const { data } = prisma.sysRoleMenu.createMany.mock.calls[0]?.[0];
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ roleId: 1n, menuId: 2n });
      expect(result.menuIds).toEqual(['2', '3']);
    });

    it('传空数组表示清空授权，且不做许可校验', async () => {
      prisma.sysRole.findFirst.mockResolvedValue(makeRoleRow());
      prisma.sysRoleMenu.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.authorizeMenus(1n, { menuIds: [] });

      expect(menuService.resolveLicensedMenuIds).not.toHaveBeenCalled();
      expect(prisma.sysRoleMenu.createMany).not.toHaveBeenCalled();
      expect(result.menuIds).toEqual([]);
    });
  });
});
