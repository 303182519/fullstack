import type { CacheHealthStatus } from '@fedstack/redis';
import type { DynamicModule } from '@nestjs/common';
import { CacheHealthIndicator } from '@fedstack/redis';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';
import { HealthModule } from './health.module.js';

// 模拟 @fedstack/redis 的全局 RedisCacheModule：global + 导出 CacheHealthIndicator，
// 与 admin-api 真实装配同构（对象字面量构造，避免 spec 文件引入装饰器语法）
function createRedisModule(status: CacheHealthStatus): DynamicModule {
  return {
    module: class MockRedisModule {},
    global: true,
    providers: [
      { provide: CacheHealthIndicator, useValue: { check: async () => status } },
    ],
    exports: [CacheHealthIndicator],
  };
}

// terminus 12 的 pingDb 先调 $runCommandRaw，捕获含「Use the mongodb provider」的
// 错误后回退 $queryRawUnsafe('SELECT 1')——这里按 Prisma 7 SQL 客户端的真实行为建模
// （@fedstack/database 生成的客户端运行时同样抛该文案，已核实 @prisma/client 7.9.1）
const prismaUp = {
  $runCommandRaw: vi.fn().mockRejectedValue(
    new Error('The mysql provider does not support $runCommandRaw. Use the mongodb provider.'),
  ),
  $queryRawUnsafe: vi.fn().mockResolvedValue([{ 1: 1 }]),
};

function createAppModule(imports: DynamicModule[] = []) {
  return HealthModule.forRootAsync({
    imports,
    inject: [PrismaHealthIndicator],
    useFactory: (db: PrismaHealthIndicator) => ({
      readinessChecks: [() => db.pingCheck('database', prismaUp)],
    }),
  });
}

describe('healthModule 装配（集成）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未注册 RedisCacheModule：cache 项 degraded，整体 200 且状态 degraded', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule()],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const liveness = controller.liveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.uptime).toBeGreaterThanOrEqual(0);

    const readiness = await controller.readiness();
    expect(readiness.status).toBe('degraded');
    expect(readiness.details.cache.status).toBe('degraded');
    expect(readiness.details.database.status).toBe('up');
  });

  it('redis 可用：cache 与 database 均 up，整体 ok', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(), createRedisModule('up')],
    }).compile();

    const readiness = await moduleRef.get(HealthController).readiness();
    expect(readiness.status).toBe('ok');
    expect(readiness.details.cache.status).toBe('up');
    expect(readiness.details.database.status).toBe('up');
    // 锁定 terminus 12 的 SQL 回退路径：$runCommandRaw 失败文案触发后执行 SELECT 1
    expect(prismaUp.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('redis 不可达：cache 项 down，就绪检查抛 503 ServiceUnavailableException', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(), createRedisModule('down')],
    }).compile();

    // terminus 12 就绪失败抛 ServiceUnavailableException（503）
    await expect(moduleRef.get(HealthController).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
