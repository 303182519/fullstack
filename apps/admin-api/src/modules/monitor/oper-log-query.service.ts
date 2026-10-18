import type { OperLogResponseDto, QueryOperLogDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { badRequest } from '@/common/exceptions/business.exception.js';
import { PrismaService } from '@/shared/database/prisma.service.js';

/** 操作日志业务错误码（95 = 监控模块） */
const MONITOR_BIZ = {
  TENANT_ID_INVALID: '95A01',
} as const;

const SNOWFLAKE_PATTERN = /^\d+$/;

/**
 * 日志查询共享基类：仅承载「租户作用域过滤 + 时间范围」两段可复用逻辑。
 *
 * 不含 list：操作日志与登录日志的 DTO / 返回结构完全不同，强行在基类
 * 声明 list 会迫使子类产生不兼容覆写（里氏替换被破坏），故两表各查各的。
 */
export abstract class LogQueryBase {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly requestContext: RequestContextService,
  ) {}

  /** 租户过滤：租户主体恒定本租户；超管可选 */
  protected tenantWhere(filterTenantId?: string): { tenantId?: bigint } {
    const user = this.requestContext.requireUser();
    if (!user.isSuper)
      return { tenantId: BigInt(user.tenantId) };
    if (filterTenantId !== undefined && filterTenantId !== '') {
      if (!SNOWFLAKE_PATTERN.test(filterTenantId))
        throw badRequest('tenantId 必须是雪花 ID 数字串', MONITOR_BIZ.TENANT_ID_INVALID);
      return { tenantId: BigInt(filterTenantId) };
    }
    return {};
  }

  /** 时间范围（结构最小化，兼容操作/登录两张日志表的 where 类型） */
  protected timeRange(beginTime?: string, endTime?: string): { createdAt?: { gte?: Date; lte?: Date } } {
    if (!beginTime && !endTime)
      return {};
    return {
      createdAt: {
        ...(beginTime ? { gte: new Date(beginTime) } : {}),
        ...(endTime ? { lte: new Date(endTime) } : {}),
      },
    };
  }
}

/**
 * 操作日志查询（ADR-009）。
 *
 * 作用域：租户管理员只读本租户日志；平台超管可读全部，可用 `?tenantId=` 收敛到单租户。
 * 日志是只增表：查询只带 created_at 范围与维度过滤，排序固定 createdAt desc（同刻用 id 兜底）。
 */
@Injectable()
export class OperLogQueryService extends LogQueryBase {
  constructor(
    prisma: PrismaService,
    requestContext: RequestContextService,
  ) {
    super(prisma, requestContext);
  }

  async list(query: QueryOperLogDto, filterTenantId?: string): Promise<PaginatedResult<OperLogResponseDto>> {
    const where: Prisma.SysOperLogWhereInput = {
      ...this.tenantWhere(filterTenantId),
      ...(query.module ? { module: { contains: query.module } } : {}),
      ...(query.username ? { username: { contains: query.username } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.timeRange(query.beginTime, query.endTime),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysOperLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysOperLog.count({ where }),
    ]);

    return {
      items: rows.map(row => ({
        id: row.id.toString(),
        tenantId: row.tenantId.toString(),
        userId: row.userId.toString(),
        username: row.username,
        module: row.module,
        action: row.action,
        method: row.method,
        path: row.path,
        ip: row.ip,
        params: row.params ?? null,
        result: row.result ?? null,
        status: row.status,
        errorMsg: row.errorMsg,
        costMs: row.costMs,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
