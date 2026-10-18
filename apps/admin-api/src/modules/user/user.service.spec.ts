import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Prisma, UserStatus } from '@fedstack/database';
import { Logger } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { CreateUserDto } from '@/modules/user/dto/create-user.dto.js';
import { QueryUserDto } from '@/modules/user/dto/query-user.dto.js';
import { UpdateUserDto } from '@/modules/user/dto/update-user.dto.js';
import { UserService } from '@/modules/user/user.service.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { DataScopeService } from '@/shared/permission/data-scope.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    username: 'alice',
    nickname: 'Alice',
    email: 'alice@example.com',
    phone: null,
    avatar: null,
    gender: null,
    remark: null,
    status: UserStatus.ACTIVE,
    isSuper: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    userRoles: [],
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

function makeCreateUserDto(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
  return Object.assign(new CreateUserDto(), { username: 'bob', password: 'Passw0rd' }, overrides);
}

describe('userService', () => {
  const prisma = {
    sysUser: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sysRole: { findMany: vi.fn() },
    sysDept: { findFirst: vi.fn() },
    sysUserRole: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const password = {
    hash: vi.fn(),
    normalizeHistory: vi.fn(),
    isReusedPassword: vi.fn(),
    appendHistory: vi.fn(),
  };
  const session = { removeAllSessions: vi.fn() };
  const requestContext = { requireUser: vi.fn() };
  // 默认数据权限 = ALL：既有断言不受影响；范围相关用例再单独覆盖
  const dataScope = {
    resolve: vi.fn(),
    scopeUserWhere: vi.fn(),
    scopeDeptWhere: vi.fn(),
  };

  let service: UserService;

  beforeAll(() => {
    initSnowflake(BigInt(0), BigInt(0));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    service = new UserService(
      prisma as unknown as PrismaService,
      password as unknown as PasswordService,
      session as unknown as SessionService,
      requestContext as unknown as RequestContextService,
      dataScope as unknown as DataScopeService,
    );

    requestContext.requireUser.mockReturnValue(principal);
    dataScope.resolve.mockResolvedValue({ type: 'ALL' });
    dataScope.scopeUserWhere.mockReturnValue({});
    dataScope.scopeDeptWhere.mockReturnValue({});
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
    session.removeAllSessions.mockResolvedValue(0);
    password.hash.mockResolvedValue('hashed');
    password.normalizeHistory.mockReturnValue([]);
    password.isReusedPassword.mockResolvedValue(false);
    password.appendHistory.mockReturnValue(['new-hash']);
  });

  describe('list', () => {
    it('按当前租户分页查询并映射列表项', async () => {
      const query = new QueryUserDto();
      query.username = 'ali';
      prisma.sysUser.findMany.mockResolvedValue([makeUserRow()]);
      prisma.sysUser.count.mockResolvedValue(1);

      const result = await service.list(query);

      expect(prisma.sysUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 10n,
            deletedAt: null,
            username: { contains: 'ali' },
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ total: 1, page: 1, pageSize: 20 }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: '1', username: 'alice', roles: [] }),
      );
    });
  });

  describe('detail', () => {
    it('用户不存在时抛 20A01', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      const error = await service.detail(1n).catch(e => e);
      expect(codeOf(error)).toBe('20A01');
    });

    it('命中时返回详情与角色 ID 列表', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(
        makeUserRow({
          userRoles: [
            { role: { id: 2n, roleName: '管理员', roleCode: 'admin', dataScope: 'ALL', deletedAt: null } },
          ],
        }),
      );
      const detail = await service.detail(1n);
      expect(detail.id).toBe('1');
      expect(detail.roleIds).toEqual(['2']);
      expect(detail.roles[0]?.roleCode).toBe('admin');
    });
  });

  describe('create', () => {
    it('用户名已存在时抛 20A02', async () => {
      prisma.sysUser.findFirst.mockResolvedValue({ id: 9n });
      const error = await service.create(makeCreateUserDto()).catch(e => e);
      expect(codeOf(error)).toBe('20A02');
    });

    it('邮箱已存在时抛 20A03', async () => {
      prisma.sysUser.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2n });
      const error = await service
        .create(makeCreateUserDto({ email: 'bob@example.com' }))
        .catch(e => e);
      expect(codeOf(error)).toBe('20A03');
    });

    it('创建成功写入密码哈希与历史快照', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.sysUser.create.mockResolvedValue(makeUserRow({ username: 'bob' }));

      const detail = await service.create(makeCreateUserDto());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const createArgs = prisma.sysUser.create.mock.calls[0]?.[0];
      expect(createArgs.data).toMatchObject({
        tenantId: 10n,
        username: 'bob',
        password: 'hashed',
        passwordHistory: ['hashed'],
      });
      expect(detail.username).toBe('bob');
    });

    it('绑定角色时校验角色归属并写入关联', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.sysUser.create.mockResolvedValue(makeUserRow());
      prisma.sysRole.findMany.mockResolvedValue([{ id: 2n }]);
      prisma.sysUserRole.deleteMany.mockResolvedValue({ count: 0 });
      prisma.sysUserRole.createMany.mockResolvedValue({ count: 1 });

      await service.create(makeCreateUserDto({ roleIds: ['2'] }));

      const { data } = prisma.sysUserRole.createMany.mock.calls[0]?.[0];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ userId: 1n, roleId: 2n });
    });

    it('角色非法时抛 20A04', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.sysUser.create.mockResolvedValue(makeUserRow());
      prisma.sysRole.findMany.mockResolvedValue([]);

      const error = await service
        .create(makeCreateUserDto({ roleIds: ['2'] }))
        .catch(e => e);
      expect(codeOf(error)).toBe('20A04');
    });

    it('唯一约束冲突映射为用户名冲突', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation(['tenant_id', 'username']));
      const error = await service.create(makeCreateUserDto()).catch(e => e);
      expect(codeOf(error)).toBe('20A02');
    });

    it('唯一约束冲突映射为邮箱冲突', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation(['tenant_id', 'email']));
      const error = await service.create(makeCreateUserDto()).catch(e => e);
      expect(codeOf(error)).toBe('20A03');
    });

    it('非唯一约束错误原样上抛', async () => {
      const boom = new Error('db down');
      prisma.sysUser.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(boom);
      const error = await service.create(makeCreateUserDto()).catch(e => e);
      expect(error).toBe(boom);
    });
  });

  describe('update', () => {
    it('用户不存在时抛 20A01', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      const error = await service.update(1n, new UpdateUserDto()).catch(e => e);
      expect(codeOf(error)).toBe('20A01');
    });

    it('新密码命中历史时抛 10A10 且不重新哈希', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(makeUserRow({ passwordHistory: ['old'] }));
      password.normalizeHistory.mockReturnValue(['old']);
      password.isReusedPassword.mockResolvedValue(true);
      const dto = new UpdateUserDto();
      dto.password = 'Passw0rd';

      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('10A10');
      expect(password.hash).not.toHaveBeenCalled();
    });

    it('改密成功更新哈希历史并强制下线', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(makeUserRow({ passwordHistory: ['old'] }));
      password.normalizeHistory.mockReturnValue(['old']);
      password.isReusedPassword.mockResolvedValue(false);
      password.hash.mockResolvedValue('new-hash');
      password.appendHistory.mockReturnValue(['new-hash', 'old']);
      prisma.sysUser.update.mockResolvedValue(makeUserRow());
      const dto = new UpdateUserDto();
      dto.password = 'Passw0rd';

      const detail = await service.update(1n, dto);

      expect(prisma.sysUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1n },
          data: expect.objectContaining({
            password: 'new-hash',
            passwordHistory: ['new-hash', 'old'],
          }),
        }),
      );
      expect(session.removeAllSessions).toHaveBeenCalledWith('1');
      expect(detail.id).toBe('1');
    });

    it('改用户名冲突时抛 20A02', async () => {
      prisma.sysUser.findFirst
        .mockResolvedValueOnce(makeUserRow({ username: 'alice' }))
        .mockResolvedValueOnce({ id: 9n });
      const dto = new UpdateUserDto();
      dto.username = 'bob';

      const error = await service.update(1n, dto).catch(e => e);
      expect(codeOf(error)).toBe('20A02');
    });
  });

  describe('remove', () => {
    it('用户不存在时抛 20A01', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(null);
      const error = await service.remove(5n).catch(e => e);
      expect(codeOf(error)).toBe('20A01');
    });

    it('删除当前登录账号时抛 20A05', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(makeUserRow({ id: 1n }));
      const error = await service.remove(1n).catch(e => e);
      expect(codeOf(error)).toBe('20A05');
    });

    it('非超管不得删除超管时抛 20A06', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(makeUserRow({ id: 5n, isSuper: true }));
      const error = await service.remove(5n).catch(e => e);
      expect(codeOf(error)).toBe('20A06');
    });

    it('删除成功：墓碑化用户名、清空邮箱、解绑角色并强制下线', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(
        makeUserRow({ id: 5n, username: 'b'.repeat(200) }),
      );
      prisma.sysUserRole.deleteMany.mockResolvedValue({ count: 1 });
      prisma.sysUser.update.mockResolvedValue(makeUserRow({ id: 5n }));

      await service.remove(5n);

      expect(prisma.sysUserRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 5n } });
      const { data } = prisma.sysUser.update.mock.calls[0]?.[0];
      expect(data.status).toBe(UserStatus.DISABLED);
      expect(data.email).toBeNull();
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.username).toContain('__deleted__5');
      expect((data.username as string).length).toBeLessThanOrEqual(100);
      expect(session.removeAllSessions).toHaveBeenCalledWith('5');
    });

    it('强制下线失败不影响删除结果', async () => {
      prisma.sysUser.findFirst.mockResolvedValue(makeUserRow({ id: 5n, username: 'bob' }));
      prisma.sysUserRole.deleteMany.mockResolvedValue({ count: 0 });
      prisma.sysUser.update.mockResolvedValue(makeUserRow({ id: 5n }));
      session.removeAllSessions.mockRejectedValue(new Error('redis down'));

      await expect(service.remove(5n)).resolves.toBeUndefined();
    });
  });
});
