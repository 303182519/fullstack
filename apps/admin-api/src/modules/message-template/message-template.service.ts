import type {
  CreateMessageTemplateDto,
  EffectiveTemplateDto,
  MessageTemplateResponseDto,
  QueryMessageTemplateDto,
  UpdateMessageTemplateDto,
} from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { OperateScope } from '@/shared/scope/scope-resolver.service.js';
import { MessageTemplateChannel, MessageTemplateStatus, Prisma } from '@fedstack/database';
import { CacheService } from '@fedstack/redis';
import { Injectable } from '@nestjs/common';
import { CacheKeys } from '@/shared/caching/cache.constants.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { scopeKeyOf, ScopeResolverService } from '@/shared/scope/scope-resolver.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { messageTemplateErrors } from './errors.js';

interface TemplateRow {
  id: bigint;
  tenantId: bigint | null;
  templateKey: string;
  channel: MessageTemplateChannel;
  subject: string | null;
  content: string;
  status: MessageTemplateStatus;
  createdAt: Date;
}

function templateWhere(query: QueryMessageTemplateDto, tenantId: bigint | null): Prisma.SysMessageTemplateWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.templateKey ? { templateKey: { contains: query.templateKey } } : {}),
    ...(query.channel ? { channel: query.channel as MessageTemplateChannel } : {}),
    ...(query.status ? { status: query.status as MessageTemplateStatus } : {}),
  };
}

/**
 * 消息模板管理（ADR-013 D4：遮蔽语义复用 ADR-009）。
 *
 * - 平台级（tenantId=null）+ 租户级两级；
 * - 租户对同 `(templateKey, channel)` 建立自有模板后**整体遮蔽**平台级；
 * - 缓存（cache-aside + 写时失效）：只缓存解析后的模板；
 * - templateKey 创建后不可修改（消费端按 key 寻址）。
 */
