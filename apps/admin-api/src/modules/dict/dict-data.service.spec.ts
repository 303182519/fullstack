import { DictStatus } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { DictDataService } from './dict-data.service.js';
import { QueryDictDataDto } from './dto/query-dict-data.dto.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    tenantId: null,
    dictType: 'user_status',
    dictLabel: '启用',
    dictValue: '0',
    sort: 0,
    remark: null,
    status: DictStatus.ACTIVE,
    createdAt: new Date(1000),
    ...overrides,
  };
}

describe('dictDataService.effectiveOptions', () => {
  const prisma = {
    sysDictType: { findFirst: vi.fn() },
    sysDictData: { findMany: vi.fn() },
  };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  const scopeResolver = new ScopeResolverService(requestContext as unknown as RequestContextService);
  let service: DictDataService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DictDataService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      scopeResolver,
    );
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
  });

  it('缓存命中时直接返回，不查数据库', async () => {
    const cached = [{ dictLabel: '启用', dictValue: '0', sort: 0 }];
    cache.get.mockResolvedValue(cached);

    const options = await service.effectiveOptions('user_status');

    expect(options).toBe(cached);
    expect(prisma.sysDictType.findFirst).not.toHaveBeenCalled();
    expect(prisma.sysDictData.findMany).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith(
      CacheKeys.DICT_OPTIONS('10', 'user_status'),
    );
  });

  it('租户有自有类型定义时整体遮蔽，读租户数据行并回源缓存', async () => {
    cache.get.mockResolvedValue(undefined);
    prisma.sysDictType.findFirst.mockResolvedValue({ id: 100n });
    // mock 顺序即 DB 返回顺序（sort 升序由 DB 保证）
    prisma.sysDictData.findMany.mockResolvedValue([
      makeRow({ tenantId: 10n, dictValue: '0', sort: 1 }),
      makeRow({ tenantId: 10n, dictValue: '1', sort: 2 }),
    ]);
    cache.set.mockResolvedValue(true);

    const options = await service.effectiveOptions('user_status');

    expect(prisma.sysDictData.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 10n }),
    }));
    expect(options.map(o => o.dictValue)).toEqual(['0', '1']);
    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.DICT_OPTIONS('10', 'user_status'),
      options,
    );
  });

  it('租户无自有定义时回落平台级数据行', async () => {
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.get.mockResolvedValue(undefined);
    prisma.sysDictType.findFirst.mockResolvedValue(null);
    prisma.sysDictData.findMany.mockResolvedValue([makeRow()]);
    cache.set.mockResolvedValue(true);

    const options = await service.effectiveOptions('user_status');

    // 两次调用：先查租户类型，miss 后查平台数据行
    expect(prisma.sysDictData.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: null }),
    }));
    expect(options.map(o => o.dictValue)).toEqual(['0']);
  });

  it('平台超管消费端直接读平台级', async () => {
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    cache.get.mockResolvedValue(undefined);
    prisma.sysDictData.findMany.mockResolvedValue([makeRow()]);
    cache.set.mockResolvedValue(true);

    await service.effectiveOptions('user_status');

    // 不做自有类型点查
    expect(prisma.sysDictType.findFirst).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith(
      CacheKeys.DICT_OPTIONS('platform', 'user_status'),
    );
  });
});

describe('dictDataService 写路径', () => {
  const prisma = {
    sysDictType: { findFirst: vi.fn() },
    sysDictData: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  const scopeResolver = new ScopeResolverService(requestContext as unknown as RequestContextService);
  let service: DictDataService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DictDataService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      scopeResolver,
    );
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.del.mockResolvedValue(true);
  });

  it('类型定义缺失时拒绝创建（80A07）', async () => {
    prisma.sysDictType.findFirst.mockResolvedValue(null);

    await expect(service.create(
      { dictType: 'ghost', dictLabel: 'x', dictValue: '1' } as any,
    )).rejects.toMatchObject({ code: '80A07' });
  });

  it('更新后失效该作用域的选项缓存', async () => {
    prisma.sysDictData.findFirst.mockResolvedValue(makeRow({ tenantId: 10n, id: 5n }));
    prisma.sysDictData.update.mockResolvedValue(makeRow({ tenantId: 10n, id: 5n, dictLabel: '改' }));

    await service.update(5n, { dictLabel: '改' } as any);

    expect(cache.del).toHaveBeenCalledWith(CacheKeys.DICT_OPTIONS('10', 'user_status'));
  });

  it('平台级更新失效 platform 键', async () => {
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    prisma.sysDictData.findFirst.mockResolvedValue(makeRow({ tenantId: null, id: 6n }));
    prisma.sysDictData.update.mockResolvedValue(makeRow({ tenantId: null, id: 6n }));

    await service.update(6n, { sort: 3 } as any);

    expect(cache.del).toHaveBeenCalledWith(CacheKeys.DICT_OPTIONS('platform', 'user_status'));
  });

  it('软删除同样失效缓存', async () => {
    prisma.sysDictData.findFirst.mockResolvedValue(makeRow({ tenantId: 10n, id: 7n }));
    prisma.sysDictData.update.mockResolvedValue({});

    await service.remove(7n);

    expect(cache.del).toHaveBeenCalledWith(CacheKeys.DICT_OPTIONS('10', 'user_status'));
  });
});

describe('dictDataService.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const prisma = {
    sysDictType: { findMany: vi.fn() },
    sysDictData: { findMany: vi.fn() },
  };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  const scopeResolver = new ScopeResolverService(requestContext as unknown as RequestContextService);
  const service = new DictDataService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    scopeResolver,
  );

  it('租户视角：平台行按租户已定义的类型标记 shadowed', async () => {
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysDictData.findMany.mockImplementation(async ({ where }) =>
      (where as { tenantId: bigint | null }).tenantId === 10n
        ? [makeRow({ tenantId: 10n, id: 2n, dictType: 'user_status' })]
        : [
            makeRow({ id: 1n, dictType: 'user_status', createdAt: new Date(500) }),
            makeRow({ id: 3n, dictType: 'other', createdAt: new Date(900) }),
          ],
    );
    prisma.sysDictType.findMany.mockResolvedValue([{ dictType: 'user_status' }]);

    const result = await service.list(new QueryDictDataDto());

    expect(result.total).toBe(3);
    const shadowed = Object.fromEntries(result.items.map(i => [i.dictType, i.shadowed]));
    expect(shadowed.user_status).toBe(true);
    expect(shadowed.other).toBe(false);
  });

  it('平台超管视角：无租户腿，全部平台行不标 shadowed', async () => {
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    prisma.sysDictData.findMany.mockResolvedValue([makeRow()]);
    prisma.sysDictType.findMany.mockResolvedValue([]);

    const result = await service.list(new QueryDictDataDto());

    expect(prisma.sysDictData.findMany).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.shadowed).toBe(false);
    expect(result.items[0]?.scope).toBe('PLATFORM');
  });
});
