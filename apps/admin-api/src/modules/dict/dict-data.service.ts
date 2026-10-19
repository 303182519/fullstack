import type {
  CreateDictDataDto,
  DictDataResponseDto,
  DictOptionDto,
  QueryDictDataDto,
  UpdateDictDataDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { OperateScope } from '@/shared/scope/scope-resolver.service.js';
import { DictStatus, Prisma } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { Injectable } from '@nestjs/common';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { scopeKeyOf, ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { invalidateDictOptions } from './dict.cache.js';
import { dictErrors } from './errors.js';

interface DictDataRow {
  id: bigint;
  tenantId: bigint | null;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  sort: number;
  remark: string | null;
  status: string;
  createdAt: Date;
}

function dataWhere(query: QueryDictDataDto, tenantId: bigint | null): Prisma.SysDictDataWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.dictType ? { dictType: query.dictType } : {}),
    ...(query.dictLabel ? { dictLabel: { contains: query.dictLabel } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
}

/**
 * 字典数据管理 + 消费端选项（ADR-009 遮蔽语义）。
 *
 * 遮蔽（shadow）规则：
 * - 租户对某 dictType 存在**未删除**的类型定义（与状态无关）→ 该类型的租户可见数据
 *   **整体**取自租户级数据行，平台级数据不参与合并；
 * - 租户无自有定义 → 直接读平台级数据行；
 * - 消费端只返回 ACTIVE 数据行，按 sort 升序、dictValue 次序稳定排序。
 *
 * 缓存（cache-aside + 写时失效，ADR-009）：只缓存数据行（DICT_OPTIONS key），
 * 「是否有自有定义」的判定不缓存 —— 那是一次索引点查，缓存它会让平台级写入
 * 无法精确失效所有租户副本。
 *
 * 唯一性：租户级 (tenantId, dict_type, dict_value) 有 DB 唯一索引兜底（含软删行，
 * create 走「复活」语义）；平台级由服务层校验，极端并发存在重复窗口（见 ADR-009）。
 */
@Injectable()
export class DictDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /** 管理列表：双层级合并 + 内存分页（数据行量级小，内存分页可接受） */
  async list(query: QueryDictDataDto, delegatedTenantId?: string): Promise<PaginatedResult<DictDataResponseDto>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysDictData.findMany({ where: dataWhere(query, scope.tenantId) }),
      this.prisma.sysDictData.findMany({ where: dataWhere(query, null) }),
    ]);

    // 遮蔽判定按「类型」粒度：租户拥有自有类型定义的平台数据行标记 shadowed
    const shadowedTypes = scope.tenantId === null
      ? new Set<string>()
      : new Set(
          (await this.prisma.sysDictType.findMany({
            where: { tenantId: scope.tenantId, deletedAt: null },
            select: { dictType: true },
          })).map(row => row.dictType),
        );

    const merged: Array<DictDataRow & { shadowed: boolean }> = [
      ...tenantRows.map(row => ({ ...row, shadowed: false })),
      ...platformRows.map(row => ({ ...row, shadowed: shadowedTypes.has(row.dictType) })),
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

  /**
   * 消费端选项：按遮蔽语义解析当前主体的有效字典条目（cache-aside）。
   * 消费端作用域：租户管理员=本租户；平台超管=平台级。
   */
  async effectiveOptions(dictType: string): Promise<DictOptionDto[]> {
    const scope = this.scopeResolver.resolveConsumer();
    const cacheKey = CacheKeys.DICT_OPTIONS(scopeKeyOf(scope.tenantId), dictType);

    const cached = await this.cache.get<DictOptionDto[]>(cacheKey);
    if (cached)
      return cached;

    const rows = await this.loadEffectiveRows(scope, dictType);
    const options: DictOptionDto[] = rows.map(row => ({
      dictLabel: row.dictLabel,
      dictValue: row.dictValue,
      sort: row.sort,
    }));
    await this.cache.set(cacheKey, options);
    return options;
  }

  /** 创建字典数据（须存在同作用域的类型定义；同键软删行复活） */
  async create(dto: CreateDictDataDto, delegatedTenantId?: string): Promise<DictDataResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    // 类型必须先在同作用域存在：数据按 dictType 字符串归组，孤儿数据没有消费语义
    const type = await this.prisma.sysDictType.findFirst({
      where: { tenantId: scope.tenantId, dictType: dto.dictType, deletedAt: null },
      select: { id: true },
    });
    if (!type)
      throw dictErrors.typeMissing();

    const existing = await this.prisma.sysDictData.findFirst({
      where: { tenantId: scope.tenantId, dictType: dto.dictType, dictValue: dto.dictValue, deletedAt: null },
    });
    if (existing)
      throw dictErrors.dataValueExists();

    // 复活同键软删行，避免唯一索引（租户级）挡住重建
    const resurrected = await this.prisma.sysDictData.findFirst({
      where: { tenantId: scope.tenantId, dictType: dto.dictType, dictValue: dto.dictValue, deletedAt: { not: null } },
    });
    if (resurrected) {
      const row = await this.prisma.sysDictData.update({
        where: { id: resurrected.id },
        data: {
          deletedAt: null,
          dictLabel: dto.dictLabel,
          sort: dto.sort ?? 0,
          remark: dto.remark ?? null,
          status: DictStatus.ACTIVE,
        },
      });
      await this.invalidate(scope, row.dictType);
      return this.toResponse(row);
    }

    try {
      const row = await this.prisma.sysDictData.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: scope.tenantId,
          dictType: dto.dictType,
          dictLabel: dto.dictLabel,
          dictValue: dto.dictValue,
          sort: dto.sort ?? 0,
          remark: dto.remark ?? null,
          status: dto.status ?? DictStatus.ACTIVE,
        },
      });
      return this.toResponse(row);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw dictErrors.dataValueExists();
      throw err;
    }
  }

  /** 更新字典数据（dictValue 不可修改；类型归属不可迁移） */
  async update(id: bigint, dto: UpdateDictDataDto, delegatedTenantId?: string): Promise<DictDataResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const updated = await this.prisma.sysDictData.update({
      where: { id: row.id },
      data: {
        ...(dto.dictLabel !== undefined ? { dictLabel: dto.dictLabel } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.invalidate(scope, updated.dictType);
    return this.toResponse(updated);
  }

  /** 软删除字典数据 */
  async remove(id: bigint, delegatedTenantId?: string): Promise<null> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    await this.prisma.sysDictData.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), status: DictStatus.DISABLED },
    });
    await this.invalidate(scope, row.dictType);
    return null;
  }

  /** 读有效数据行（遮蔽判定每次走 DB 索引点查，数据行走缓存） */
  private async loadEffectiveRows(scope: OperateScope, dictType: string): Promise<DictDataRow[]> {
    if (scope.tenantId !== null) {
      const ownType = await this.prisma.sysDictType.findFirst({
        where: { tenantId: scope.tenantId, dictType, deletedAt: null },
        select: { id: true },
      });
      if (ownType) {
        return this.prisma.sysDictData.findMany({
          where: { tenantId: scope.tenantId, dictType, deletedAt: null, status: DictStatus.ACTIVE },
          orderBy: [{ sort: 'asc' }, { dictValue: 'asc' }],
        });
      }
    }
    return this.prisma.sysDictData.findMany({
      where: { tenantId: null, dictType, deletedAt: null, status: DictStatus.ACTIVE },
      orderBy: [{ sort: 'asc' }, { dictValue: 'asc' }],
    });
  }

  private invalidate(scope: OperateScope, dictType: string): Promise<boolean> {
    return invalidateDictOptions(this.cache, scope.tenantId, dictType);
  }

  /** 按「作用域 + 未删除」取字典数据，越权/不存在一律 404 */
  private async requireInScope(id: bigint, scope: OperateScope): Promise<DictDataRow> {
    const row = await this.prisma.sysDictData.findFirst({
      where: { id, tenantId: scope.tenantId, deletedAt: null },
    });
    if (!row)
      throw dictErrors.dataNotFound();
    return row;
  }

  private toResponse(row: DictDataRow & { shadowed?: boolean }): DictDataResponseDto {
    return {
      id: row.id.toString(),
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      dictType: row.dictType,
      dictLabel: row.dictLabel,
      dictValue: row.dictValue,
      sort: row.sort,
      remark: row.remark,
      status: row.status as DictDataResponseDto['status'],
      shadowed: row.shadowed ?? false,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
