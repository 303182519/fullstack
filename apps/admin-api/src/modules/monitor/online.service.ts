import type {
  OnlineUserResponseDto,
  QueryOnlineUserDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { notFound } from '@/common/exceptions/business.exception.js';
import { SessionService } from '@/shared/auth/session.service.js';
import { PrismaService } from '@/shared/database/prisma.service.js';

/** 在线用户业务错误码（95 = 监控模块） */
const ONLINE_BIZ = {
  SESSION_NOT_FOUND: '95A02',
  USER_NOT_FOUND: '95A03',
} as const;

/**
 * 在线用户（ADR-009 / ADR-007 会话模型）。
 *
 * - 列表：SCAN 全量会话后内存过滤（租户主体只看本租户）+ 分页；
 *   会话量级（数百～数千）下内存处理开销可忽略；
 * - 踢单会话：先读会话校验租户归属，再走 SessionService 正规删除路径
 *   （会话主体 + refresh 摘要 + 集合成员三处一致清理）；
 * - 按用户全部下线：目标用户必须存在；租户主体只能下线本租户用户
 *   （跨租户表现为 404，不泄露他租户用户是否存在）。
 */
@Injectable()
export class OnlineService {
  constructor(
    private readonly session: SessionService,
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: QueryOnlineUserDto): Promise<PaginatedResult<OnlineUserResponseDto>> {
    const user = this.requestContext.requireUser();
    const tenantFilter = user.isSuper ? null : user.tenantId;

    const records = (await this.session.listAllSessions())
      .filter(record => tenantFilter === null || record.tenantId === tenantFilter)
      .filter(record => (query.username ? record.username.includes(query.username) : true))
      .filter(record => (query.device ? record.device.includes(query.device) : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      items: records
        .slice(query.skip, query.skip + query.pageSize)
        .map(record => ({
          sessionId: record.sessionId,
          userId: record.userId,
          username: record.username,
          tenantId: record.tenantId,
          device: record.device,
          ip: record.ip,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
        })),
      total: records.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 踢单个会话 */
  async kick(sessionId: string): Promise<null> {
    const record = await this.session.getSessionRecord(sessionId);
    if (!record)
      throw notFound('会话不存在或已过期', ONLINE_BIZ.SESSION_NOT_FOUND);

    this.assertSameTenant(record.tenantId);
    await this.session.removeSession(record.sessionId, record.userId);
    return null;
  }

  /** 按用户下线全部设备 */
  async forceLogout(userId: string): Promise<null> {
    const user = this.requestContext.requireUser();
    if (!user.isSuper) {
      const target = await this.prisma.sysUser.findFirst({
        where: { id: BigInt(userId), deletedAt: null },
        select: { tenantId: true },
      });
      if (!target || target.tenantId.toString() !== user.tenantId)
        throw notFound('用户不存在', ONLINE_BIZ.USER_NOT_FOUND);
    }

    await this.session.removeAllSessions(userId);
    return null;
  }

  /** 租户主体只能操作本租户会话；越权表现为 404（不泄露他租户会话存在性） */
  private assertSameTenant(recordTenantId: string): void {
    const user = this.requestContext.requireUser();
    if (!user.isSuper && recordTenantId !== user.tenantId)
      throw notFound('会话不存在或已过期', ONLINE_BIZ.SESSION_NOT_FOUND);
  }
}
