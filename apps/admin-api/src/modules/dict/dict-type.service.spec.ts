import { DictStatus } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { DictTypeService } from './dict-type.service.js';
import { QueryDictTypeDto } from './dto/query-dict-type.dto.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    tenantId: null,
    dictName: '用户状态',
    dictType: 'user_status',
    remark: null,
    status: DictStatus.ACTIVE,
    createdAt: new Date(1000),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    sysDictType: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    sysDictData: { findMany: vi.fn(), count: vi.fn() },
  };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  const scopeResolver = new ScopeResolverService(requestContext as unknown as RequestContextService);
  const service = new DictTypeService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    scopeResolver,
  );
  return { prisma, cache, requestContext, service };
}

describe('dictTypeService.list', () => {
  it('租户视角：双层合并，租户已定义的类型平台行标 shadowed', async () => {
    const { prisma, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictType.findMany.mockImplementation(async ({ where }) =>
      (where as { tenantId: bigint | null }).tenantId === 10n
        ? [makeRow({ tenantId: 10n, id: 2n })]
        : [makeRow({ id: 1n, createdAt: new Date(500) })],
    );

    const result = await service.list(new QueryDictTypeDto());

    expect(result.total).toBe(2);
    expect(result.items[0]?.scope).toBe('TENANT');
    expect(result.items[0]?.shadowed).toBe(false);
    expect(result.items[1]?.scope).toBe('PLATFORM');
    expect(result.items[1]?.shadowed).toBe(true);
  });

  it('平台超管视角：单层平台行，不标 shadowed', async () => {
    const { prisma, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    prisma.sysDictType.findMany.mockResolvedValue([makeRow()]);

    const result = await service.list(new QueryDictTypeDto());

    expect(prisma.sysDictType.findMany).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.shadowed).toBe(false);
  });
});

describe('dictTypeService.create', () => {
  it('同作用域键已存在时冲突（80A02）', async () => {
    const { prisma, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictType.findFirst.mockResolvedValue(makeRow({ tenantId: 10n }));

    await expect(service.create(
      { dictType: 'user_status', dictName: 'x' } as never,
    )).rejects.toMatchObject({ code: '80A02' });
  });

  it('同键软删行复活并失效缓存', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictType.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRow({ tenantId: 10n, id: 9n, deletedAt: new Date() }));
    prisma.sysDictType.update.mockResolvedValue(makeRow({ tenantId: 10n, id: 9n }));
    cache.del.mockResolvedValue(true);

    const row = await service.create(
      { dictType: 'user_status', dictName: '重建' } as never,
    );

    expect(row.id).toBe('9');
    expect(cache.del).toHaveBeenCalledWith(CacheKeys.DICT_OPTIONS('10', 'user_status'));
  });
});

describe('dictTypeService.remove', () => {
  it('作用域内仍有数据条目时拒绝（80A03）', async () => {
    const { prisma, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictType.findFirst.mockResolvedValue(makeRow({ tenantId: 10n }));
    prisma.sysDictData.count.mockResolvedValue(2);

    await expect(service.remove(1n)).rejects.toMatchObject({ code: '80A03' });
  });

  it('无数据时软删除并失效缓存', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictType.findFirst.mockResolvedValue(makeRow({ tenantId: 10n }));
    prisma.sysDictData.count.mockResolvedValue(0);
    prisma.sysDictType.update.mockResolvedValue({});
    cache.del.mockResolvedValue(true);

    await expect(service.remove(1n)).resolves.toBeNull();
    expect(cache.del).toHaveBeenCalledWith(CacheKeys.DICT_OPTIONS('10', 'user_status'));
  });
});
