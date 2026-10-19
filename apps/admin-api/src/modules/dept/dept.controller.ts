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
import { DeptService } from './dept.service.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据（见 auth.controller 说明）。
import {
  CreateDeptDto,
  DeptResponseDto,
  QueryDeptDto,
  UpdateDeptDto,
} from './dto/index.js';

/**
 * 部门管理（租户内）。
 *
 * 鉴权：全局 JwtAuthGuard + 按钮级 @RequirePermission（P1 新增，见 ADR-008 D1）；
 * 租户隔离在 Service 层强制；数据权限（本部门及以下）在 DeptService 内按 DataScopeService 过滤。
 */
@ApiTags('部门管理')
@ApiBearerAuth()
@Controller('depts')
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.DEPT.QUERY)
  @ApiOperation({ summary: '部门树（按数据权限过滤）' })
  @ApiOkResponse({ description: '部门树', type: DeptResponseDto, isArray: true })
  async tree(@Query() query: QueryDeptDto): Promise<DeptResponseDto[]> {
    return this.deptService.tree(query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.DEPT.ADD)
  @OperLog({ module: '部门管理', action: '创建部门' })
  @ApiOperation({ summary: '创建部门' })
  @ApiCreatedResponse({ type: DeptResponseDto })
  async create(@Body() dto: CreateDeptDto): Promise<DeptResponseDto> {
    return this.deptService.create(dto);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.DEPT.EDIT)
  @OperLog({ module: '部门管理', action: '更新部门' })
  @ApiOperation({ summary: '更新部门（上级变更会级联重算子树路径）' })
  @ApiOkResponse({ type: DeptResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateDeptDto,
  ): Promise<DeptResponseDto> {
    return this.deptService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.DEPT.REMOVE)
  @OperLog({ module: '部门管理', action: '删除部门' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除部门（存在下级或用户时拒绝）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.deptService.remove(id);
    return null;
  }
}
