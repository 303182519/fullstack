import { MenuStatus, PackageStatus } from '@fedstack/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePackageDto } from '@/modules/tenant-package/dto/create-package.dto.js';
import { QueryPackageDto } from '@/modules/tenant-package/dto/query-package.dto.js';
import { UpdatePackageDto } from '@/modules/tenant-package/dto/update-package.dto.js';
import { PackageService } from '@/modules/tenant-package/package.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function makePackageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    packageName: '标准版',
    packageCode: 'standard',
    description: null,
    status: PackageStatus.ACTIVE,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeCreatePackageDto(overrides: Partial<CreatePackageDto> = {}): CreatePackageDto {
  return Object.assign(
    new CreatePackageDto(),
    { packageName: '标准版', packageCode: 'standard' },
    overrides,
  );
}

describe('packageService', () => {
  const prisma = {
    sysTenantPackage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sysTenantPackageMenu: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    sysMenu: { findMany: vi.fn() },
    sysTenant: { count: vi.fn() },
    $transaction: vi.fn(),
  };

  let service: PackageService;

  beforeAll(() => {
    initSnowflake(BigInt(0), BigInt(0));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PackageService(prisma as unknown as PrismaService);
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  });

  describe('list', () => {
    it('按条件分页查询并映射列表项', async () => {
      const query = new QueryPackageDto();
      query.packageCode = 'std';
      prisma.sysTenantPackage.findMany.mockResolvedValue([makePackageRow()]);
      prisma.sysTenantPackage.count.mockResolvedValue(1);

      const result = await service.list(query);

      expect(prisma.sysTenantPackage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            packageCode: { contains: 'std' },
          }),
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: '1', packageCode: 'standard' }),
      );
    });
  });

  describe('detail', () => {
    it('套餐不存在时抛 91A01', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(null);
      const error = await service.detail(1n).catch(e => e);
      expect(codeOf(error)).toBe('91A01');
    });
  });

  describe('create', () => {
    it('套餐编码已存在时抛 91A02', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue({ id: 9n });
      const error = await service.create(makeCreatePackageDto()).catch(e => e);
      expect(codeOf(error)).toBe('91A02');
    });

    it('创建成功写入套餐字段', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(null);
      prisma.sysTenantPackage.create.mockResolvedValue(makePackageRow());

      const created = await service.create(makeCreatePackageDto());

      const { data } = prisma.sysTenantPackage.create.mock.calls[0]?.[0];
      expect(data).toMatchObject({ packageName: '标准版', packageCode: 'standard' });
      expect(created.packageCode).toBe('standard');
    });
  });

  describe('update', () => {
    it('改编码命中已有编码时抛 91A02', async () => {
      prisma.sysTenantPackage.findFirst
        .mockResolvedValueOnce(makePackageRow({ packageCode: 'old_code' }))
        .mockResolvedValueOnce({ id: 9n });

      const dto = new UpdatePackageDto();
      dto.packageCode = 'new_code';
      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('91A02');
    });

    it('更新成功写入变更字段', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysTenantPackage.update.mockResolvedValue(
        makePackageRow({ packageName: '新名称' }),
      );

      const dto = new UpdatePackageDto();
      dto.packageName = '新名称';
      const updated = await service.update(1n, dto);

      expect(prisma.sysTenantPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1n }, data: { packageName: '新名称' } }),
      );
      expect(updated.packageName).toBe('新名称');
    });
  });

  describe('remove', () => {
    it('套餐被租户引用时抛 91A03', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysTenant.count.mockResolvedValue(1);

      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('91A03');
    });

    it('删除成功：墓碑化编码并置为禁用', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(
        makePackageRow({ id: 5n, packageCode: 'c'.repeat(80) }),
      );
      prisma.sysTenant.count.mockResolvedValue(0);
      prisma.sysTenantPackage.update.mockResolvedValue(makePackageRow({ id: 5n }));

      await service.remove(5n);

      const { data } = prisma.sysTenantPackage.update.mock.calls[0]?.[0];
      expect(data.status).toBe(PackageStatus.DISABLED);
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.packageCode).toContain('__deleted__5');
      expect((data.packageCode as string).length).toBeLessThanOrEqual(50);
    });
  });

  describe('authorizeMenus', () => {
    it('套餐不存在时抛 91A01', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(null);
      const error = await service
        .authorizeMenus(1n, { menuIds: ['2'] })
        .catch(e => e);
      expect(codeOf(error)).toBe('91A01');
    });

    it('存在非平台级启用菜单时抛 91A04', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysMenu.findMany.mockResolvedValue([{ id: 2n }]);

      const error = await service
        .authorizeMenus(1n, { menuIds: ['2', '3'] })
        .catch(e => e);
      expect(codeOf(error)).toBe('91A04');
    });

    it('授权成功：事务内删旧插新（全量替换）', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysMenu.findMany.mockResolvedValue([{ id: 2n }, { id: 3n }]);
      prisma.sysTenantPackageMenu.deleteMany.mockResolvedValue({ count: 1 });
      prisma.sysTenantPackageMenu.createMany.mockResolvedValue({ count: 2 });

      const result = await service.authorizeMenus(1n, { menuIds: ['2', '3'] });

      expect(prisma.sysTenantPackageMenu.deleteMany).toHaveBeenCalledWith({
        where: { packageId: 1n },
      });
      const { data } = prisma.sysTenantPackageMenu.createMany.mock.calls[0]?.[0];
      expect(data).toHaveLength(2);
      expect(result.menuIds).toEqual(['2', '3']);
    });

    it('传空数组表示清空授权', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysTenantPackageMenu.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.authorizeMenus(1n, { menuIds: [] });

      expect(prisma.sysTenantPackageMenu.createMany).not.toHaveBeenCalled();
      expect(result.menuIds).toEqual([]);
    });

    it('菜单校验仅限平台级启用菜单', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow());
      prisma.sysMenu.findMany.mockResolvedValue([{ id: 2n }]);
      prisma.sysTenantPackageMenu.deleteMany.mockResolvedValue({ count: 0 });
      prisma.sysTenantPackageMenu.createMany.mockResolvedValue({ count: 1 });

      await service.authorizeMenus(1n, { menuIds: ['2'] });

      expect(prisma.sysMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: null,
            deletedAt: null,
            status: MenuStatus.ACTIVE,
          }),
        }),
      );
    });
  });

  describe('listMenus', () => {
    it('返回套餐已绑定的菜单 ID 集合', async () => {
      prisma.sysTenantPackage.findFirst.mockResolvedValue(makePackageRow({ id: 5n }));
      prisma.sysTenantPackageMenu.findMany.mockResolvedValue([{ menuId: 2n }, { menuId: 3n }]);

      const result = await service.listMenus(5n);

      expect(prisma.sysTenantPackageMenu.findMany).toHaveBeenCalledWith({
        where: { packageId: 5n },
        select: { menuId: true },
      });
      expect(result.menuIds).toEqual(['2', '3']);
    });
  });
});
