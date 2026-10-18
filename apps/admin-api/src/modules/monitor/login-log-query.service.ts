import type { LoginLogResponseDto, QueryLoginLogDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { LogQueryBase } from './oper-log-query.service.js';

/**
 * 登录日志查询（ADR-009）：作用域与操作日志一致（租户主体读本租户，
 * 超管可读全部并可用 `?tenantId=` 收敛），复用其租户/时间过滤逻辑。
 */
@Injectable()
export class LoginLogQueryService extends LogQueryBase {
  constructor(
    prisma: PrismaService,
    requestContext: RequestContextService,
  ) {
    super(prisma, requestContext);
  }

  async list(query: QueryLoginLogDto, filterTenantId?: string): Promise<PaginatedResult<LoginLogResponseDto>> {
    const where: Prisma.SysLoginLogWhereInput = {
      ...this.tenantWhere(filterTenantId),
      ...(query.username ? { username: { contains: query.username } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.timeRange(query.beginTime, query.endTime),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysLoginLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysLoginLog.count({ where }),
    ]);

    return {
      items: rows.map(row => ({
        id: row.id.toString(),
        tenantId: row.tenantId.toString(),
        userId: row.userId ? row.userId.toString() : null,
        username: row.username,
        ip: row.ip,
        device: row.device,
        status: row.status,
        msg: row.msg,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