@Injectable()
export class MessageTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /** 管理列表：双层级合并 + 内存分页 */
  async list(query: QueryMessageTemplateDto, delegatedTenantId?: string): Promise<PaginatedResult<MessageTemplateResponseDto>> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const [tenantRows, platformRows] = await Promise.all([
      scope.tenantId === null
        ? Promise.resolve([])
        : this.prisma.sysMessageTemplate.findMany({ where: templateWhere(query, scope.tenantId) }),
      this.prisma.sysMessageTemplate.findMany({ where: templateWhere(query, null) }),
    ]);

    const tenantKeys = new Set(tenantRows.map(row => `${row.templateKey}:${row.channel}`));
    const merged = [
      ...tenantRows.map(row => this.toResponse(row, false)),
      ...platformRows.map(row => this.toResponse(row, scope.tenantId !== null && tenantKeys.has(`${row.templateKey}:${row.channel}`))),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));

    return {
      items: merged.slice(query.skip, query.skip + query.pageSize),
      total: merged.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 消费端取值：按遮蔽语义解析当前主体的有效模板（cache-aside） */
  async effectiveTemplate(templateKey: string, channel: string, variables?: Record<string, string>): Promise<EffectiveTemplateDto> {
    const scope = this.scopeResolver.resolveConsumer();
    const cacheKey = CacheKeys.MESSAGE_TEMPLATE(scopeKeyOf(scope.tenantId), templateKey, channel);

    let template = await this.cache.get<EffectiveTemplateDto>(cacheKey);
    if (!template) {
      const loaded = await this.loadEffectiveTemplate(scope, templateKey, channel);
      if (loaded)
        await this.cache.set(cacheKey, loaded);
      template = loaded ?? undefined;
    }

    if (!template)
      throw messageTemplateErrors.notFound();

    return variables ? this.render(template, variables) : template;
  }

  /** 创建模板（同作用域内键唯一） */
  async create(dto: CreateMessageTemplateDto, delegatedTenantId?: string): Promise<MessageTemplateResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);

    const existing = await this.prisma.sysMessageTemplate.findFirst({
      where: { tenantId: scope.tenantId, templateKey: dto.templateKey, channel: dto.channel as MessageTemplateChannel, deletedAt: null },
    });
    if (existing)
      throw messageTemplateErrors.keyExists();

    try {
      const row = await this.prisma.sysMessageTemplate.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: scope.tenantId,
          templateKey: dto.templateKey,
          channel: dto.channel as MessageTemplateChannel,
          subject: dto.subject ?? null,
          content: dto.content,
          status: (dto.status as MessageTemplateStatus) ?? MessageTemplateStatus.ACTIVE,
        },
      });
      await this.invalidate(scope, row.templateKey, row.channel);
      return this.toResponse(row, false);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw messageTemplateErrors.keyExists();
      throw err;
    }
  }

  /** 更新模板（templateKey / channel 不可修改） */
  async update(id: bigint, dto: UpdateMessageTemplateDto, delegatedTenantId?: string): Promise<MessageTemplateResponseDto> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    const updated = await this.prisma.sysMessageTemplate.update({
      where: { id: row.id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject ?? null } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.status !== undefined ? { status: dto.status as MessageTemplateStatus } : {}),
      },
    });
    await this.invalidate(scope, updated.templateKey, updated.channel);
    return this.toResponse(updated, false);
  }

  /** 软删除模板 */
  async remove(id: bigint, delegatedTenantId?: string): Promise<null> {
    const scope = this.scopeResolver.resolve(delegatedTenantId);
    const row = await this.requireInScope(id, scope);

    await this.prisma.sysMessageTemplate.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    await this.invalidate(scope, row.templateKey, row.channel);
    return null;
  }

  /** 按遮蔽语义读有效模板 */
  private async loadEffectiveTemplate(scope: OperateScope, templateKey: string, channel: string): Promise<EffectiveTemplateDto | null> {
    if (scope.tenantId !== null) {
      const own = await this.prisma.sysMessageTemplate.findFirst({
        where: { tenantId: scope.tenantId, templateKey, channel: channel as MessageTemplateChannel, deletedAt: null, status: MessageTemplateStatus.ACTIVE },
      });
      if (own)
        return this.toEffective(own);
    }
    const platform = await this.prisma.sysMessageTemplate.findFirst({
      where: { tenantId: null, templateKey, channel: channel as MessageTemplateChannel, deletedAt: null, status: MessageTemplateStatus.ACTIVE },
    });
    return platform ? this.toEffective(platform) : null;
  }

  /** 变量替换：{{var}} → value */
  private render(template: EffectiveTemplateDto, variables: Record<string, string>): EffectiveTemplateDto {
    const render = (s: string) =>
      Object.entries(variables).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), s);
    return {
      ...template,
      content: render(template.content),
      ...(template.subject ? { subject: render(template.subject) } : {}),
    };
  }

  private invalidate(scope: OperateScope, templateKey: string, channel: string): Promise<boolean> {
    return this.cache.del(CacheKeys.MESSAGE_TEMPLATE(scopeKeyOf(scope.tenantId), templateKey, channel));
  }

  /** 按「作用域 + 未删除」取模板 */
  private async requireInScope(id: bigint, scope: OperateScope): Promise<TemplateRow> {
    const row = await this.prisma.sysMessageTemplate.findFirst({
      where: { id, tenantId: scope.tenantId, deletedAt: null },
    });
    if (!row)
      throw messageTemplateErrors.notFound();
    return row;
  }

  private toResponse(row: TemplateRow, shadowed: boolean): MessageTemplateResponseDto {
    return {
      id: row.id.toString(),
      scope: row.tenantId === null ? 'PLATFORM' : 'TENANT',
      templateKey: row.templateKey,
      channel: row.channel,
      subject: row.subject,
      content: row.content,
      status: row.status,
      shadowed,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toEffective(row: TemplateRow): EffectiveTemplateDto {
    return {
      templateKey: row.templateKey,
      channel: row.channel as MessageTemplateResponseDto['channel'],
      subject: row.subject,
      content: row.content,
    };
  }
}
