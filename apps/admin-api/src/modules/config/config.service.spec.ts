import { CacheService } from '@fedstack/redis';
import { describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { ConfigService } from './config.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    tenantId: null,
    configName: '站点名称',
    configKey: 'site.name',
    configValue: 'platform',
    isSystem: false,
    remark: null,
    createdAt: new Date(1000),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    sysConfig: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  const scopeResolver = new ScopeResolverService(requestContext as unknown as RequestContextService);
  const service = new ConfigService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    scopeResolver,
  );
  return { prisma, cache, requestContext, service };
}

describe('configService.effectiveValue', () => {
  it('缓存命中直接返回，不查库', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.get.mockResolvedValue({ value: 'tenant', source: 'TENANT' });

    const out = await service.effectiveValue('site.name');

    expect(out).toEqual({ configKey: 'site.name', value: 'tenant', source: 'TENANT' });
    expect(prisma.sysConfig.findFirst).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith(CacheKeys.CONFIG_VALUE('10', 'site.name'));
  });

  it('租户有自有定义时取租户值并回源缓存（遮蔽平台级）', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.get.mockResolvedValue(undefined);
    prisma.sysConfig.findFirst
      .mockResolvedValueOnce(makeRow({ tenantId: 10n, configValue: 'tenant' }));
    cache.set.mockResolvedValue(true);

    const out = await service.effectiveValue('site.name');

    expect(out.source).toBe('TENANT');
    expect(out.value).toBe('tenant');
    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.CONFIG_VALUE('10', 'site.name'),
      { value: 'tenant', source: 'TENANT' },
    );
  });

  it('租户无自有定义回落平台级（source=PLATFORM）', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.get.mockResolvedValue(undefined);
    prisma.sysConfig.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRow({ configValue: 'platform' }));
    cache.set.mockResolvedValue(true);

    const out = await service.effectiveValue('site.name');

    expect(out.source).toBe('PLATFORM');
    expect(out.value).toBe('platform');
  });

  it('两级都不存在时抛 70A01', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    cache.get.mockResolvedValue(undefined);
    prisma.sysConfig.findFirst.mockResolvedValue(null);

    await expect(service.effectiveValue('ghost.key')).rejects.toMatchObject({ code: '70A01' });
  });
});

describe('configService 写路径', () => {
  it('isSystem 参数禁止删除（70A03）', async () => {
    const { prisma, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysConfig.findFirst.mockResolvedValue(makeRow({ tenantId: 10n, isSystem: true }));

    await expect(service.remove(1n)).rejects.toMatchObject({ code: '70A03' });
  });

  it('更新后失效对应作用域的取值缓存', async () => {
    const { prisma, cache, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysConfig.findFirst.mockResolvedValue(makeRow({ tenantId: 10n, id: 5n }));
    prisma.sysConfig.update.mockResolvedValue(makeRow({ tenantId: 10n, id: 5n, configValue: 'v2' }));
    cache.del.mockResolvedValue(true);

    await service.update(5n, { configValue: 'v2' } as never);

    expect(cache.del).toHaveBeenCalledWith(CacheKeys.CONFIG_VALUE('10', 'site.name'));
  });
});
