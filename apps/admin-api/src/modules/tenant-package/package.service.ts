import type { CreatePackageDto, PackageMenusDto, PackageResponseDto, QueryPackageDto, UpdatePackageDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { MenuStatus, PackageStatus, Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import {
  badRequest,
  conflict,
  notFound,
} from '@/common/exceptions/business.exception.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';

/** 套餐模块业务错误码（MMSNN 规范；70 = 套餐模块） */
const PACKAGE_BIZ = {
  NOT_FOUND: '70A01',
  CODE_EXISTS: '70A02',
  IN_USE: '70A03',
  MENU_INVALID: '70A04',
} as const;

/** Prisma 套餐查询结果的读取形状 */
interface PackageRow {
  id: bigint;
  packageName: string;
  packageCode: string;
  description: string | null;
  status: string;
  createdAt: Date;
}

/**
 * 租户套餐管理（平台级，见 ADR-008 D4）。
 *
 * - 套餐是「功能授权上限」：绑定一组平台级菜单，决定绑定该套餐的租户可用功能范围；
 *   `MenuService.resolveLicensedMenuIds` 以此为角色授权的校验边界。
 * - 增改删与菜单绑定均由平台超级管理员（SuperAdminGuard）执行。
 * - 移除套餐内菜单不会级联删除既有租户的角色绑定，但该菜单在套餐许可集合中消失后，
 *   对应权限校验自动失效（PermissionService 以套餐许可为准，fail closed）。
 */
@Injectable()
export class PackageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询套餐（平台级全景） */
  async list(query: QueryPackageDto): Promise<PaginatedResult<PackageResponseDto>> {
    const where: Prisma.SysTenantPackageWhereInput = {
      deletedAt: null,
      ...(query.packageName ? { packageName: { contains: query.packageName } } : {}),
      ...(query.packageCode ? { packageCode: { contains: query.packageCode } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysTenantPackage.findMany({
        where,
        // id 作第二排序键：createdAt 并列时顺序才唯一，避免翻页出现重复/漏行
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysTenantPackage.count({ where }),
    ]);

    return {
      items: rows.map(row => this.toResponse(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 套餐详情 */
  async detail(id: bigint): Promise<PackageResponseDto> {
    return this.toResponse(await this.findExisting(id));
  }

  /** 创建套餐 */
  async create(dto: CreatePackageDto): Promise<PackageResponseDto> {
    await this.assertCodeAvailable(dto.packageCode);

    try {
      const created = await this.prisma.sysTenantPackage.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          packageName: dto.packageName,
          packageCode: dto.packageCode,
          description: dto.description ?? null,
          status: dto.status ?? PackageStatus.ACTIVE,
        },
      });
      return this.toResponse(created);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 更新套餐（packageCode 变更做全局唯一校验） */
  async update(id: bigint, dto: UpdatePackageDto): Promise<PackageResponseDto> {
    const existing = await this.findExisting(id);

    if (dto.packageCode !== undefined && dto.packageCode !== existing.packageCode)
      await this.assertCodeAvailable(dto.packageCode, id);

    const data: Prisma.SysTenantPackageUpdateInput = {
      ...(dto.packageName !== undefined ? { packageName: dto.packageName } : {}),
      ...(dto.packageCode !== undefined ? { packageCode: dto.packageCode } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    try {
      const updated = await this.prisma.sysTenantPackage.update({
        where: { id: existing.id },
        data,
      });
      return this.toResponse(updated);
    }
    catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /** 软删除套餐（被未删除租户引用时拒绝） */
  async remove(id: bigint): Promise<void> {
    const pkg = await this.findExisting(id);

    const bound = await this.prisma.sysTenant.count({
      where: { packageId: pkg.id, deletedAt: null },
    });
    if (bound > 0)
      throw conflict('套餐已被租户使用，请先解绑', PACKAGE_BIZ.IN_USE);

    await this.prisma.sysTenantPackage.update({
      where: { id: pkg.id },
      data: {
        deletedAt: new Date(),
        status: PackageStatus.DISABLED,
        // 编码墓碑化，释放全局唯一占用（列宽 VarChar(50)）
        packageCode: this.tombstoneCode(pkg.packageCode, pkg.id),
      },
    });
  }

  /** 查询套餐已绑定的菜单 ID 集合 */
  async listMenus(id: bigint): Promise<PackageMenusDto> {
    const pkg = await this.findExisting(id);
    const rows = await this.prisma.sysTenantPackageMenu.findMany({
      where: { packageId: pkg.id },
      select: { menuId: true },
    });
    return { menuIds: rows.map(row => row.menuId.toString()) };
  }

  /**
   * 绑定套餐菜单（全量替换）。
   *
   * 校验：每个菜单 ID 必须为「平台级 + 启用 + 未删除」菜单，避免把停用/越界菜单写入授权范围。
   * 写入：事务内删旧插新，保证并发下不会出现新旧绑定并存的中间态。
   */
  async authorizeMenus(id: bigint, dto: PackageMenusDto): Promise<PackageMenusDto> {
    const pkg = await this.findExisting(id);

    const menuIds = [...new Set(dto.menuIds)];
    if (menuIds.length > 0) {
      const valid = await this.prisma.sysMenu.findMany({
        where: {
          id: { in: menuIds.map(menuId => BigInt(menuId)) },
          tenantId: null,
          deletedAt: null,
          status: MenuStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (valid.length !== menuIds.length)
        throw badRequest('存在无效的菜单（仅允许平台级启用菜单）', PACKAGE_BIZ.MENU_INVALID);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sysTenantPackageMenu.deleteMany({ where: { packageId: pkg.id } });
      if (menuIds.length > 0) {
        await tx.sysTenantPackageMenu.createMany({
          data: menuIds.map(menuId => ({
            id: BigInt(generateSnowflakeId()),
            packageId: pkg.id,
            menuId: BigInt(menuId),
          })),
        });
      }
    });

    return { menuIds };
  }

  /** 按「未删除」取套餐，不存在即 404 */
  private async findExisting(id: bigint): Promise<PackageRow> {
    const pkg = await this.prisma.sysTenantPackage.findFirst({
      where: { id, deletedAt: null },
    });
    if (!pkg)
      throw notFound('套餐不存在', PACKAGE_BIZ.NOT_FOUND);
    return pkg;
  }

  /** 校验套餐编码全局唯一（excludeId 用于更新时排除自身） */
  private async assertCodeAvailable(packageCode: string, excludeId?: bigint): Promise<void> {
    const existing = await this.prisma.sysTenantPackage.findFirst({
      where: {
        packageCode,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw conflict('套餐编码已被占用', PACKAGE_BIZ.CODE_EXISTS);
  }

  /** 唯一约束冲突（并发下预检失效）转成业务冲突错误；其它错误原样上抛 */
  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return conflict('套餐编码已被占用', PACKAGE_BIZ.CODE_EXISTS);
    }
    return error;
  }

  /** 墓碑套餐编码：释放原编码占用，同时不超列宽（VarChar(50)） */
  private tombstoneCode(packageCode: string, id: bigint): string {
    const suffix = `__deleted__${id.toString()}`;
    const keep = Math.max(0, 50 - suffix.length);
    return `${packageCode.slice(0, keep)}${suffix}`;
  }

  private toResponse(pkg: PackageRow): PackageResponseDto {
    return {
      id: pkg.id.toString(),
      packageName: pkg.packageName,
      packageCode: pkg.packageCode,
      description: pkg.description,
      status: pkg.status,
      createdAt: pkg.createdAt.toISOString(),
    };
  }
}
