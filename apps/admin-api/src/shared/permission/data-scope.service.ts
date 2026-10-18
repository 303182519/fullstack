import { DataScope, Prisma, RoleStatus } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';

/**
 * 已解析的数据权限范围（见 ADR-008 D2）。
 * - `ALL`：不限制数据范围；
 * - `DEPT_AND_CHILD`：仅本部门及以下（依据部门物化路径前缀匹配）；`deptPath` 为 null 表示主体未分配部门。
 */
export type ResolvedDataScope
  = | { type: 'ALL' }
    | { type: 'DEPT_AND_CHILD'; deptPath: string | null };

/**
 * 数据权限解析与应用（部门维度的行级过滤）。
 *
 * 机制（ADR-008 D2/D3 的落地实现）：本服务在 Service 层**显式**解析并生成 where 片段，
 * 由各受控查询显式并入自身条件。之所以不做「装饰器自动注入」：Prisma 7 已移除 query middleware，
 * 无法在 ORM 层透明改写任意查询的 where；显式调用比依赖反射注入更可读、可测、可审。
 *
 * 口径：角色 dataScope 取「最宽」——任一角色为 ALL 即 ALL，否则 DEPT_AND_CHILD。
 * 未分配部门的主体在 DEPT_AND_CHILD 下只能看到「本租户内未分配部门的数据」（部门树则不可见任何部门），
 * 不会因缺部门而放大可见范围。
 */
@Injectable()
export class DataScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * 回答一个问题：当前登录的人最多能看多少数据？
   *
   * 判断顺序（从宽到严，多角色取最宽口径）：
   * 1. 超管 → 全部数据（ALL），直接放行；
   * 2. 普通用户把自己「启用中」的角色翻一遍——只要有一个角色配了
   *    「全部数据」，就放行为 ALL；
   * 3. 都不是 → 只能看「本部门及以下」：查出用户挂在哪个部门，拿到该
   *    部门的物化路径（path），调用方后续用它做前缀匹配圈定范围。
   *    用户没挂部门时 deptPath 为 null，调用方会收敛为
   *    「只看未分配部门的数据」，不会因缺部门而放大可见范围。
   */
  async resolve(): Promise<ResolvedDataScope> {
    const principal = this.requestContext.requireUser();
    if (principal.isSuper)
      return { type: 'ALL' };

    const tenantId = BigInt(principal.tenantId);
    const userId = BigInt(principal.userId);

    const roles = await this.prisma.sysRole.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: RoleStatus.ACTIVE,
        userRoles: { some: { userId } },
      },
      select: { dataScope: true },
    });
    if (roles.some(role => role.dataScope === DataScope.ALL))
      return { type: 'ALL' };

    /*
     * 下面这个 Prisma 查询等价于「用户表 LEFT JOIN 部门表，取部门路径」：
     *
     *   SELECT d.path
     *   FROM sys_user u
     *   LEFT JOIN sys_dept d ON u.dept_id = d.id
     *   WHERE u.id = ? AND u.tenant_id = ? AND u.deleted_at IS NULL
     *   LIMIT 1;
     *
     * 用 LEFT JOIN（Prisma 的可选关联 dept）是因为用户可能没挂部门：
     * 此时查出来的 d.path 是 null，对应 return 处的 `?? null`。
     */
    const user = await this.prisma.sysUser.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { dept: { select: { path: true } } },
    });
    return { type: 'DEPT_AND_CHILD', deptPath: user?.dept?.path ?? null };
  }

  /** 按数据权限生成用户表 where 片段（供用户列表 / 查询并入）。 */
  scopeUserWhere(scope: ResolvedDataScope): Prisma.SysUserWhereInput {
    if (scope.type === 'ALL')
      return {};
    if (!scope.deptPath)
      return { deptId: null };
    return { dept: { path: { startsWith: scope.deptPath } } };
  }

  /** 按数据权限生成部门表 where 片段（供部门树并入）。 */
  scopeDeptWhere(scope: ResolvedDataScope): Prisma.SysDeptWhereInput {
    if (scope.type === 'ALL')
      return {};
    if (!scope.deptPath)
      return { id: { in: [] } };
    return { path: { startsWith: scope.deptPath } };
  }
}
