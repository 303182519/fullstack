import type {
  CreateDictTypeDto,
  DictTypeResponseDto,
  QueryDictTypeDto,
  UpdateDictTypeDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { OperateScope } from '@/shared/scope/scope-resolver.service.js';
import { DictStatus, Prisma } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { invalidateDictOptions } from './dict.cache.js';
import { dictErrors } from './errors.js';

/** Prisma 字典类型查询结果的读取形状 */
interface DictTypeRow {
  id: bigint;
  tenantId: bigint | null;
  dictName: string;
  dictType: string;
  remark: string | null;
  status: string;
  createdAt: Date;
}

/** 类型列表查询的公共过滤条件（两条腿共用） */
function typeWhere(query: QueryDictTypeDto, tenantId: bigint | null): Prisma.SysDictTypeWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.dictName ? { dictName: { contains: query.dictName } } : {}),
    ...(query.dictType ? { dictType: { contains: query.dictType } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
}

/**
 * 字典类型管理（ADR-009 遮蔽语义）。
 *
 * - 作用域：租户管理员恒定本租户；平台超管默认平台级，可带 tenantId 代管指定租户；
 * - 列表：租户作用域下返回「本租户定义 + 平台级定义（带 shadowed 标记）」两个层级的合并视图；
 * - 唯一性：租户级由 DB 唯一索引 (tenantId, dict_type) 兜底（含软删行，故 create 用
 *   「复活」语义：同键软删行直接恢复）；平台级（tenant_id=NULL 不受唯一索引约束）
 *   由服务层校验兜底，极端并发下存在重复窗口（仅平台超管可触发，见 ADR-009）；
 * - dictType 键创建后不可修改：字典数据按 dictType 字符串归组（无外键），改键会使数据行失联。
 */
@Injectable()
export class DictTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /** 管理列表：双层级合并 + 内存分页（字典类型为百级规模，内存分页可接受） */
  async list(query: QueryDictTypeDto, delegatedTenantId?: string): Promise<PaginatedResult<DictTypeResponseDto>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysDictType.findMany({ where: typeWhere(query, scope.tenantId) }),
      this.prisma.sysDictType.findMany({ where: typeWhere(query, null) }),
    ]);

    // 遮蔽判定：租户已建立同名定义的平台行标记 shadowed（平台行全部展示，供对照管理）
    const tenantTypes = new Set(tenantRows.map(row => row.dictType));
    const merged: Array<DictTypeRow & { shadowed: boolean }> = [
      ...tenantRows.map(row => ({ ...row, shadowed: false })),
      ...platformRows.map(row => ({
        ...row,
        shadowed: scope.tenantId !== null && tenantTypes.has(row.dictType),
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));

    return {
      items: merged
        .slice(query.skip, query.skip + query.pageSize)
        .map(row => this.toResponse(row)),
      total: merged.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 创建字典类型（本作用域内键唯一；同键软删行复活） */
  async create(dto: CreateDictTypeDto, delegatedTenantId?: string): Promise<DictTypeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const existing = await this.prisma.sysDictType.findFirst({
      where: { tenantId: scope.tenantId, dictType: dto.dictType, deletedAt: null },
    });
    if (existing)
      throw dictErrors.typeExists();

    // 复活同键软删行，避免 (tenantId, dict_type) 唯一索引（租户级）挡住重建
    const resurrected = await this.prisma.sysDictType.findFirst({
      where: { tenantId: scope.tenantId, dictType: dto.dictType, deletedAt: { not: null } },
    });
    if (resurrected) {
      const row = await this.prisma.sysDictType.update({
        where: { id: resurrected.id },
        data: {
          deletedAt: null,
          dictName: dto.dictName,
          remark: dto.remark ?? null,
          status: DictStatus.ACTIVE,
        },
      });
      await invalidateDictOptions(this.cache, scope.tenantId, row.dictType);
      return this.toResponse(row);
    }

    try {
      const row = await this.prisma.sysDictType.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: scope.tenantId,
          dictName: dto.dictName,
          dictType: dto.dictType,
          remark: dto.remark ?? null,
          status: DictStatus.ACTIVE,
        },
      });
      return this.toResponse(row);
    }
    catch (err) {
      // 租户级并发创建命中唯一索引：明确报冲突，不吞
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw dictErrors.typeExists();
      throw err;
    }
  }

  /** 更新字典类型（dictType 键不可修改） */
  async update(id: bigint, dto: UpdateDictTypeDto, delegatedTenantId?: string): Promise<DictTypeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const updated = await this.prisma.sysDictType.update({
      where: { id: row.id },
      data: {
        ...(dto.dictName !== undefined ? { dictName: dto.dictName } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    // 类型禁用会改变消费端选项的可见性，一并失效
    await invalidateDictOptions(this.cache, scope.tenantId, updated.dictType);
    return this.toResponse(updated);
  }

  /** 软删除字典类型（同作用域内仍有字典数据时拒绝） */
  async remove(id: bigint, delegatedTenantId?: string): Promise<null> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const dataCount = await this.prisma.sysDictData.count({
      where: { tenantId: scope.tenantId, dictType: row.dictType, deletedAt: null },
    });
    if (dataCount > 0)
      throw dictErrors.typeHasData();

    await this.prisma.sysDictType.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), status: DictStatus.DISABLED },
    });
    await invalidateDictOptions(this.cache, scope.tenantId, row.dictType);
    return null;
  }

  /** 按「作用域 + 未删除」取字典类型，越权/不存在一律 404（不泄露他层行是否存在） */
  private async requireInScope(id: bigint, scope: OperateScope): Promise<DictTypeRow> {
    const row = await this.prisma.sysDictType.findFirst({
      where: { id, tenantId: scope.tenantId, deletedAt: null },
    });
    if (!row)
      throw dictErrors.typeNotFound();
    return row;
  }

  private toResponse(row: DictTypeRow & { shadowed?: boolean }): DictTypeResponseDto {
    return {
      id: row.id.toString(),
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      dictName: row.dictName,
      dictType: row.dictType,
      remark: row.remark,
      status: row.status as DictTypeResponseDto['status'],
      shadowed: row.shadowed ?? false,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
