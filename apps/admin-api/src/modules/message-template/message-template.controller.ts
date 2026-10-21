import { PERMISSIONS } from '@fedstack/auth-core';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
import {
  CreateMessageTemplateDto,
  EffectiveTemplateDto,
  MessageTemplateResponseDto,
  QueryMessageTemplateDto,
  UpdateMessageTemplateDto,
} from './dto/index.js';
import { MessageTemplateService } from './message-template.service.js';

/**
 * 消息模板管理（ADR-013 D4：遮蔽语义复用 ADR-009）。
 *
 * 消费端取值走 `GET /message-templates/effective/:key/:channel`（遮蔽语义，登录即可读）。
 */
@ApiTags('消息模板')
@ApiBearerAuth()
@Controller('message-templates')
export class MessageTemplateController {
  constructor(private readonly templateService: MessageTemplateService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.QUERY)
  @ApiOperation({ summary: '模板列表（平台级 + 本级合并视图，含 shadowed 标记）' })
  @ApiOkResponse({ description: '分页结果', type: MessageTemplateResponseDto, isArray: true })
  async list(
    @Query() query: QueryMessageTemplateDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.templateService.list(query, delegatedTenantId);
  }

  /** 消费端取值：登录即可读，按遮蔽语义解析 */
  @Get('effective/:key/:channel')
  @ApiOperation({ summary: '消费端按 key 取有效模板（遮蔽语义，登录即可读）' })
  @ApiOkResponse({ type: EffectiveTemplateDto })
  async effective(
    @Param('key') templateKey: string,
    @Param('channel') channel: string,
  ): Promise<EffectiveTemplateDto> {
    return this.templateService.effectiveTemplate(templateKey, channel);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.ADD)
  @OperLog({ module: '消息模板', action: '创建模板' })
  @ApiOperation({ summary: '创建模板（同作用域内键唯一）' })
  @ApiCreatedResponse({ type: MessageTemplateResponseDto })
  async create(
    @Body() dto: CreateMessageTemplateDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<MessageTemplateResponseDto> {
    return this.templateService.create(dto, delegatedTenantId);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.EDIT)
  @OperLog({ module: '消息模板', action: '更新模板' })
  @ApiOperation({ summary: '更新模板（templateKey / channel 不可修改）' })
  @ApiOkResponse({ type: MessageTemplateResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateMessageTemplateDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<MessageTemplateResponseDto> {
    return this.templateService.update(id, dto, delegatedTenantId);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.REMOVE)
  @OperLog({ module: '消息模板', action: '删除模板' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除模板（软删）' })
  async remove(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<{ success: boolean }> {
    await this.templateService.remove(id, delegatedTenantId);
    return { success: true };
  }
}
