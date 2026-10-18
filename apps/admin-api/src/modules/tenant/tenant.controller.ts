import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '@/common/guards/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据，
// import type 会把元数据擦成 Object；@ApiOkResponse({ type }) 也需要类引用。
import {
  QueryTenantDto,
  TenantResponseDto,
  UpdateTenantDto,
} from './dto/index.js';
import { TenantService } from './tenant.service.js';

/**
 * 租户管理（平台级）。
 *
 * 与租户内模块（用户/角色）不同：本模块不受 tenantId 约束，操作的是租户自身，
 * 因此必须叠加 SuperAdminGuard（要求 isSuper 主体）。全局 JwtAuthGuard 先完成登录校验。
 */
@ApiTags('租户管理（平台级）')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @ApiOperation({ summary: '分页查询租户（平台级）' })
  @ApiOkResponse({
    description: '分页结果 { items, total, page, pageSize }',
    type: TenantResponseDto,
    isArray: true,
  })
  async list(@Query() query: QueryTenantDto) {
    return this.tenantService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '租户详情' })
  @ApiOkResponse({ type: TenantResponseDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<TenantResponseDto> {
    return this.tenantService.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新租户信息（tenantCode 不可变）' })
  @ApiOkResponse({ type: TenantResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    return this.tenantService.update(id, dto);
  }
}
