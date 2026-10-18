import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { DeptStatus } from '@fedstack/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { DeptService } from '@/modules/dept/dept.service.js';
import { CreateDeptDto } from '@/modules/dept/dto/create-dept.dto.js';
import { QueryDeptDto } from '@/modules/dept/dto/query-dept.dto.js';
import { UpdateDeptDto } from '@/modules/dept/dto/update-dept.dto.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { DataScopeService } from '@/shared/permission/data-scope.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function makeDeptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    parentId: null,
    deptName: '研发中心',
    leader: null,
    phone: null,
    path: '/1/',
    sort: 0,
    status: DeptStatus.ACTIVE,
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

describe('deptService', () => {
  const prisma = {
    sysDept: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sysUser: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  const requestContext = { requireUser: vi.fn() };
  const dataScope = {
    resolve: vi.fn(),
    scopeDeptWhere: vi.fn(),
  };

  let service: DeptService;

  beforeAll(() => {
    initSnowflake(BigInt(0), BigInt(0));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DeptService(
      prisma as unknown as PrismaService,
      requestContext as unknown as RequestContextService,
      dataScope as unknown as DataScopeService,
    );
    requestContext.requireUser.mockReturnValue(principal);
    dataScope.resolve.mockResolvedValue({ type: 'ALL' });
    dataScope.scopeDeptWhere.mockReturnValue({});
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  });

  describe('tree', () => {
    it('按租户与数据权限过滤并组装父子树', async () => {
      prisma.sysDept.findMany.mockResolvedValue([
        makeDeptRow({ id: 1n, parentId: null, path: '/1/' }),
        makeDeptRow({ id: 2n, parentId: 1n, path: '/1/2/' }),
      ]);

      const tree = await service.tree(new QueryDeptDto());

      expect(prisma.sysDept.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 10n, deletedAt: null }),
        }),
      );
      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('1');
      expect(tree[0]?.children[0]?.id).toBe('2');
    });

    it('父节点被数据权限过滤掉时，子节点上提为根', async () => {
      // 数据权限仅命中子树：只有 id=2 可见，其父 id=1 不在结果集
      prisma.sysDept.findMany.mockResolvedValue([
        makeDeptRow({ id: 2n, parentId: 1n, path: '/1/2/' }),
      ]);

      const tree = await service.tree(new QueryDeptDto());

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('2');
      expect(tree[0]?.parentId).toBe('1');
    });
  });

  describe('create', () => {
    it('根部门物化路径为 /自身id/', async () => {
      prisma.sysDept.create.mockImplementation(
        async (args: { data: { id: bigint; path: string } }) =>
          makeDeptRow({ id: args.data.id, path: args.data.path }),
      );

      const dto = Object.assign(new CreateDeptDto(), { deptName: '研发中心' });
      const created = await service.create(dto);

      const { data } = prisma.sysDept.create.mock.calls[0]?.[0];
      expect(data.tenantId).toBe(10n);
      expect(data.parentId).toBeNull();
      expect(data.path).toBe(`/${data.id.toString()}/`);
      expect(created.path).toBe(`/${data.id.toString()}/`);
    });

    it('子部门物化路径为 父路径 + 自身id + /', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(makeDeptRow({ id: 5n, path: '/1/5/' }));
      prisma.sysDept.create.mockImplementation(
        async (args: { data: { id: bigint; path: string } }) =>
          makeDeptRow({ id: args.data.id, parentId: 5n, path: args.data.path }),
      );

      const dto = Object.assign(new CreateDeptDto(), { deptName: '前端组', parentId: '5' });
      await service.create(dto);

      const { data } = prisma.sysDept.create.mock.calls[0]?.[0];
      expect(data.parentId).toBe(5n);
      expect(data.path).toBe(`/1/5/${data.id.toString()}/`);
    });

    it('上级部门不存在时抛 50A02', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(null);
      const dto = Object.assign(new CreateDeptDto(), { deptName: '前端组', parentId: '5' });

      const error = await service.create(dto).catch(e => e);
      expect(codeOf(error)).toBe('50A02');
    });
  });

  describe('update', () => {
    it('部门不存在时抛 50A01', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(null);
      const error = await service.update(1n, new UpdateDeptDto()).catch(e => e);
      expect(codeOf(error)).toBe('50A01');
    });

    it('变更上级时级联重算整棵子树的物化路径', async () => {
      // 首次 findFirst = 目标部门；第二次 = 新上级
      prisma.sysDept.findFirst
        .mockResolvedValueOnce(makeDeptRow({ id: 5n, parentId: 1n, path: '/1/5/' }))
        .mockResolvedValueOnce(makeDeptRow({ id: 3n, parentId: 1n, path: '/1/3/' }));
      // 子树：5 及其子 6
      prisma.sysDept.findMany.mockResolvedValue([
        { id: 5n, path: '/1/5/' },
        { id: 6n, path: '/1/5/6/' },
      ]);
      prisma.sysDept.update.mockResolvedValue(makeDeptRow({ id: 5n, path: '/1/3/5/' }));

      const dto = new UpdateDeptDto();
      dto.parentId = '3';
      await service.update(5n, dto);

      expect(prisma.sysDept.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { path: '/1/3/5/' },
      });
      expect(prisma.sysDept.update).toHaveBeenCalledWith({
        where: { id: 6n },
        data: { path: '/1/3/5/6/' },
      });
    });

    it('新上级位于自身子树内时抛 50A05（环）', async () => {
      prisma.sysDept.findFirst
        .mockResolvedValueOnce(makeDeptRow({ id: 5n, path: '/1/5/' }))
        .mockResolvedValueOnce(makeDeptRow({ id: 6n, parentId: 5n, path: '/1/5/6/' }));

      const dto = new UpdateDeptDto();
      dto.parentId = '6';
      const error = await service.update(5n, dto).catch(e => e);
      expect(codeOf(error)).toBe('50A05');
    });

    it('迁为根部门时路径重置为 /自身id/', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(
        makeDeptRow({ id: 5n, parentId: 1n, path: '/1/5/' }),
      );
      prisma.sysDept.findMany.mockResolvedValue([{ id: 5n, path: '/1/5/' }]);
      prisma.sysDept.update.mockResolvedValue(makeDeptRow({ id: 5n, path: '/5/' }));

      const dto = new UpdateDeptDto();
      dto.parentId = '';
      await service.update(5n, dto);

      expect(prisma.sysDept.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { path: '/5/' },
      });
    });
  });

  describe('remove', () => {
    it('存在下级部门时抛 50A03', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(makeDeptRow({ id: 5n }));
      prisma.sysDept.count.mockResolvedValue(1);
      prisma.sysUser.count.mockResolvedValue(0);

      const error = await service.remove(5n).catch(e => e);
      expect(codeOf(error)).toBe('50A03');
    });

    it('部门下存在用户时抛 50A04', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(makeDeptRow({ id: 5n }));
      prisma.sysDept.count.mockResolvedValue(0);
      prisma.sysUser.count.mockResolvedValue(2);

      const error = await service.remove(5n).catch(e => e);
      expect(codeOf(error)).toBe('50A04');
    });

    it('删除成功：软删除并置为禁用', async () => {
      prisma.sysDept.findFirst.mockResolvedValue(makeDeptRow({ id: 5n }));
      prisma.sysDept.count.mockResolvedValue(0);
      prisma.sysUser.count.mockResolvedValue(0);
      prisma.sysDept.update.mockResolvedValue(makeDeptRow({ id: 5n }));

      await service.remove(5n);

      const { data } = prisma.sysDept.update.mock.calls[0]?.[0];
      expect(data.status).toBe(DeptStatus.DISABLED);
      expect(data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
