import type { CreateMenuDto, MenuResponseDto, QueryMenuDto, UpdateMenuDto } from './dto/index.js';
import { MenuStatus, MenuType, Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { menuErrors } from './errors.js';

/** Prisma 菜单查询结果的读取形状 */
interface MenuRow {
  id: bigint;
  parentId: bigint | null;
  menuType: string;
  menuName: string;
  routeName: string | null;
  routePath: string | null;
  component: string | null;
  permCode: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  status: string;
  createdAt: Date;
}

/**
 * 菜单管理（平台级为主，见 ADR-008 D1/D4）。
 *
 * - P1 菜单均为**平台级**（`tenantId = null`），由平台超级管理员（SuperAdminGuard）维护；
 *   租户级菜单作为后续扩展，故本模块的增改删一律以 `tenantId = null` 作用域。
 * - 租户侧只读「可用菜单」：`tenant.packageId` 为空时视为平台全部启用菜单可用；
 *   绑定套餐后按套餐许可集合收敛（见 resolveLicensedMenuIds）。
 * - 三级结构：目录 / 菜单 / 按钮；按钮级 `permCode` 是功能权限的授权主体（PermissionService 消费）。
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  /** 平台全量菜单树（超管视图） */
  async platformTree(query: QueryMenuDto): Promise<MenuResponseDto[]> {
    const where: Prisma.SysMenuWhereInput = {
      tenantId: null,
      deletedAt: null,
      ...(query.menuName ? { menuName: { contains: query.menuName } } : {}),
      ...(query.menuType ? { menuType: query.menuType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.sysMenu.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return this.buildTree(rows);
  }

  /** 当前租户可用菜单树（租户视图；按其套餐许可集合收敛） */
  async availableTree(): Promise<MenuResponseDto[]> {
    const tenantId = BigInt(this.requestContext.requireUser().tenantId);
    const packageId = await this.currentPackageId(tenantId);

    const where: Prisma.SysMenuWhereInput = {
      tenantId: null,
      deletedAt: null,
      status: MenuStatus.ACTIVE,
    };
    if (packageId)
      where.packageMenus = { some: { packageId } };

    const rows = await this.prisma.sysMenu.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return this.buildTree(rows);
  }

  /**
   * 解析某租户被许可的菜单 ID 集合（角色授权时校验用）。
   * 未绑定套餐 → 平台全部启用菜单；已绑定 → 该套餐绑定的平台菜单。
   */
  async resolveLicensedMenuIds(tenantId: bigint): Promise<Set<string>> {
    const packageId = await this.currentPackageId(tenantId);

    const where: Prisma.SysMenuWhereInput = {
      tenantId: null,
      deletedAt: null,
      status: MenuStatus.ACTIVE,
    };
    if (packageId)
      where.packageMenus = { some: { packageId } };

    const menus = await this.prisma.sysMenu.findMany({
      where,
      select: { id: true },
    });
    return new Set(menus.map(menu => menu.id.toString()));
  }

  /** 创建菜单（平台级） */
  async create(dto: CreateMenuDto): Promise<MenuResponseDto> {
    if (dto.menuType === MenuType.BUTTON && !dto.permCode)
      throw menuErrors.permCodeRequired();
    if (dto.permCode)
      await this.assertPermCodeAvailable(dto.permCode);

    const parentId = dto.parentId ? BigInt(dto.parentId) : null;
    if (parentId)
      await this.requireParent(parentId);

    const created = await this.prisma.sysMenu.create({
      data: {
        id: BigInt(generateSnowflakeId()),
        tenantId: null,
        parentId,
        menuType: dto.menuType,
        menuName: dto.menuName,
        routeName: dto.routeName ?? null,
        routePath: dto.routePath ?? null,
        component: dto.component ?? null,
        permCode: dto.permCode ?? null,
        icon: dto.icon ?? null,
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
        status: dto.status ?? MenuStatus.ACTIVE,
      },
    });
    return this.toResponse(created);
  }

  /** 更新菜单（平台级） */
  async update(id: bigint, dto: UpdateMenuDto): Promise<MenuResponseDto> {
    const menu = await this.findPlatform(id);

    if (dto.permCode !== undefined && dto.permCode !== menu.permCode) {
      if (dto.permCode)
        await this.assertPermCodeAvailable(dto.permCode, id);
    }

    const nextType = dto.menuType ?? menu.menuType;
    const nextPermCode = dto.permCode === undefined ? menu.permCode : dto.permCode;
    if (nextType === MenuType.BUTTON && !nextPermCode)
      throw menuErrors.permCodeRequired();

    if (dto.parentId !== undefined) {
      const parentId = dto.parentId ? BigInt(dto.parentId) : null;
      if (parentId) {
        const parent = await this.requireParent(parentId);
        if (parent.id === menu.id)
          throw menuErrors.parentInvalid('上级菜单不能是自身');
        if (parent.menuType === MenuType.BUTTON)
          throw menuErrors.parentInvalid('按钮不能作为上级菜单');
      }
    }

    if (nextType === MenuType.BUTTON && menu.menuType !== MenuType.BUTTON) {
      const childCount = await this.prisma.sysMenu.count({
        where: { parentId: menu.id, deletedAt: null },
      });
      if (childCount > 0)
        throw menuErrors.hasChildren('该菜单存在子菜单，不能改为按钮类型');
    }

    const data: Prisma.SysMenuUpdateInput = {
      ...(dto.parentId !== undefined ? { parentId: dto.parentId ? BigInt(dto.parentId) : null } : {}),
      ...(dto.menuType !== undefined ? { menuType: dto.menuType } : {}),
      ...(dto.menuName !== undefined ? { menuName: dto.menuName } : {}),
      ...(dto.routeName !== undefined ? { routeName: dto.routeName } : {}),
      ...(dto.routePath !== undefined ? { routePath: dto.routePath } : {}),
      ...(dto.component !== undefined ? { component: dto.component } : {}),
      ...(dto.permCode !== undefined ? { permCode: dto.permCode } : {}),
      ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    const updated = await this.prisma.sysMenu.update({ where: { id: menu.id }, data });
    return this.toResponse(updated);
  }

  /** 软删除菜单（存在子菜单或被角色/套餐引用时拒绝） */
  async remove(id: bigint): Promise<void> {
    const menu = await this.findPlatform(id);

    const [childCount, roleBound, packageBound] = await Promise.all([
      this.prisma.sysMenu.count({ where: { parentId: menu.id, deletedAt: null } }),
      this.prisma.sysRoleMenu.count({ where: { menuId: menu.id } }),
      this.prisma.sysTenantPackageMenu.count({ where: { menuId: menu.id } }),
    ]);
    if (childCount > 0)
      throw menuErrors.hasChildren();
    if (roleBound > 0 || packageBound > 0)
      throw menuErrors.inUse();

    await this.prisma.sysMenu.update({
      where: { id: menu.id },
      data: { deletedAt: new Date(), status: MenuStatus.DISABLED },
    });
  }

  /** 当前租户绑定的套餐 ID（无 / 租户不存在则返回 null） */
  private async currentPackageId(tenantId: bigint): Promise<bigint | null> {
    const tenant = await this.prisma.sysTenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { packageId: true },
    });
    return tenant?.packageId ?? null;
  }

  /** 按「平台级 + 未删除」取菜单，不存在即 404 */
  private async findPlatform(id: bigint): Promise<MenuRow> {
    const menu = await this.prisma.sysMenu.findFirst({
      where: { id, tenantId: null, deletedAt: null },
    });
    if (!menu)
      throw menuErrors.notFound();
    return menu;
  }

  /** 校验上级菜单存在且属于平台级 */
  private async requireParent(parentId: bigint): Promise<MenuRow> {
    const parent = await this.prisma.sysMenu.findFirst({
      where: { id: parentId, tenantId: null, deletedAt: null },
    });
    if (!parent)
      throw menuErrors.parentInvalid();
    return parent;
  }

  /** 校验权限编码在平台级菜单内唯一（excludeId 用于更新时排除自身） */
  private async assertPermCodeAvailable(permCode: string, excludeId?: bigint): Promise<void> {
    const existing = await this.prisma.sysMenu.findFirst({
      where: {
        tenantId: null,
        permCode,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw menuErrors.permCodeExists();
  }

  /** 由平铺菜单行组装树（父不在结果集中时视为根） */
  private buildTree(rows: MenuRow[]): MenuResponseDto[] {
    const nodes = new Map<string, MenuResponseDto>();
    for (const row of rows)
      nodes.set(row.id.toString(), this.toResponse(row));

    const roots: MenuResponseDto[] = [];
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

  private toResponse(menu: MenuRow): MenuResponseDto {
    return {
      id: menu.id.toString(),
      parentId: menu.parentId ? menu.parentId.toString() : null,
      menuType: menu.menuType,
      menuName: menu.menuName,
      routeName: menu.routeName,
      routePath: menu.routePath,
      component: menu.component,
      permCode: menu.permCode,
      icon: menu.icon,
      sort: menu.sort,
      visible: menu.visible,
      status: menu.status,
      createdAt: menu.createdAt.toISOString(),
      children: [],
    };
  }
}
