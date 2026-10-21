import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
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
import { CurrentUser, RequirePermission } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
import {
  CreateNoticeDto,
  NoticePublicDto,
  NoticeResponseDto,
  QueryNoticeDto,
  UpdateNoticeDto,
} from './dto/index.js';
import { NoticeService } from './notice.service.js';

/**
 * 通知公告管理（ADR-013 D2/D3）。
 *
 * 消费端 `GET /notices/public`：两级并列合并（平台级 + 本租户已发布），
 * 无需权限码，仅需认证。
 */
@ApiTags('通知公告')
@ApiBearerAuth()
@Controller('notices')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.QUERY)
  @ApiOperation({ summary: '公告列表（管理端，平台级 + 本级合并视图）' })
  @ApiOkResponse({ description: '分页结果', type: NoticeResponseDto, isArray: true })
  async list(
    @Query() query: QueryNoticeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.noticeService.list(query, delegatedTenantId);
  }

  @Get('public')
  @ApiOperation({ summary: '消费端公告流（已发布，两级并列合并）' })
  @ApiOkResponse({ description: '分页结果', type: NoticePublicDto, isArray: true })
  async publicList(@Query() query: QueryNoticeDto) {
    return this.noticeService.publicList(query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.ADD)
  @OperLog({ module: '通知公告', action: '创建公告' })
  @ApiOperation({ summary: '创建公告（默认 DRAFT 草稿）' })
  @ApiCreatedResponse({ type: NoticeResponseDto })
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateNoticeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<NoticeResponseDto> {
    return this.noticeService.create(
      dto,
      BigInt(principal.userId),
      principal.username,
      delegatedTenantId,
    );
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.EDIT)
  @OperLog({ module: '通知公告', action: '更新公告' })
  @ApiOperation({ summary: '更新公告' })
  @ApiOkResponse({ type: NoticeResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateNoticeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<NoticeResponseDto> {
    return this.noticeService.update(id, dto, delegatedTenantId);
  }

  @Post(':id/publish')
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.EDIT)
  @OperLog({ module: '通知公告', action: '发布公告' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布公告（DRAFT → PUBLISHED）' })
  @ApiOkResponse({ type: NoticeResponseDto })
  async publish(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<NoticeResponseDto> {
    return this.noticeService.publish(id, delegatedTenantId);
  }

  @Post(':id/close')
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.EDIT)
  @OperLog({ module: '通知公告', action: '关闭公告' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关闭公告（PUBLISHED → CLOSED）' })
  @ApiOkResponse({ type: NoticeResponseDto })
  async close(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<NoticeResponseDto> {
    return this.noticeService.close(id, delegatedTenantId);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.NOTICE.REMOVE)
  @OperLog({ module: '通知公告', action: '删除公告' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除公告（软删）' })
  async remove(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<{ success: boolean }> {
    await this.noticeService.remove(id, delegatedTenantId);
    return { success: true };
  }
}
