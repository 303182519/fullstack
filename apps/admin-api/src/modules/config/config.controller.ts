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
import { ConfigService } from './config.service.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据。
import {
  ConfigResponseDto,
  ConfigValueResponseDto,
  CreateConfigDto,
  QueryConfigDto,
  UpdateConfigDto,
} from './dto/index.js';

/**
 * 参数配置管理（ADR-009 平台级 + 租户级遮蔽语义）。
 *
 * 作用域注入与字典一致：租户管理员恒定本租户；平台超管默认平台级，
 * 可带 `?tenantId=` 代管指定租户。
 *
 * 路由说明：消费端取值走 `GET /configs/value/:key`（value 前缀避免与
 * `:id` 雪花路由冲突）。
 */
@ApiTags('参数配置')
@ApiBearerAuth()
@Controller('configs')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.CONFIG.QUERY)
  @ApiOperation({ summary: '参数列表（平台级 + 本级合并视图，含 shadowed（遮蔽语义） 标记）' })
  @ApiOkResponse({ description: '分页结果', type: ConfigResponseDto, isArray: true })
  async list(
    @Query() query: QueryConfigDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.configService.list(query, delegatedTenantId);
  }

  /** 消费端取值：登录即可读，按遮蔽语义解析 */
  @Get('value/:key')
  @ApiOperation({ summary: '消费端按 key 取参数值（遮蔽语义，登录即可读）' })
  @ApiOkResponse({ type: ConfigValueResponseDto })
  async value(@Param('key') configKey: string): Promise<ConfigValueResponseDto> {
    return this.configService.effectiveValue(configKey);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.CONFIG.ADD)
  @OperLog({ module: '参数配置', action: '创建参数' })
  @ApiOperation({ summary: '创建参数（本作用域内键唯一）' })
  @ApiCreatedResponse({ type: ConfigResponseDto })
  async create(
    @Body() dto: CreateConfigDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<ConfigResponseDto> {
    return this.configService.create(dto, delegatedTenantId);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.CONFIG.EDIT)
  @OperLog({ module: '参数配置', action: '更新参数' })
  @ApiOperation({ summary: '更新参数（configKey 不可修改）' })
  @ApiOkResponse({ type: ConfigResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateConfigDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<ConfigResponseDto> {
    return this.configService.update(id, dto, delegatedTenantId);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.CONFIG.REMOVE)
  @OperLog({ module: '参数配置', action: '删除参数' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除参数（内置参数拒绝）' })
  async remove(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<null> {
    await this.configService.remove(id, delegatedTenantId);
    return null;
  }
}
