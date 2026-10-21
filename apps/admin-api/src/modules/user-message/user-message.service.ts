import type { QueryUserMessageDto, UserMessageResponseDto } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { userMessageErrors } from './errors.js';

interface UserMessageRow {
  id: bigint;
  tenantId: bigint;
  userId: bigint;
  title: string;
  content: string;
  category: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function buildWhere(
  userId: bigint,
  tenantId: bigint,
  query: QueryUserMessageDto,
): Prisma.SysUserMessageWhereInput {
  return {
    userId,
    tenantId,
    deletedAt: null,
    ...(query.title ? { title: { contains: query.title } } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.unreadOnly === true ? { readAt: null } : {}),
  };
}

/**
 * 站内信自助服务（ADR-013 D2/D9）。
 *
 * 自助端点：仅需认证，无需权限码；租户作用域由 JWT 注入。
 * 所有操作限定 `userId = currentUser`，防止越权读写他人消息。
 */
@Injectable()
export class UserMessageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 消息列表（分页） */
  async list(
    principal: AuthPrincipal,
    query: QueryUserMessageDto,
  ): Promise<PaginatedResult<UserMessageResponseDto>> {
    const where = buildWhere(BigInt(principal.userId), BigInt(principal.tenantId), query);

    const [rows, total] = await Promise.all([
      this.prisma.sysUserMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysUserMessage.count({ where }),
    ]);

    return {
      items: rows.map(row => this.toResponse(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 未读消息数 */
  async unreadCount(principal: AuthPrincipal): Promise<{ count: number }> {
    const count = await this.prisma.sysUserMessage.count({
      where: {
        userId: BigInt(principal.userId),
        tenantId: BigInt(principal.tenantId),
        deletedAt: null,
        readAt: null,
      },
    });
    return { count };
  }

  /** 标记单条已读 */
  async markRead(principal: AuthPrincipal, id: bigint): Promise<UserMessageResponseDto> {
    const row = await this.requireOwned(principal, id);

    const updated = await this.prisma.sysUserMessage.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return this.toResponse(updated);
  }

  /** 全部标记已读 */
  async markAllRead(principal: AuthPrincipal): Promise<{ count: number }> {
    const result = await this.prisma.sysUserMessage.updateMany({
      where: {
        userId: BigInt(principal.userId),
        tenantId: BigInt(principal.tenantId),
        deletedAt: null,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  /** 删除（软删） */
  async remove(principal: AuthPrincipal, id: bigint): Promise<{ success: boolean }> {
    const row = await this.requireOwned(principal, id);

    await this.prisma.sysUserMessage.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  /** 校验消息属于当前用户且未删除 */
  private async requireOwned(principal: AuthPrincipal, id: bigint): Promise<UserMessageRow> {
    const row = await this.prisma.sysUserMessage.findFirst({
      where: {
        id,
        userId: BigInt(principal.userId),
        tenantId: BigInt(principal.tenantId),
        deletedAt: null,
      },
    });
    if (!row)
      throw userMessageErrors.notFound();
    return row;
  }

  private toResponse(row: UserMessageRow): UserMessageResponseDto {
    return {
      id: row.id.toString(),
      tenantId: row.tenantId.toString(),
      title: row.title,
      content: row.content,
      category: row.category,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      read: row.readAt !== null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
