import type {
  ConfigResponseDto,
  ConfigValueResponseDto,
  CreateConfigDto,
  QueryConfigDto,
  UpdateConfigDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { OperateScope } from '@/shared/scope/scope-resolver.service.js';
import { Prisma } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { Injectable } from '@nestjs/common';
import { conflict, notFound } from '@/common/exceptions/business.exception.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { scopeKeyOf, ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';

/** 参数配置业务错误码（MMSNN 规范；90 = 参数模块） */
const CONFIG_BIZ = {
  NOT_FOUND: '90A01',
  KEY_EXISTS: '90A02',
  SYSTEM_IMMUTABLE: '90A03',
} as const;

interface ConfigRow {
  id: bigint;
  tenantId: bigint | null;
  configName: string;
  configKey: string;
  configValue: string;
  isSystem: boolean;
  remark: string | null;
  createdAt: Date;
}

function configWhere(query: QueryConfigDto, tenantId: bigint | null): Prisma.SysConfigWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.configName ? { configName: { contains: query.configName } } : {}),
    ...(query.configKey ? { configKey: { contains: query.configKey } } : {}),
  };
}

/**
 * 参数配置管理 + 消费端取值（ADR-009 遮蔽语义）。
 *
 * - 遮蔽：租户对某 configKey 存在未删除定义 → 整体遮蔽平台级同键参数；
 * - configKey 创建后不可修改（消费端按 key 寻址，改键等于换参数）；
 * - isSystem 参数不允许删除（值/名称/备注仍可改），防止误删平台运行参数；
 * - 缓存（cache-aside + 写时失效）：只缓存「解析后的值」（CONFIG_VALUE key），
 *   遮蔽判定不缓存（同字典，见 dict-data.service 说明）；
 * - 平台级唯一性由服务层校验兜底（tenant_id=NULL 不受唯一索引约束，见 ADR-009）。
 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /** 管理列表：双层级合并 + 内存分页（参数为十百级规模，内存分页可接受） */
  async list(query: QueryConfigDto, delegatedTenantId?: string): Promise<PaginatedResult<ConfigResponseDto>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysConfig.findMany({ where: configWhere(query, scope.tenantId) }),
      this.prisma.sysConfig.findMany({ where: configWhere(query, null) }),
    ]);

    const tenantKeys = new Set(tenantRows.map(row => row.configKey));
    const merged: Array<ConfigRow & { shadowed: boolean }> = [
      ...tenantRows.map(row => ({ ...row, shadowed: false })),
      ...platformRows.map(row => ({
        ...row,
        shadowed: scope.tenantId !== null && tenantKeys.has(row.configKey),
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

  /** 消费端取值：按遮蔽语义解析当前主体的有效参数值（cache-aside） */
  async effectiveValue(configKey: string): Promise<ConfigValueResponseDto> {
    const scope = this.scopeResolver.resolveConsumer();
    const cacheKey = CacheKeys.CONFIG_VALUE(scopeKeyOf(scope.tenantId), configKey);

    const cached = await this.cache.get<{ value: string; source: 'PLATFORM' | 'TENANT' }>(cacheKey);
    if (cached)
      return { configKey, ...cached };

    if (scope.tenantId !== null) {
      const own = await this.prisma.sysConfig.findFirst({
        where: { tenantId: scope.tenantId, configKey, deletedAt: null },
      });
      if (own) {
        const resolved = { value: own.configValue, source: 'TENANT' as const };
        await this.cache.set(cacheKey, resolved);
        return { configKey, ...resolved };
      }
    }

    const platform = await this.prisma.sysConfig.findFirst({
      where: { tenantId: null, configKey, deletedAt: null },
    });
    if (!platform)
      throw notFound('参数不存在', CONFIG_BIZ.NOT_FOUND);

    const resolved = { value: platform.configValue, source: 'PLATFORM' as const };
    await this.cache.set(cacheKey, resolved);
    return { configKey, ...resolved };
  }

  /** 创建参数（本作用域内键唯一；同键软删行复活） */
  async create(dto: CreateConfigDto, delegatedTenantId?: string): Promise<ConfigResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const existing = await this.prisma.sysConfig.findFirst({
      where: { tenantId: scope.tenantId, configKey: dto.configKey, deletedAt: null },
    });
    if (existing)
      throw conflict('参数键已存在', CONFIG_BIZ.KEY_EXISTS);

    const resurrected = await this.prisma.sysConfig.findFirst({
      where: { tenantId: scope.tenantId, configKey: dto.configKey, deletedAt: { not: null } },
    });
    if (resurrected) {
      const row = await this.prisma.sysConfig.update({
        where: { id: resurrected.id },
        data: {
          deletedAt: null,
          configName: dto.configName,
          configValue: dto.configValue,
          isSystem: dto.isSystem ?? false,
          remark: dto.remark ?? null,
        },
      });
      await this.invalidate(scope, row.configKey);
      return this.toResponse(row);
    }

    try {
      const row = await this.prisma.sysConfig.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: scope.tenantId,
          configName: dto.configName,
          configKey: dto.configKey,
          configValue: dto.configValue,
          isSystem: dto.isSystem ?? false,
          remark: dto.remark ?? null,
        },
      });
      return this.toResponse(row);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw conflict('参数键已存在', CONFIG_BIZ.KEY_EXISTS);
      throw err;
    }
  }

  /** 更新参数（configKey 不可修改；isSystem 仅平台超管在平台级可改由前端约束，后端只做存在性校验） */
  async update(id: bigint, dto: UpdateConfigDto, delegatedTenantId?: string): Promise<ConfigResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const updated = await this.prisma.sysConfig.update({
      where: { id: row.id },
      data: {
        ...(dto.configName !== undefined ? { configName: dto.configName } : {}),
        ...(dto.configValue !== undefined ? { configValue: dto.configValue } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        ...(dto.isSystem !== undefined ? { isSystem: dto.isSystem } : {}),
      },
    });
    await this.invalidate(scope, updated.configKey);
    return this.toResponse(updated);
  }

  /** 软删除参数（isSystem 拒绝） */
  async remove(id: bigint, delegatedTenantId?: string): Promise<null> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    if (row.isSystem)
      throw conflict('内置参数不允许删除', CONFIG_BIZ.SYSTEM_IMMUTABLE);

    await this.prisma.sysConfig.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    await this.invalidate(scope, row.configKey);
    return null;
  }

  private invalidate(scope: OperateScope, configKey: string): Promise<boolean> {
    return this.cache.del(CacheKeys.CONFIG_VALUE(scopeKeyOf(scope.tenantId), configKey));
  }

  /** 按「作用域 + 未删除」取参数，越权/不存在一律 404 */
  private async requireInScope(id: bigint, scope: OperateScope): Promise<ConfigRow> {
    const row = await this.prisma.sysConfig.findFirst({
      where: { id, tenantId: scope.tenantId, deletedAt: null },
    });
    if (!row)
      throw notFound('参数不存在', CONFIG_BIZ.NOT_FOUND);
    return row;
  }

  private toResponse(row: ConfigRow & { shadowed?: boolean }): ConfigResponseDto {
    return {
      id: row.id.toString(),
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      configName: row.configName,
      configKey: row.configKey,
      configValue: row.configValue,
      isSystem: row.isSystem,
      remark: row.remark,
      shadowed: row.shadowed ?? false,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
