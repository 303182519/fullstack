import type { SysJobRunModel } from '@fedstack/database';
import type { KeyPrefixer, PubSubService } from '@fedstack/redis';
import { JobRunStatus, JobTriggerType } from '@fedstack/database';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';
import { JobRecordService } from './job-record.service.js';

// generateSnowflakeId 是进程级单例，测试进程不会走应用启动的 initSnowflake，需手动初始化
beforeAll(() => {
  initSnowflake(1n, 1n);
});

function makeRow(overrides: Partial<SysJobRunModel> = {}): SysJobRunModel {
  return {
    id: 1234567890123456789n,
    createdAt: new Date('2026-10-21T00:00:00Z'),
    updatedAt: new Date('2026-10-21T00:01:00Z'),
    tenantId: 10n,
    name: 'message-send',
    queueName: 'default',
    bullJobId: null,
    triggerType: JobTriggerType.MANUAL,
    status: JobRunStatus.QUEUED,
    progress: 0,
    payload: { to: 'a@b.com' },
    result: null,
    errorMessage: null,
    attemptsMade: 0,
    maxAttempts: 3,
    startedAt: null,
    finishedAt: null,
    createdBy: 1n,
    ...overrides,
  } as SysJobRunModel;
}

function makeService() {
  const prisma = {
    sysJobRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const pubSub = { publish: vi.fn(async (_channel: string, _message: string) => true) };
  // 模拟真实 KeyPrefixer 行为（拼接 app 前缀），让频道断言贴近生产形状
  const prefixer = { prefix: vi.fn((key: string) => `admin-api:${key}`) };
  const service = new JobRecordService(
    prisma as unknown as PrismaService,
    pubSub as unknown as PubSubService,
    prefixer as unknown as KeyPrefixer,
  );
  return { prisma, pubSub, prefixer, service };
}

describe('jobRecordService.markActive（并发安全守卫）', () => {
  it('queued 状态可激活，返回 true', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.findUnique.mockResolvedValue({ startedAt: null });
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    const ok = await service.markActive('1234567890123456789', 'job-1234567890123456789', 0);

    expect(ok).toBe(true);
    // 条件更新：WHERE status IN (queued, delayed) —— 并发 cancel 已被 DB 层拦截
    expect(prisma.sysJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1234567890123456789n,
          status: { in: [JobRunStatus.QUEUED, JobRunStatus.DELAYED] },
        },
      }),
    );
  });

  it('终态被抢占时 count=0 返回 false，worker 跳过执行', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.findUnique.mockResolvedValue({ startedAt: null });
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 0 });

    const ok = await service.markActive('1234567890123456789');

    expect(ok).toBe(false);
  });

  it('首次激活写入 startedAt，重试保留原值不覆盖', async () => {
    const { prisma, service } = makeService();
    // 重试场景：DB 已有 startedAt
    prisma.sysJobRun.findUnique.mockResolvedValue({
      startedAt: new Date('2026-10-20T08:00:00Z'),
    });
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    await service.markActive('1234567890123456789');

    const data = prisma.sysJobRun.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('startedAt');
  });

  it('首次激活（startedAt 为空）写入当前时间', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.findUnique.mockResolvedValue({ startedAt: null });
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    await service.markActive('1234567890123456789');

    const data = prisma.sysJobRun.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.startedAt).toBeInstanceOf(Date);
  });
});

describe('jobRecordService.markCompleted（条件更新，不覆盖终态）', () => {
  it('仅 active 状态可推进 completed，并发 cancel 后 count=0 静默跳过不抛错', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markCompleted('1234567890123456789', { ok: true })).resolves.toBeUndefined();

    expect(prisma.sysJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1234567890123456789n, status: JobRunStatus.ACTIVE },
      }),
    );
  });
});

describe('jobRecordService.markAttemptFailure（终态/重试分支）', () => {
  it('非终态失败回退 queued 等待 BullMQ 重试，条件守卫 status=ACTIVE', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    await service.markAttemptFailure('1234567890123456789', 1, new Error('boom'), false);

    expect(prisma.sysJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1234567890123456789n, status: JobRunStatus.ACTIVE },
        data: expect.objectContaining({
          status: JobRunStatus.QUEUED,
          attemptsMade: 1,
          errorMessage: 'boom',
        }),
      }),
    );
  });

  it('终态失败直接推进 failed 并写 finishedAt', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    await service.markAttemptFailure('1234567890123456789', 3, new Error('final'), true);

    const call = prisma.sysJobRun.updateMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: 1234567890123456789n });
    expect(call?.data).toEqual(
      expect.objectContaining({
        status: JobRunStatus.FAILED,
        attemptsMade: 3,
        errorMessage: 'final',
        finishedAt: expect.any(Date),
      }),
    );
  });

  it('超长错误消息截断到 2000 字符并追加截断标记', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });
    const longError = 'x'.repeat(5000);

    await service.markAttemptFailure('1234567890123456789', 1, new Error(longError), true);

    const data = prisma.sysJobRun.updateMany.mock.calls[0]?.[0]?.data as { errorMessage: string };
    expect(data.errorMessage.length).toBeLessThanOrEqual(2000 + '...（已截断）'.length);
    expect(data.errorMessage.endsWith('...（已截断）')).toBe(true);
  });
});

