import type { SessionRecord } from '@/shared/auth/auth.types.js';
import { describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { QueryOnlineUserDto } from './dto/query-online-user.dto.js';
import { OnlineService } from './online.service.js';

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sid-1',
    userId: '1',
    tenantId: '10',
    username: 'alice',
    isSuper: false,
    device: 'Chrome',
    ip: '127.0.0.1',
    createdAt: new Date(1000).toISOString(),
    expiresAt: new Date(9999).toISOString(),
    ...overrides,
  };
}

function makeService() {
  const session = {
    listAllSessions: vi.fn(),
    getSessionRecord: vi.fn(),
    removeSession: vi.fn(),
    removeAllSessions: vi.fn(),
  };
  const requestContext = { requireUser: vi.fn() };
  const prisma = { sysUser: { findFirst: vi.fn() } };
  const service = new OnlineService(
    session as unknown as SessionService,
    requestContext as unknown as RequestContextService,
    prisma as unknown as PrismaService,
  );
  return { session, requestContext, prisma, service };
}

describe('onlineService.list', () => {
  it('租户主体只看到本租户会话', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    session.listAllSessions.mockResolvedValue([
      makeSession(),
      makeSession({ sessionId: 'sid-2', tenantId: '20', userId: '2' }),
    ]);

    const result = await service.list(new QueryOnlineUserDto());

    expect(result.total).toBe(1);
    expect(result.items[0]?.sessionId).toBe('sid-1');
  });

  it('平台超管可看全部会话', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    session.listAllSessions.mockResolvedValue([
      makeSession(),
      makeSession({ sessionId: 'sid-2', tenantId: '20', userId: '2' }),
    ]);

    const result = await service.list(new QueryOnlineUserDto());

    expect(result.total).toBe(2);
  });

  it('username/device 过滤与分页', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });
    session.listAllSessions.mockResolvedValue([
      makeSession({ sessionId: 's-a', username: 'alice' }),
      makeSession({ sessionId: 's-b', username: 'bob' }),
      makeSession({ sessionId: 's-c', username: 'carol', device: 'Firefox' }),
    ]);
    const query = new QueryOnlineUserDto();
    query.page = 1;
    query.pageSize = 1;
    query.username = 'ali';

    const result = await service.list(query);

    // 'alice' 命中 username 模糊；pageSize=1 截断
    expect(result.total).toBe(1);
    expect(result.items[0]?.sessionId).toBe('s-a');
  });
});

describe('onlineService.kick', () => {
  it('会话不存在时 404（92A02）', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    session.getSessionRecord.mockResolvedValue(undefined);

    await expect(service.kick('nope')).rejects.toMatchObject({ code: '92A02' });
  });

  it('跨租户会话表现为 404，不泄露存在性', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    session.getSessionRecord.mockResolvedValue(makeSession({ tenantId: '20' }));

    await expect(service.kick('sid-1')).rejects.toMatchObject({ code: '92A02' });
    expect(session.removeSession).not.toHaveBeenCalled();
  });

  it('同租户踢单会话走 SessionService 正规删除', async () => {
    const { session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    session.getSessionRecord.mockResolvedValue(makeSession({ sessionId: 'sid-9', userId: '9' }));

    await expect(service.kick('sid-9')).resolves.toBeNull();
    expect(session.removeSession).toHaveBeenCalledWith('sid-9', '9');
  });
});

describe('onlineService.forceLogout', () => {
  it('非超管下线他租户用户时 404（不泄露存在性）', async () => {
    const { prisma, session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysUser.findFirst.mockResolvedValue({ tenantId: 20n });

    await expect(service.forceLogout('99')).rejects.toMatchObject({ code: '92A03' });
    expect(session.removeAllSessions).not.toHaveBeenCalled();
  });

  it('非超管下线本租户用户成功', async () => {
    const { prisma, session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: false,
      sessionId: 's',
    });
    prisma.sysUser.findFirst.mockResolvedValue({ tenantId: 10n });

    await expect(service.forceLogout('9')).resolves.toBeNull();
    expect(session.removeAllSessions).toHaveBeenCalledWith('9');
  });

  it('超管跨租户强制下线不查库直接执行', async () => {
    const { prisma, session, requestContext, service } = makeService();
    requestContext.requireUser.mockReturnValue({
      userId: '1',
      tenantId: '10',
      username: 'u',
      isSuper: true,
      sessionId: 's',
    });

    await expect(service.forceLogout('9')).resolves.toBeNull();
    expect(prisma.sysUser.findFirst).not.toHaveBeenCalled();
    expect(session.removeAllSessions).toHaveBeenCalledWith('9');
  });
});
