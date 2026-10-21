import type {
  CreateNoticeDto,
  NoticePublicDto,
  NoticeResponseDto,
  QueryNoticeDto,
  UpdateNoticeDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { OperateScope } from '@/shared/scope/scope-resolver.service.js';
import { NoticeStatus, NoticeType, Prisma } from '@fedstack/database';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { noticeErrors } from './errors.js';

interface NoticeRow {
  id: bigint;
  tenantId: bigint | null;
  title: string;
  content: string;
  type: NoticeType;
  status: NoticeStatus;
  publisherId: bigint | null;
  publisherName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function noticeWhere(query: QueryNoticeDto, tenantId: bigint | null): Prisma.SysNoticeWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.title ? { title: { contains: query.title } } : {}),
    ...(query.type ? { type: query.type as NoticeType } : {}),
    ...(query.status ? { status: query.status as NoticeStatus } : {}),
  };
}

/**
 * 通知公告管理 + 消费端公告流（ADR-013 D2/D3）。
 *
 * 两级**并列合并**（非遮蔽）：平台级公告 + 租户级公告都可见。
 * 与 ADR-009 的遮蔽语义不同：公告是广播，两级并存、都参与展示。
 */
@Injectable()
export class NoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /** 管理列表：双层级合并 + 内存分页（公告量级小，内存分页可接受） */
  async list(query: QueryNoticeDto, delegatedTenantId?: string): Promise<PaginatedResult<NoticeResponseDto>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysNotice.findMany({
            where: noticeWhere(query, scope.tenantId),
            orderBy: { createdAt: 'desc' },
          }),
      this.prisma.sysNotice.findMany({
        where: noticeWhere(query, null),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const merged = [
      ...tenantRows.map(row => this.toResponse(row)),
      ...platformRows.map(row => this.toResponse(row)),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));

    return {
      items: merged.slice(query.skip, query.skip + query.pageSize),
      total: merged.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 消费端公告流：平台级 + 本租户已发布公告，两级并列合并 */
  async publicList(query: QueryNoticeDto): Promise<PaginatedResult<NoticePublicDto>> {
    const scope = this.scopeResolver.resolveConsumer();

    const where: Prisma.SysNoticeWhereInput = {
      deletedAt: null,
      status: NoticeStatus.PUBLISHED,
      ...(query.title ? { title: { contains: query.title } } : {}),
      ...(query.type ? { type: query.type as Prisma.EnumNoticeTypeFilter } : {}),
    };

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysNotice.findMany({
            where: { ...where, tenantId: scope.tenantId },
            orderBy: { createdAt: 'desc' },
          }),
      this.prisma.sysNotice.findMany({
        where: { ...where, tenantId: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const merged = [
      ...tenantRows.map(row => this.toPublicResponse(row)),
      ...platformRows.map(row => this.toPublicResponse(row)),
    ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || (a.id < b.id ? 1 : -1));

    return {
      items: merged.slice(query.skip, query.skip + query.pageSize),
      total: merged.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 创建公告 */
  async create(dto: CreateNoticeDto, publisherId: bigint, publisherName: string, delegatedTenantId?: string): Promise<NoticeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const row = await this.prisma.sysNotice.create({
      data: {
        id: BigInt(generateSnowflakeId()),
        tenantId: scope.tenantId,
        title: dto.title,
        content: dto.content,
        type: (dto.type as NoticeType) ?? 'NOTICE',
        status: NoticeStatus.DRAFT,
        publisherId,
        publisherName,
      },
    });
    return this.toResponse(row);
  }

  /** 更新公告 */
  async update(id: bigint, dto: UpdateNoticeDto, delegatedTenantId?: string): Promise<NoticeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const updated = await this.prisma.sysNotice.update({
      where: { id: row.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.type !== undefined ? { type: dto.type as NoticeType } : {}),
        ...(dto.status !== undefined ? { status: dto.status as NoticeStatus } : {}),
      },
    });
    return this.toResponse(updated);
  }

  /** 发布公告（DRAFT → PUBLISHED） */
  async publish(id: bigint, delegatedTenantId?: string): Promise<NoticeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    if (row.status !== NoticeStatus.DRAFT)
      throw noticeErrors.notFound();

    const updated = await this.prisma.sysNotice.update({
      where: { id: row.id },
      data: { status: NoticeStatus.PUBLISHED },
    });
    return this.toResponse(updated);
  }

  /** 关闭公告（PUBLISHED → CLOSED） */
  async close(id: bigint, delegatedTenantId?: string): Promise<NoticeResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    if (row.status !== NoticeStatus.PUBLISHED)
      throw noticeErrors.notFound();

    const updated = await this.prisma.sysNotice.update({
      where: { id: row.id },
      data: { status: NoticeStatus.CLOSED },
    });
    return this.toResponse(updated);
  }

  /** 软删除公告 */
  async remove(id: bigint, delegatedTenantId?: string): Promise<null> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    await this.prisma.sysNotice.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    return null;
  }

  /** 按「作用域 + 未删除」取公告，越权/不存在一律 404 */
  private async requireInScope(id: bigint, scope: OperateScope): Promise<NoticeRow> {
    const row = await this.prisma.sysNotice.findFirst({
      where: { id, tenantId: scope.tenantId, deletedAt: null },
    });
    if (!row)
      throw noticeErrors.notFound();
    return row;
  }

  private toResponse(row: NoticeRow): NoticeResponseDto {
    return {
      id: row.id.toString(),
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      title: row.title,
      content: row.content,
      type: row.type,
      status: row.status,
      publisherName: row.publisherName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toPublicResponse(row: NoticeRow): NoticePublicDto {
    return {
      id: row.id.toString(),
      title: row.title,
      content: row.content,
      type: row.type,
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      publisherName: row.publisherName,
      publishedAt: row.createdAt.toISOString(),
    };
  }
}
