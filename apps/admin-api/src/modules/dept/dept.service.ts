import type { CreateDeptDto, DeptResponseDto, QueryDeptDto, UpdateDeptDto } from './dto/index.js';
import { DeptStatus, Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { DataScopeService } from '@/shared/permission/data-scope.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { deptErrors } from './errors.js';

/** Prisma 部门查询结果的读取形状 */
interface DeptRow {
  id: bigint;
  parentId: bigint | null;
  deptName: string;
  leader: string | null;
  phone: string | null;
  path: string;
  sort: number;
  status: string;
  createdAt: Date;
}

/**
 * 部门管理（租户内）。
 *
 * 物化路径（见 ADR-008 D2）：
 * - `path` 形如 `/根id/.../自身id/`，用部门 ID 串起从根到自身的祖先链；
 * - 新增：path = 父.path + 自身id + '/'；根部门 path = '/自身id/'；
 * - 变更上级：在事务内级联重算整棵子树的 path（按旧前缀替换为新前缀）；
 * - 数据权限「本部门及以下」即用 `path LIKE '{主体部门path}%'` 前缀匹配。
 *
 * 租户隔离：一切查询/写入强制 `tenantId = 当前登录主体.tenantId`，传入 id 先按「本租户 + 未删除」校验。
 */
@Injectable()
export class DeptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  /** 部门树（按当前数据权限范围过滤后组装） */
  async tree(query: QueryDeptDto): Promise<DeptResponseDto[]> {
    const tenantId = this.currentTenantId();
    const scope = await this.dataScope.resolve();
    const where: Prisma.SysDeptWhereInput = {
      tenantId,
      deletedAt: null,
      ...this.dataScope.scopeDeptWhere(scope),
      ...(query.deptName ? { deptName: { contains: query.deptName } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const rows = await this.prisma.sysDept.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return this.buildTree(rows);
  }

  /** 创建部门 */
  async create(dto: CreateDeptDto): Promise<DeptResponseDto> {
    const tenantId = this.currentTenantId();
    const id = BigInt(generateSnowflakeId());
    const idStr = id.toString();

    const parentId = dto.parentId ? BigInt(dto.parentId) : null;
    const parent = parentId ? await this.requireParent(tenantId, parentId) : null;
    const path = parent ? `${parent.path}${idStr}/` : `/${idStr}/`;

    const created = await this.prisma.sysDept.create({
      data: {
        id,
        tenantId,
        parentId,
        deptName: dto.deptName,
        leader: dto.leader ?? null,
        phone: dto.phone ?? null,
        path,
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        status: dto.status ?? DeptStatus.ACTIVE,
      },
    });
    return this.toResponse(created);
  }

  /** 更新部门（上级变更时级联重算子树物化路径） */
  async update(id: bigint, dto: UpdateDeptDto): Promise<DeptResponseDto> {
    const tenantId = this.currentTenantId();
    const dept = await this.findOwned(tenantId, id);

    const requestedParentId = dto.parentId === undefined
      ? undefined
      : (dto.parentId ? BigInt(dto.parentId) : null);
    const parentChanged = requestedParentId !== undefined && requestedParentId !== dept.parentId;

    let newParentPath: string | null = null;
    if (parentChanged && requestedParentId !== null) {
      newParentPath = (await this.requireParent(tenantId, requestedParentId)).path;
      // 新上级若位于自身子树内（新上级 path 以自身 path 为前缀），会形成环，拒绝
      if (newParentPath.startsWith(dept.path))
        throw deptErrors.cycle();
    }

    const data: Prisma.SysDeptUpdateInput = {
      ...(dto.deptName !== undefined ? { deptName: dto.deptName } : {}),
      ...(dto.leader !== undefined ? { leader: dto.leader } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (parentChanged) {
        const newPath = newParentPath
          ? `${newParentPath}${dept.id.toString()}/`
          : `/${dept.id.toString()}/`;

        const subtree = await tx.sysDept.findMany({
          where: { tenantId, deletedAt: null, path: { startsWith: dept.path } },
          select: { id: true, path: true },
        });
        for (const node of subtree) {
          const targetPath = node.id === dept.id
            ? newPath
            : `${newPath}${node.path.slice(dept.path.length)}`;
          if (targetPath !== node.path)
            await tx.sysDept.update({ where: { id: node.id }, data: { path: targetPath } });
        }
        data.parentId = requestedParentId ?? null;
      }
      return tx.sysDept.update({ where: { id: dept.id }, data });
    });

    return this.toResponse(updated);
  }

  /** 软删除部门（存在下级部门或在用用户时拒绝） */
  async remove(id: bigint): Promise<void> {
    const tenantId = this.currentTenantId();
    const dept = await this.findOwned(tenantId, id);

    const [childCount, userCount] = await Promise.all([
      this.prisma.sysDept.count({ where: { tenantId, parentId: dept.id, deletedAt: null } }),
      this.prisma.sysUser.count({ where: { tenantId, deptId: dept.id, deletedAt: null } }),
    ]);
    if (childCount > 0)
      throw deptErrors.hasChildren();
    if (userCount > 0)
      throw deptErrors.inUse();

    await this.prisma.sysDept.update({
      where: { id: dept.id },
      data: { deletedAt: new Date(), status: DeptStatus.DISABLED },
    });
  }

  /** 当前登录主体所属租户 */
  private currentTenantId(): bigint {
    return BigInt(this.requestContext.requireUser().tenantId);
  }

  /** 按「本租户 + 未删除」取部门，不存在即 404（跨租户访问表现为不存在） */
  private async findOwned(tenantId: bigint, id: bigint): Promise<DeptRow> {
    const dept = await this.prisma.sysDept.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!dept)
      throw deptErrors.notFound();
    return dept;
  }

  /** 校验上级部门存在且属于本租户 */
  private async requireParent(tenantId: bigint, parentId: bigint): Promise<DeptRow> {
    const parent = await this.prisma.sysDept.findFirst({
      where: { id: parentId, tenantId, deletedAt: null },
    });
    if (!parent)
      throw deptErrors.parentInvalid();
    return parent;
  }

  /** 由平铺部门行组装树（父不在结果集中时视为根，兼容数据权限过滤后的子树） */
  private buildTree(rows: DeptRow[]): DeptResponseDto[] {
    const nodes = new Map<string, DeptResponseDto>();
    for (const row of rows)
      nodes.set(row.id.toString(), this.toResponse(row));

    const roots: DeptResponseDto[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id.toString());
      if (!node)
        continue;
      const parent = row.parentId ? nodes.get(row.parentId.toString()) : undefined;
      if (parent)
        parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private toResponse(dept: DeptRow): DeptResponseDto {
    return {
      id: dept.id.toString(),
      parentId: dept.parentId ? dept.parentId.toString() : null,
      deptName: dept.deptName,
      leader: dept.leader,
      phone: dept.phone,
      path: dept.path,
      sort: dept.sort,
      status: dept.status,
      createdAt: dept.createdAt.toISOString(),
      children: [],
    };
  }
}
