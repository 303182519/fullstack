import type { CreateRoleDto, QueryRoleDto, RoleMenusDto, RoleResponseDto, UpdateRoleDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { Prisma, RoleStatus } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { MenuService } from '@/modules/menu/menu.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { roleErrors } from './errors.js';

/** Prisma 角色查询结果的读取形状 */
interface RoleRow {
  id: bigint;
  roleName: string;
  roleCode: string;
  description: string | null;
  dataScope: string;
  status: string;
  isSystem: boolean;
  createdAt: Date;
}

/**
 * 角色管理（租户内）与角色菜单授权。
 *
 * 租户隔离：与用户模块同口径，一切查询/写入强制 `tenantId = 当前登录主体.tenantId`，
 * 传入 id 先按「本租户 + 未删除」校验，跨租户访问表现为 404。
 *
 * 软删除与唯一约束：`(tenant_id, role_code)` 为 DB 唯一索引，删除时把 roleCode 墓碑化
 * （`原码__deleted__<id>`，裁剪到列宽 50）以释放编码占用；被用户引用的角色禁止删除（IN_USE）。
 *
 * 菜单授权：仅允许授予「当前租户套餐许可范围内」的平台菜单（见 MenuService），
 * 采用全量替换语义，事务内删旧插新（见 ADR-008 D1/D3）。
 */
@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly menuService: MenuService,
  ) {}

  /** 分页查询本租户角色 */
  async list(query: QueryRoleDto): Promise<PaginatedResult<RoleResponseDto>> {
    const tenantId = this.currentTenantId();
    const where: Prisma.SysRoleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.roleName ? { roleName: { contains: query.roleName } } : {}),
      ...(query.roleCode ? { roleCode: { contains: query.roleCode } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysRole.findMany({
        where,
        // id 作第二排序键：createdAt 并列时顺序才唯一，避免翻页出现重复/漏行
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysRole.count({ where }),
    ]);

    return {
      items: rows.map(row => this.toResponse(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 角色详情（本租户） */
  async detail(id: bigint): Promise<RoleResponseDto> {
    const tenantId = this.currentTenantId();
    const role = await this.prisma.sysRole.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!role)
      throw roleErrors.notFound();
    return this.toResponse(role);
  }

  /** 创建角色 */
  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const tenantId = this.currentTenantId();
    await this.assertCodeAvailable(tenantId, dto.roleCode);

    try {
      const created = await this.prisma.sysRole.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId,
          roleName: dto.roleName,
          roleCode: dto.roleCode,
          description: dto.description ?? null,
          ...(dto.dataScope ? { dataScope: dto.dataScope } : {}),
          status: dto.status ?? RoleStatus.ACTIVE,
          // isSystem 不开放给客户端，恒为 false（系统内置角色由初始化数据播种）
          isSystem: false,
        },
      });
      return this.toResponse(created);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 更新角色（系统内置角色禁止改码） */
  async update(id: bigint, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const tenantId = this.currentTenantId();
    const existing = await this.prisma.sysRole.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing)
      throw roleErrors.notFound();

    if (
      dto.roleCode !== undefined
      && dto.roleCode !== existing.roleCode
    ) {
      if (existing.isSystem)
        throw roleErrors.systemImmutable('系统内置角色不允许修改角色编码');
      await this.assertCodeAvailable(tenantId, dto.roleCode);
    }

    const data: Prisma.SysRoleUpdateInput = {
      ...(dto.roleName !== undefined ? { roleName: dto.roleName } : {}),
      ...(dto.roleCode !== undefined ? { roleCode: dto.roleCode } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.dataScope !== undefined ? { dataScope: dto.dataScope } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    try {
      const updated = await this.prisma.sysRole.update({
        where: { id: existing.id },
        data,
      });
      return this.toResponse(updated);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 软删除角色（被用户引用或系统内置角色禁止删除） */
  async remove(id: bigint): Promise<void> {
    const tenantId = this.currentTenantId();
    const role = await this.prisma.sysRole.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!role)
      throw roleErrors.notFound();
    if (role.isSystem)
      throw roleErrors.systemImmutable('系统内置角色不允许删除');

    const bound = await this.prisma.sysUserRole.count({ where: { roleId: role.id } });
    if (bound > 0)
      throw roleErrors.inUse();

    await this.prisma.sysRole.update({
      where: { id: role.id },
      data: {
        deletedAt: new Date(),
        status: RoleStatus.DISABLED,
        roleCode: this.tombstoneCode(role.roleCode, role.id),
      },
    });
  }

  /** 查询角色已授权的菜单 ID 集合（本租户） */
  async listMenus(roleId: bigint): Promise<RoleMenusDto> {
    const tenantId = this.currentTenantId();
    await this.requireOwnedRole(roleId, tenantId);

    const rows = await this.prisma.sysRoleMenu.findMany({
      where: { roleId },
      select: { menuId: true },
    });
    return { menuIds: rows.map(row => row.menuId.toString()) };
  }

  /**
   * 授权角色菜单（全量替换）。
   *
   * 校验：目标角色属本租户且未删除；每个菜单 ID 必须落在当前租户的可用菜单范围内
   * （未绑套餐=平台全部启用菜单，已绑套餐=套餐许可集合），防止越权授予未开通功能。
   * 写入：事务内删旧插新，避免并发下出现「旧授权与新授权并存」的中间态。
   */
  async authorizeMenus(roleId: bigint, dto: RoleMenusDto): Promise<RoleMenusDto> {
    const tenantId = this.currentTenantId();
    await this.requireOwnedRole(roleId, tenantId);

    const menuIds = [...new Set(dto.menuIds)];
    if (menuIds.length > 0) {
      const licensed = await this.menuService.resolveLicensedMenuIds(tenantId);
      const notLicensed = menuIds.filter(menuId => !licensed.has(menuId));
      if (notLicensed.length > 0)
        throw roleErrors.menuNotLicensed();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sysRoleMenu.deleteMany({ where: { roleId } });
      if (menuIds.length > 0) {
        await tx.sysRoleMenu.createMany({
          data: menuIds.map(menuId => ({
            id: BigInt(generateSnowflakeId()),
            roleId,
            menuId: BigInt(menuId),
          })),
        });
      }
    });

    return { menuIds };
  }

  /** 取本租户未删除角色，不存在即 404（授权/查询前的前置校验） */
  private async requireOwnedRole(id: bigint, tenantId: bigint): Promise<RoleRow> {
    const role = await this.prisma.sysRole.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!role)
      throw roleErrors.notFound();
    return role;
  }

  /** 当前登录主体所属租户（字符串雪花 ID -> bigint） */
  private currentTenantId(): bigint {
    return BigInt(this.requestContext.requireUser().tenantId);
  }

  /** 校验角色编码在本租户内未被占用 */
  private async assertCodeAvailable(tenantId: bigint, roleCode: string): Promise<void> {
    const existing = await this.prisma.sysRole.findFirst({
      where: { tenantId, roleCode, deletedAt: null },
      select: { id: true },
    });
    if (existing)
      throw roleErrors.codeExists();
  }

  /** 唯一约束冲突（并发下预检失效）转成业务冲突错误；其它错误原样上抛 */
  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return roleErrors.codeExists();
    }
    return error;
  }

  /** 墓碑角色编码：释放原编码占用，同时不超列宽（VarChar(50)） */
  private tombstoneCode(roleCode: string, id: bigint): string {
    const suffix = `__deleted__${id.toString()}`;
    const keep = Math.max(0, 50 - suffix.length);
    return `${roleCode.slice(0, keep)}${suffix}`;
  }

  private toResponse(role: RoleRow): RoleResponseDto {
    return {
      id: role.id.toString(),
      roleName: role.roleName,
      roleCode: role.roleCode,
      description: role.description,
      dataScope: role.dataScope,
      status: role.status,
      isSystem: role.isSystem,
      createdAt: role.createdAt.toISOString(),
    };
  }
}
