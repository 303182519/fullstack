import type { CreateUserDto, QueryUserDto, UpdateUserDto, UserDetailDto, UserListItemDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { RoleBriefDto } from '@/modules/auth/dto/auth-response.dto.js';
import type { ResolvedDataScope } from '@/shared/permission/data-scope.service.js';
import { Prisma, UserStatus } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { authErrors } from '@/shared/auth/auth.errors.js';
import { PasswordService } from '@/shared/auth/password.service.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { DataScopeService } from '@/shared/permission/data-scope.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { userErrors } from './errors.js';

/** 统一 include：连带角色摘要一次查出，避免列表 N+1 */
const USER_INCLUDE = {
  userRoles: {
    include: {
      role: {
        select: {
          id: true,
          roleName: true,
          roleCode: true,
          dataScope: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.SysUserInclude;

/** Prisma 用户查询结果的读取形状（只取映射需要的字段） */
interface UserWithRoles {
  id: bigint;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  gender: string | null;
  remark: string | null;
  status: string;
  isSuper: boolean;
  deptId: bigint | null;
  createdAt: Date;
  userRoles: Array<{
    role: {
      id: bigint;
      roleName: string;
      roleCode: string;
      dataScope: string;
      deletedAt: Date | null;
    };
  }>;
}

/**
 * 用户管理（租户内）。
 *
 * 租户隔离：所有查询强制带 `tenantId = 当前登录主体.tenantId`，
 * 请求体传入的 id 一律先按「本租户 + 未删除」校验存在性，跨租户访问表现为 404。
 *
 * 软删除与唯一约束的配合（关键设计）：
 *   (tenant_id, username) 是 DB 唯一索引，而软删除行仍在表内，会永久占用该用户名。
 *   因此删除时把 username 改写为墓碑值（`原名__deleted__<id>`，长度裁剪到列宽 100 内）、
 *   并清空 email（email 列可空，MySQL 唯一索引允许多个 NULL）——从而释放原用户名与邮箱。
 *   历史审计价值保留在行内（id / 创建时间 / 角色流水仍在）。
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly session: SessionService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  /** 分页查询本租户用户（按数据权限过滤） */
  async list(query: QueryUserDto): Promise<PaginatedResult<UserListItemDto>> {
    const tenantId = this.currentTenantId();
    const scope = await this.dataScope.resolve();
    const where: Prisma.SysUserWhereInput = {
      tenantId,
      deletedAt: null,
      ...this.dataScope.scopeUserWhere(scope),
      ...(query.username ? { username: { contains: query.username } } : {}),
      ...(query.nickname ? { nickname: { contains: query.nickname } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysUser.findMany({
        where,
        include: USER_INCLUDE,
        // id 作第二排序键：createdAt 并列时顺序才唯一，避免翻页出现重复/漏行
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysUser.count({ where }),
    ]);

    return {
      items: rows.map(row => this.toListItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 用户详情（本租户，按数据权限过滤） */
  async detail(id: bigint): Promise<UserDetailDto> {
    const tenantId = this.currentTenantId();
    const scope = await this.dataScope.resolve();
    const user = await this.prisma.sysUser.findFirst({
      where: { id, tenantId, deletedAt: null, ...this.dataScope.scopeUserWhere(scope) },
      include: USER_INCLUDE,
    });
    if (!user)
      throw userErrors.notFound();
    return this.toDetail(user);
  }

  /** 创建用户（含角色绑定） */
  async create(dto: CreateUserDto): Promise<UserDetailDto> {
    const tenantId = this.currentTenantId();
    await this.assertUsernameAvailable(tenantId, dto.username);
    if (dto.email)
      await this.assertEmailAvailable(tenantId, dto.email);
    if (dto.deptId) {
      // 指定部门时才按需解析数据权限（update 路径在方法开头已解析），校验目标部门须在当前主体可见范围内
      const scope = await this.dataScope.resolve();
      await this.assertDeptAssignable(tenantId, dto.deptId, scope);
    }

    const passwordHash = await this.password.hash(dto.password);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.sysUser.create({
          data: {
            id: BigInt(generateSnowflakeId()),
            tenantId,
            username: dto.username,
            password: passwordHash,
            // 历史密码以「当前哈希」起算：改密时可直接比对，避免首次改密可立即改回原密码
            passwordHistory: [passwordHash],
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            nickname: dto.nickname ?? null,
            avatar: dto.avatar ?? null,
            gender: dto.gender ?? null,
            remark: dto.remark ?? null,
            status: dto.status ?? UserStatus.ACTIVE,
            deptId: dto.deptId ? BigInt(dto.deptId) : null,
          },
          include: USER_INCLUDE,
        });
        await this.syncRoles(tx, user.id, tenantId, dto.roleIds);
        return user;
      });

      return this.toDetail(created);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 更新用户（含改密与角色重绑定；按数据权限过滤） */
  async update(id: bigint, dto: UpdateUserDto): Promise<UserDetailDto> {
    const tenantId = this.currentTenantId();
    const scope = await this.dataScope.resolve();
    const existing = await this.prisma.sysUser.findFirst({
      where: { id, tenantId, deletedAt: null, ...this.dataScope.scopeUserWhere(scope) },
    });
    if (!existing)
      throw userErrors.notFound();

    if (dto.username && dto.username !== existing.username)
      await this.assertUsernameAvailable(tenantId, dto.username);
    if (dto.email && dto.email !== existing.email)
      await this.assertEmailAvailable(tenantId, dto.email);
    if (dto.deptId !== undefined && dto.deptId !== null)
      await this.assertDeptAssignable(tenantId, dto.deptId, scope);

    const data: Prisma.SysUserUpdateInput = {
      ...(dto.username !== undefined ? { username: dto.username } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
      ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.deptId !== undefined ? { deptId: dto.deptId ? BigInt(dto.deptId) : null } : {}),
    };

    let passwordChanged = false;
    if (dto.password) {
      const history = this.password.normalizeHistory(existing.passwordHistory);
      if (await this.password.isReusedPassword(dto.password, history)) {
        throw authErrors.passwordReuse();
      }
      const newHash = await this.password.hash(dto.password);
      data.password = newHash;
      data.passwordHistory = this.password.appendHistory(newHash, history);
      passwordChanged = true;
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.sysUser.update({
          where: { id: existing.id },
          data,
          include: USER_INCLUDE,
        });
        await this.syncRoles(tx, existing.id, tenantId, dto.roleIds);
        return saved;
      });

      if (passwordChanged)
        await this.revokeAllSessions(existing.id);

      return this.toDetail(updated);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 软删除用户（墓碑化唯一字段 + 强制下线 + 解除角色绑定；按数据权限过滤） */
  async remove(id: bigint): Promise<void> {
    const principal = this.requestContext.requireUser();
    const tenantId = this.currentTenantId();
    const scope = await this.dataScope.resolve();

    const user = await this.prisma.sysUser.findFirst({
      where: { id, tenantId, deletedAt: null, ...this.dataScope.scopeUserWhere(scope) },
    });
    if (!user)
      throw userErrors.notFound();
    if (user.id === BigInt(principal.userId))
      throw userErrors.deleteSelf();
    if (user.isSuper && !principal.isSuper)
      throw userErrors.forbidden();

    await this.prisma.$transaction(async (tx) => {
      await tx.sysUserRole.deleteMany({ where: { userId: user.id } });
      await tx.sysUser.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          status: UserStatus.DISABLED,
          username: this.tombstoneUsername(user.username, user.id),
          email: null,
        },
      });
    });

    // 强制下线：删除已提交后再尽力清理会话，Redis 故障不影响「用户已删除」这一既成事实
    await this.revokeAllSessions(user.id);
  }

  /** 当前登录主体所属租户（字符串雪花 ID -> bigint） */
  private currentTenantId(): bigint {
    return BigInt(this.requestContext.requireUser().tenantId);
  }

  private async assertUsernameAvailable(tenantId: bigint, username: string): Promise<void> {
    const existing = await this.prisma.sysUser.findFirst({
      where: { tenantId, username, deletedAt: null },
      select: { id: true },
    });
    if (existing)
      throw userErrors.usernameExists();
  }

  private async assertEmailAvailable(tenantId: bigint, email: string): Promise<void> {
    const existing = await this.prisma.sysUser.findFirst({
      where: { tenantId, email, deletedAt: null },
      select: { id: true },
    });
    if (existing)
      throw userErrors.emailExists();
  }

  /**
   * 校验目标部门可分配：须属本租户、未删除，且在当前主体的数据权限范围内。
   * 数据权限为 ALL 时不额外限制；为「本部门及以下」时仅允许本部门子树内的部门。
   */
  private async assertDeptAssignable(
    tenantId: bigint,
    deptId: string,
    scope: ResolvedDataScope,
  ): Promise<void> {
    const dept = await this.prisma.sysDept.findFirst({
      where: {
        id: BigInt(deptId),
        tenantId,
        deletedAt: null,
        ...this.dataScope.scopeDeptWhere(scope),
      },
      select: { id: true },
    });
    if (!dept)
      throw userErrors.invalidDept();
  }

  /** 角色重绑定：先删旧关联再插新（事务内）。roleIds 省略时不动现有绑定。 */
  private async syncRoles(
    tx: Prisma.TransactionClient,
    userId: bigint,
    tenantId: bigint,
    roleIds: string[] | undefined,
  ): Promise<void> {
    if (roleIds === undefined)
      return;

    const uniqueIds = [...new Set(roleIds)].map(raw => BigInt(raw));
    if (uniqueIds.length === 0) {
      await tx.sysUserRole.deleteMany({ where: { userId } });
      return;
    }

    const roles = await tx.sysRole.findMany({
      where: { id: { in: uniqueIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (roles.length !== uniqueIds.length)
      throw userErrors.invalidRole();

    await tx.sysUserRole.deleteMany({ where: { userId } });
    await tx.sysUserRole.createMany({
      data: roles.map(role => ({
        id: BigInt(generateSnowflakeId()),
        userId,
        roleId: role.id,
      })),
    });
  }

  /** 唯一约束冲突（并发下预检失效）转成业务冲突错误；其它错误原样上抛 */
  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta.target as string[]).join(',')
        : String(error.meta?.target ?? '');
      if (target.includes('email'))
        return userErrors.emailExists();
      return userErrors.usernameExists();
    }
    return error;
  }

  /** 尽力强制下线：Redis 故障仅告警，不影响已提交的主流程 */
  private async revokeAllSessions(userId: bigint): Promise<void> {
    try {
      await this.session.removeAllSessions(userId.toString());
    }
    catch (err) {
      this.logger.warn(
        `强制下线失败（会话稍后自然过期）userId=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 墓碑用户名：释放原用户名占用，同时不超列宽（VarChar(100)） */
  private tombstoneUsername(username: string, id: bigint): string {
    const suffix = `__deleted__${id.toString()}`;
    const keep = Math.max(0, 100 - suffix.length);
    return `${username.slice(0, keep)}${suffix}`;
  }

  private toRoles(user: UserWithRoles): RoleBriefDto[] {
    return user.userRoles
      .filter(userRole => userRole.role.deletedAt === null)
      .map(userRole => ({
        id: userRole.role.id.toString(),
        roleName: userRole.role.roleName,
        roleCode: userRole.role.roleCode,
        dataScope: userRole.role.dataScope,
      }));
  }

  private toListItem(user: UserWithRoles): UserListItemDto {
    return {
      id: user.id.toString(),
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      isSuper: user.isSuper,
      deptId: user.deptId ? user.deptId.toString() : null,
      createdAt: user.createdAt.toISOString(),
      roles: this.toRoles(user),
    };
  }

  private toDetail(user: UserWithRoles): UserDetailDto {
    const roles = this.toRoles(user);
    return {
      ...this.toListItem(user),
      gender: user.gender,
      remark: user.remark,
      roles,
      roleIds: roles.map(role => role.id),
    };
  }
}