describe('jobRecordService.markCancelledIfCancellable（并发 cancel 守卫）', () => {
  it('queued/delayed 可取消，返回更新后的行', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });
    const row = makeRow({ status: JobRunStatus.CANCELLED });
    prisma.sysJobRun.findUniqueOrThrow.mockResolvedValue(row);

    const result = await service.markCancelledIfCancellable('1234567890123456789');

    expect(result).not.toBeNull();
    expect(prisma.sysJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1234567890123456789n,
          status: { in: [JobRunStatus.QUEUED, JobRunStatus.DELAYED] },
        },
      }),
    );
  });

  it('已被 worker 抢占（active）时 count=0 返回 null，不产生双重执行', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.markCancelledIfCancellable('1234567890123456789');

    expect(result).toBeNull();
    expect(prisma.sysJobRun.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('jobRecordService.updateProgress（进度归一化）', () => {
  it('进度钳制在 0-100 且仅 active 状态可推进', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });

    await service.updateProgress('1234567890123456789', 150);
    await service.updateProgress('1234567890123456789', -5);

    expect(prisma.sysJobRun.updateMany.mock.calls[0]?.[0]?.data.progress).toBe(100);
    expect(prisma.sysJobRun.updateMany.mock.calls[1]?.[0]?.data.progress).toBe(0);
    expect(prisma.sysJobRun.updateMany.mock.calls[0]?.[0]?.where.status).toBe(JobRunStatus.ACTIVE);
  });
});

