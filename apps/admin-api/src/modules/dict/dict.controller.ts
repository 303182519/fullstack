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
import { PERMISSIONS } from '@/common/constants/permissions.js';
import { RequirePermission } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
import { DictDataService } from './dict-data.service.js';
import { DictTypeService } from './dict-type.service.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据。
import {
  CreateDictDataDto,
  CreateDictTypeDto,
  DictDataResponseDto,
  DictOptionDto,
  DictTypeResponseDto,
  QueryDictDataDto,
  QueryDictTypeDto,
  UpdateDictDataDto,
  UpdateDictTypeDto,
} from './dto/index.js';

/**
 * 字典管理（ADR-009 平台级 + 租户级遮蔽语义）。
 *
 * 作用域注入（一套端点按主体注入）：
 * - 租户管理员：恒定本租户；
 * - 平台超管：默认平台级；请求带 `?tenantId=` 时代管指定租户。
 *
 * 鉴权：管理端点按按钮级 permCode 校验；`GET /dict-data/options` 是消费端
 * 下拉选项（登录即可读），不设权限码。
 */
@ApiTags('字典管理')
@ApiBearerAuth()
@Controller()
export class DictController {
  constructor(
    private readonly dictTypeService: DictTypeService,
    private readonly dictDataService: DictDataService,
  ) {}

  // ---------- 字典类型 ----------

  @Get('dict-types')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.QUERY)
  @ApiOperation({ summary: '字典类型列表（平台级 + 本级合并视图，含 shadowed 标记）' })
  @ApiOkResponse({ description: '分页结果', type: DictTypeResponseDto, isArray: true })
  async listTypes(
    @Query() query: QueryDictTypeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.dictTypeService.list(query, delegatedTenantId);
  }

  @Post('dict-types')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.ADD)
  @OperLog({ module: '字典管理', action: '创建字典类型' })
  @ApiOperation({ summary: '创建字典类型（本作用域内键唯一）' })
  @ApiCreatedResponse({ type: DictTypeResponseDto })
  async createType(
    @Body() dto: CreateDictTypeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<DictTypeResponseDto> {
    return this.dictTypeService.create(dto, delegatedTenantId);
  }

  @Put('dict-types/:id')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.EDIT)
  @OperLog({ module: '字典管理', action: '更新字典类型' })
  @ApiOperation({ summary: '更新字典类型（dictType 键不可修改）' })
  @ApiOkResponse({ type: DictTypeResponseDto })
  async updateType(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateDictTypeDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<DictTypeResponseDto> {
    return this.dictTypeService.update(id, dto, delegatedTenantId);
  }

  @Delete('dict-types/:id')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.REMOVE)
  @OperLog({ module: '字典管理', action: '删除字典类型' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除字典类型（存在数据条目时拒绝）' })
  async removeType(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<null> {
    await this.dictTypeService.remove(id, delegatedTenantId);
    return null;
  }

  // ---------- 字典数据 ----------

  @Get('dict-data/options')
  @ApiOperation({ summary: '消费端字典选项（按遮蔽语义解析，仅 ACTIVE，登录即可读）' })
  @ApiOkResponse({ description: '选项列表', type: DictOptionDto, isArray: true })
  async options(@Query('type') dictType: string): Promise<DictOptionDto[]> {
    return this.dictDataService.effectiveOptions(dictType);
  }

  @Get('dict-data')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.QUERY)
  @ApiOperation({ summary: '字典数据列表（平台级 + 本级合并视图，含 shadowed 标记）' })
  @ApiOkResponse({ description: '分页结果', type: DictDataResponseDto, isArray: true })
  async listData(
    @Query() query: QueryDictDataDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.dictDataService.list(query, delegatedTenantId);
  }

  @Post('dict-data')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.ADD)
  @OperLog({ module: '字典管理', action: '创建字典数据' })
  @ApiOperation({ summary: '创建字典数据（须先存在同作用域类型定义）' })
  @ApiCreatedResponse({ type: DictDataResponseDto })
  async createData(
    @Body() dto: CreateDictDataDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<DictDataResponseDto> {
    return this.dictDataService.create(dto, delegatedTenantId);
  }

  @Put('dict-data/:id')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.EDIT)
  @OperLog({ module: '字典管理', action: '更新字典数据' })
  @ApiOperation({ summary: '更新字典数据（dictValue 不可修改）' })
  @ApiOkResponse({ type: DictDataResponseDto })
  async updateData(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateDictDataDto,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<DictDataResponseDto> {
    return this.dictDataService.update(id, dto, delegatedTenantId);
  }

  @Delete('dict-data/:id')
  @RequirePermission(PERMISSIONS.SYSTEM.DICT.REMOVE)
  @OperLog({ module: '字典管理', action: '删除字典数据' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除字典数据' })
  async removeData(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('tenantId') delegatedTenantId?: string,
  ): Promise<null> {
    await this.dictDataService.remove(id, delegatedTenantId);
    return null;
  }
}
