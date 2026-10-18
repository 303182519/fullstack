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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '@/common/guards/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据（见 auth.controller 说明）。
import {
  CreatePackageDto,
  PackageMenusDto,
  PackageResponseDto,
  QueryPackageDto,
  UpdatePackageDto,
} from './dto/index.js';
import { PackageService } from './package.service.js';

/**
 * 租户套餐管理（平台级）。
 *
 * 同租户管理模块：不受某一租户 tenantId 约束，必须叠加 SuperAdminGuard（要求 isSuper 主体）；
 * 全局 JwtAuthGuard 先完成登录校验。套餐绑定的菜单集合即租户功能授权上限（ADR-008 D4）。
 */
@ApiTags('租户套餐（平台级）')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('packages')
export class PackageController {
  constructor(private readonly packageService: PackageService) {}

  @Get()
  @ApiOperation({ summary: '分页查询套餐（平台级）' })
  @ApiOkResponse({
    description: '分页结果 { items, total, page, pageSize }',
    type: PackageResponseDto,
    isArray: true,
  })
  async list(@Query() query: QueryPackageDto) {
    return this.packageService.list(query);
  }

  @Post()
  @OperLog({ module: '套餐管理', action: '创建套餐' })
  @ApiOperation({ summary: '创建套餐' })
  @ApiCreatedResponse({ type: PackageResponseDto })
  async create(@Body() dto: CreatePackageDto): Promise<PackageResponseDto> {
    return this.packageService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '套餐详情' })
  @ApiOkResponse({ type: PackageResponseDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<PackageResponseDto> {
    return this.packageService.detail(id);
  }

  @Put(':id')
  @OperLog({ module: '套餐管理', action: '更新套餐' })
  @ApiOperation({ summary: '更新套餐' })
  @ApiOkResponse({ type: PackageResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdatePackageDto,
  ): Promise<PackageResponseDto> {
    return this.packageService.update(id, dto);
  }

  @Delete(':id')
  @OperLog({ module: '套餐管理', action: '删除套餐' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除套餐（软删除；被租户引用时拒绝）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.packageService.remove(id);
    return null;
  }

  @Get(':id/menus')
  @ApiOperation({ summary: '查询套餐已绑定的菜单 ID 集合' })
  @ApiOkResponse({ type: PackageMenusDto })
  async listMenus(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<PackageMenusDto> {
    return this.packageService.listMenus(id);
  }

  @Post(':id/menus')
  @OperLog({ module: '套餐管理', action: '绑定套餐菜单' })
  @ApiOperation({ summary: '绑定套餐菜单（全量替换；仅限平台级启用菜单）' })
  @ApiOkResponse({ type: PackageMenusDto })
  async authorizeMenus(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: PackageMenusDto,
  ): Promise<PackageMenusDto> {
    return this.packageService.authorizeMenus(id, dto);
  }
}
