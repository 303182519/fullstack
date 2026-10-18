import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { MenuStatus, MenuType } from '@fedstack/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { CreateMenuDto } from '@/modules/menu/dto/create-menu.dto.js';
import { QueryMenuDto } from '@/modules/menu/dto/query-menu.dto.js';
import { UpdateMenuDto } from '@/modules/menu/dto/update-menu.dto.js';
import { MenuService } from '@/modules/menu/menu.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function makeMenuRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    parentId: null,
    menuType: MenuType.MENU,
    menuName: '用户管理',
    routeName: null,
    routePath: null,
    component: null,
    permCode: null,
    icon: null,
    sort: 0,
    visible: true,
    status: MenuStatus.ACTIVE,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const principal: AuthPrincipal = {
  userId: '1',
  tenantId: '10',
  username: 'admin',
  isSuper: true,
  sessionId: 's',
};

describe('menuService', () => {
  const prisma = {
    sysMenu: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sysRoleMenu: { count: vi.fn() },
    sysTenantPackageMenu: { count: vi.fn() },
    sysTenant: { findFirst: vi.fn() },
  };
  const requestContext = { requireUser: vi.fn() };

  let service: MenuService;

  beforeAll(() => {
    initSnowflake(BigInt(0), BigInt(0));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MenuService(
      prisma as unknown as PrismaService,
      requestContext as unknown as RequestContextService,
    );
    requestContext.requireUser.mockReturnValue(principal);
  });

  describe('platformTree', () => {
    it('平台级菜单按 tenantId=null 组装树', async () => {
      prisma.sysMenu.findMany.mockResolvedValue([
        makeMenuRow({ id: 1n, menuType: MenuType.DIRECTORY }),
        makeMenuRow({ id: 2n, parentId: 1n }),
      ]);

      const tree = await service.platformTree(new QueryMenuDto());

      expect(prisma.sysMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: null, deletedAt: null }),
        }),
      );
      expect(tree).toHaveLength(1);
      expect(tree[0]?.children[0]?.id).toBe('2');
    });
  });

  describe('availableTree', () => {
    it('未绑套餐时不加套餐约束（平台全部启用菜单）', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({ packageId: null });
      prisma.sysMenu.findMany.mockResolvedValue([makeMenuRow()]);

      await service.availableTree();

      const { where } = prisma.sysMenu.findMany.mock.calls[0]?.[0];
      expect(where).toMatchObject({ tenantId: null, status: MenuStatus.ACTIVE });
      expect(where.packageMenus).toBeUndefined();
    });

    it('已绑套餐时收敛为套餐许可菜单', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({ packageId: 7n });
      prisma.sysMenu.findMany.mockResolvedValue([makeMenuRow()]);

      await service.availableTree();

      const { where } = prisma.sysMenu.findMany.mock.calls[0]?.[0];
      expect(where.packageMenus).toEqual({ some: { packageId: 7n } });
    });
  });

  describe('resolveLicensedMenuIds', () => {
    it('未绑套餐时返回平台全部启用菜单 ID', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({ packageId: null });
      prisma.sysMenu.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);

      const licensed = await service.resolveLicensedMenuIds(10n);

      expect([...licensed].sort()).toEqual(['1', '2']);
      const { where } = prisma.sysMenu.findMany.mock.calls[0]?.[0];
      expect(where.packageMenus).toBeUndefined();
    });

    it('已绑套餐时仅返回套餐许可菜单 ID', async () => {
      prisma.sysTenant.findFirst.mockResolvedValue({ packageId: 7n });
      prisma.sysMenu.findMany.mockResolvedValue([{ id: 3n }]);

      const licensed = await service.resolveLicensedMenuIds(10n);

      expect([...licensed]).toEqual(['3']);
      const { where } = prisma.sysMenu.findMany.mock.calls[0]?.[0];
      expect(where.packageMenus).toEqual({ some: { packageId: 7n } });
    });
  });

  describe('create', () => {
    it('按钮类型缺少权限编码时抛 60A05', async () => {
      const dto = Object.assign(new CreateMenuDto(), {
        menuType: MenuType.BUTTON,
        menuName: '新增',
      });

      const error = await service.create(dto).catch(e => e);
      expect(codeOf(error)).toBe('60A05');
      expect(prisma.sysMenu.create).not.toHaveBeenCalled();
    });

    it('权限编码已存在时抛 60A04', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue({ id: 9n });
      const dto = Object.assign(new CreateMenuDto(), {
        menuType: MenuType.BUTTON,
        menuName: '新增',
        permCode: 'system:user:add',
      });

      const error = await service.create(dto).catch(e => e);
      expect(codeOf(error)).toBe('60A04');
    });

    it('上级菜单不存在时抛 60A02', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(null);
      const dto = Object.assign(new CreateMenuDto(), {
        menuType: MenuType.MENU,
        menuName: '用户管理',
        parentId: '5',
      });

      const error = await service.create(dto).catch(e => e);
      expect(codeOf(error)).toBe('60A02');
    });

    it('创建平台级菜单：tenantId 恒为 null', async () => {
      prisma.sysMenu.create.mockResolvedValue(makeMenuRow({ id: 11n }));
      const dto = Object.assign(new CreateMenuDto(), {
        menuType: MenuType.MENU,
        menuName: '用户管理',
      });

      const created = await service.create(dto);

      const { data } = prisma.sysMenu.create.mock.calls[0]?.[0];
      expect(data.tenantId).toBeNull();
      expect(created.id).toBe('11');
    });
  });

  describe('update', () => {
    it('菜单不存在时抛 60A01', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(null);
      const error = await service.update(1n, new UpdateMenuDto()).catch(e => e);
      expect(codeOf(error)).toBe('60A01');
    });

    it('有子菜单时改为按钮类型抛 60A03', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(
        makeMenuRow({ id: 1n, menuType: MenuType.MENU, permCode: 'system:user:query' }),
      );
      prisma.sysMenu.count.mockResolvedValue(1);

      const dto = new UpdateMenuDto();
      dto.menuType = MenuType.BUTTON;
      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('60A03');
    });

    it('上级菜单是自身时抛 60A02', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(makeMenuRow({ id: 1n }));

      const dto = new UpdateMenuDto();
      dto.parentId = '1';
      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('60A02');
    });

    it('上级菜单为按钮时抛 60A02', async () => {
      prisma.sysMenu.findFirst
        .mockResolvedValueOnce(makeMenuRow({ id: 1n }))
        .mockResolvedValueOnce(makeMenuRow({ id: 2n, menuType: MenuType.BUTTON }));

      const dto = new UpdateMenuDto();
      dto.parentId = '2';
      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('60A02');
    });

    it('更新成功写入变更字段', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(makeMenuRow({ id: 1n }));
      prisma.sysMenu.update.mockResolvedValue(makeMenuRow({ id: 1n, menuName: '新名称' }));

      const dto = new UpdateMenuDto();
      dto.menuName = '新名称';
      const updated = await service.update(1n, dto);

      expect(prisma.sysMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1n }, data: { menuName: '新名称' } }),
      );
      expect(updated.menuName).toBe('新名称');
    });
  });

  describe('remove', () => {
    it('存在子菜单时抛 60A03', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(makeMenuRow({ id: 1n }));
      prisma.sysMenu.count.mockResolvedValue(1);
      prisma.sysRoleMenu.count.mockResolvedValue(0);
      prisma.sysTenantPackageMenu.count.mockResolvedValue(0);

      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('60A03');
    });

    it('菜单被角色引用时抛 60A06', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(makeMenuRow({ id: 1n }));
      prisma.sysMenu.count.mockResolvedValue(0);
      prisma.sysRoleMenu.count.mockResolvedValue(1);
      prisma.sysTenantPackageMenu.count.mockResolvedValue(0);

      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('60A06');
    });

    it('删除成功：软删除并置为禁用', async () => {
      prisma.sysMenu.findFirst.mockResolvedValue(makeMenuRow({ id: 1n }));
      prisma.sysMenu.count.mockResolvedValue(0);
      prisma.sysRoleMenu.count.mockResolvedValue(0);
      prisma.sysTenantPackageMenu.count.mockResolvedValue(0);
      prisma.sysMenu.update.mockResolvedValue(makeMenuRow({ id: 1n }));

      await service.remove(1n);

      const { data } = prisma.sysMenu.update.mock.calls[0]?.[0];
      expect(data.status).toBe(MenuStatus.DISABLED);
      expect(data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