describe('jobRecordService.list（租户语义 + 快照分页）', () => {
  it('不传 scopeTenantId 时不加租户过滤（超管平台级视图，看全部）', async () => {
    const { prisma, service } = makeService();
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list({ page: 1, pageSize: 20 });

    const where = prisma.$transaction.mock.calls[0]?.[0]?.[0]?.where ?? {};
    expect(where).not.toHaveProperty('tenantId');
    expect(where).not.toHaveProperty('OR');
    // findMany + count 在同一 $transaction 快照下，防止分页漂移
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('传 scopeTenantId 时 OR 过滤：精确租户 + 平台级任务', async () => {
    const { prisma, service } = makeService();
    prisma.$transaction.mockResolvedValue([[makeRow()], 1]);

    await service.list({ scopeTenantId: 42n, page: 1, pageSize: 20 });

    // findMany 在 $transaction 内部被调用，参数直接落在 findMany.mock.calls
    const findManyWhere = prisma.sysJobRun.findMany.mock.calls[0]?.[0]?.where ?? {};
    expect(findManyWhere.OR).toEqual([
      { tenantId: 42n },
      { tenantId: null },
    ]);
  });
});

describe('jobRecordService.findDeadLetters（死信三分类）', () => {
  it('非终态超时记录按状态归类 deadReason', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.findMany.mockResolvedValue([
      makeRow({ status: JobRunStatus.ACTIVE, id: 1n }),
      makeRow({ status: JobRunStatus.DELAYED, id: 2n }),
      makeRow({ status: JobRunStatus.QUEUED, id: 3n }),
    ]);

    const result = await service.findDeadLetters(60000);

    expect(result.find(r => r.id === '1')?.deadReason).toBe('stuck_active');
    expect(result.find(r => r.id === '2')?.deadReason).toBe('stuck_delayed');
    expect(result.find(r => r.id === '3')?.deadReason).toBe('stuck_queued');

    const where = prisma.sysJobRun.findMany.mock.calls[0]?.[0]?.where;
    expect(where.status.notIn).toEqual([
      JobRunStatus.COMPLETED,
      JobRunStatus.FAILED,
      JobRunStatus.CANCELLED,
    ]);
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
  });
});

describe('jobRecordService.createQueued（初始状态分支）', () => {
  it('delay 任务初始 delayed，立即任务初始 queued', async () => {
    const { prisma, service } = makeService();
    prisma.sysJobRun.create.mockImplementation(({ data }) => Promise.resolve(makeRow({
      id: data.id,
      status: data.status,
    })));

    const delayed = await service.createQueued({
      name: 'message-send',
      queueName: 'default',
      maxAttempts: 1,
      triggerType: JobTriggerType.MANUAL,
      status: JobRunStatus.DELAYED,
    });
    const immediate = await service.createQueued({
      name: 'message-send',
      queueName: 'default',
      maxAttempts: 1,
      triggerType: JobTriggerType.MANUAL,
    });

    expect(delayed.status).toBe(JobRunStatus.DELAYED);
    expect(immediate.status).toBe(JobRunStatus.QUEUED);
  });
});

describe('jobRecordService 状态事件发布（ADR-013 D5，best-effort）', () => {
  it('createQueued 后向本租户频道发布「有变化」提醒（仅 id + status）', async () => {
    const { prisma, pubSub, service } = makeService();
    prisma.sysJobRun.create.mockImplementation(({ data }) => Promise.resolve(makeRow({
      id: data.id,
      tenantId: data.tenantId ?? 10n,
      status: data.status,
    })));

    const view = await service.createQueued({
      name: 'message-send',
      queueName: 'default',
      maxAttempts: 1,
      triggerType: JobTriggerType.MANUAL,
      tenantId: '10',
    });

    // fire-and-forget：等待 promise 链执行
    await vi.waitFor(() => expect(pubSub.publish).toHaveBeenCalled());
    const [channel, raw] = pubSub.publish.mock.calls[0] as [string, string];
    expect(channel).toBe('admin-api:rt:job:10');
    expect(JSON.parse(raw)).toEqual({
      type: 'job.status',
      data: { id: view.id, status: JobRunStatus.QUEUED },
    });
  });

  it('平台级任务（tenantId 为空）发布到 platform 频道', async () => {
    const { prisma, pubSub, service } = makeService();
    prisma.sysJobRun.create.mockImplementation(({ data }) => Promise.resolve(makeRow({
      id: data.id,
      tenantId: null,
      status: data.status,
    })));

    await service.createQueued({
      name: 'message-send',
      queueName: 'default',
      maxAttempts: 1,
      triggerType: JobTriggerType.SYSTEM,
    });

    await vi.waitFor(() => expect(pubSub.publish).toHaveBeenCalled());
    expect(pubSub.publish.mock.calls[0]?.[0]).toBe('admin-api:rt:job:platform');
  });

  it('markCompleted 条件更新成功才发布事件；count=0（终态被抢占）不发布', async () => {
    const { prisma, pubSub, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });
    // 事件方法内补查 tenantId
    prisma.sysJobRun.findUnique.mockResolvedValue({ tenantId: 10n });

    await service.markCompleted('1234567890123456789', { ok: true }, 1);
    await vi.waitFor(() => expect(pubSub.publish).toHaveBeenCalledWith(
      'admin-api:rt:job:10',
      JSON.stringify({
        type: 'job.status',
        data: { id: '1234567890123456789', status: JobRunStatus.COMPLETED },
      }),
    ));

    const second = makeService();
    second.prisma.sysJobRun.updateMany.mockResolvedValue({ count: 0 });
    await second.service.markCompleted('1234567890123456789', null, 1);
    // 给潜在的 fire-and-forget 一个 microtask 窗口
    await Promise.resolve();
    expect(second.pubSub.publish).not.toHaveBeenCalled();
  });

  it('markCancelledIfCancellable 取消成功发布 cancelled 事件（租户来自行数据）', async () => {
    const { prisma, pubSub, service } = makeService();
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.sysJobRun.findUniqueOrThrow.mockResolvedValue(makeRow({ tenantId: 42n }));

    const row = await service.markCancelledIfCancellable('1234567890123456789');

    expect(row).not.toBeNull();
    await vi.waitFor(() => expect(pubSub.publish).toHaveBeenCalledWith(
      'admin-api:rt:job:42',
      JSON.stringify({
        type: 'job.status',
        data: { id: '1234567890123456789', status: JobRunStatus.CANCELLED },
      }),
    ));
  });

  it('publish 返回 false（Redis 降级）不影响状态机结果', async () => {
    const { prisma, pubSub, service } = makeService();
    pubSub.publish.mockResolvedValue(false);
    prisma.sysJobRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.sysJobRun.findUnique.mockResolvedValue({ startedAt: null, tenantId: 10n });

    const ok = await service.markActive('1234567890123456789');

    expect(ok).toBe(true);
    // 发布降级路径执行完毕（warn 日志），主流程返回值不受干扰
    await vi.waitFor(() => expect(pubSub.publish).toHaveBeenCalled());
  });
});
