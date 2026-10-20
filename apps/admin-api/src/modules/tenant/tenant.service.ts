import type { QueryTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { tenantErrors } from './errors.js';

/** Prisma 租户查询结果的读取形状 */
interface TenantRow {
  id: bigint;
  tenantCode: string;
  tenantName: string;
  domain: string | null;
  logo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  expireTime: Date | null;
  packageId: bigint | null;
  userLimit: number;
  storageLimit: bigint;
  createdAt: Date;
}

/**
 * 租户管理（平台级，P0 只读 + 有限更新）。
 *
 * 平台级语义：本模块操作的是「租户本身」，不受某一租户的 tenantId 约束，
 * 访问入口由 SuperAdminGuard 强制（isSuper 主体），见 ADR-005。
 * P0 不提供创建/删除租户：租户开通涉及配额、套餐、初始管理员播种（P1/P3），
 * 直接裸建会留下无管理员的空租户；确需开通走运维脚本。
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询租户（平台级全景） */
  async list(query: QueryTenantDto): Promise<PaginatedResult<TenantResponseDto>> {
    const where: Prisma.SysTenantWhereInput = {
      deletedAt: null,
      ...(query.tenantCode ? { tenantCode: { contains: query.tenantCode } } : {}),
      ...(query.tenantName ? { tenantName: { contains: query.tenantName } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysTenant.findMany({
        where,
        // id 作第二排序键：createdAt 并列时顺序才唯一，避免翻页出现重复/漏行
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysTenant.count({ where }),
    ]);

    return {
      items: rows.map(row => this.toResponse(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 租户详情 */
  async detail(id: bigint): Promise<TenantResponseDto> {
    const tenant = await this.prisma.sysTenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tenant)
      throw tenantErrors.notFound();
    return this.toResponse(tenant);
  }

  /** 更新租户（tenantCode 不可变，见 UpdateTenantDto 说明） */
  async update(id: bigint, dto: UpdateTenantDto): Promise<TenantResponseDto> {
    const existing = await this.prisma.sysTenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw tenantErrors.notFound();

    // 绑定套餐前校验目标套餐存在（传 null 表示解绑，无需校验）
    if (dto.packageId) {
      const pkg = await this.prisma.sysTenantPackage.findFirst({
        where: { id: BigInt(dto.packageId), deletedAt: null },
        select: { id: true },
      });
      if (!pkg)
        throw tenantErrors.packageNotFound();
    }

    const data: Prisma.SysTenantUpdateInput = {
      ...(dto.tenantName !== undefined ? { tenantName: dto.tenantName } : {}),
      ...(dto.domain !== undefined ? { domain: dto.domain } : {}),
      ...(dto.logo !== undefined ? { logo: dto.logo } : {}),
      ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
      ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.expireTime !== undefined ? { expireTime: new Date(dto.expireTime) } : {}),
      ...(dto.packageId !== undefined ? { packageId: dto.packageId ? BigInt(dto.packageId) : null } : {}),
      ...(dto.userLimit !== undefined ? { userLimit: dto.userLimit } : {}),
      ...(dto.storageLimit !== undefined ? { storageLimit: BigInt(dto.storageLimit) } : {}),
    };

    const updated = await this.prisma.sysTenant.update({
      where: { id: existing.id },
      data,
    });
    return this.toResponse(updated);
  }

  private toResponse(tenant: TenantRow): TenantResponseDto {
    return {
      id: tenant.id.toString(),
      tenantCode: tenant.tenantCode,
      tenantName: tenant.tenantName,
      domain: tenant.domain,
      logo: tenant.logo,
      contactName: tenant.contactName,
      contactPhone: tenant.contactPhone,
      status: tenant.status,
      expireTime: tenant.expireTime ? tenant.expireTime.toISOString() : null,
      packageId: tenant.packageId ? tenant.packageId.toString() : null,
      userLimit: tenant.userLimit,
      storageLimit: tenant.storageLimit.toString(),
      createdAt: tenant.createdAt.toISOString(),
    };
  }
}
