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
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据（见 auth.controller 说明）。
import {
  CreateRoleDto,
  QueryRoleDto,
  RoleMenusDto,
  RoleResponseDto,
  UpdateRoleDto,
} from './dto/index.js';
import { RoleService } from './role.service.js';

/**
 * 角色管理（租户内）。
 *
 * 鉴权：全局 JwtAuthGuard + 按钮级 @RequirePermission；
 * 角色 CRUD 权限码 P2 收敛启用（P0 行为遗留缺口，见 ADR-008 D1）；
 * 菜单授权端点（`/:id/menus`）用 ROLE.AUTH（P1 启用，见 ADR-008 D3）；
 * 本租户隔离在 Service 层强制。
 */
@ApiTags('角色管理')
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.QUERY)
  @ApiOperation({ summary: '分页查询本租户角色' })
  @ApiOkResponse({ description: '分页结果 { items, total, page, pageSize }', type: RoleResponseDto, isArray: true })
  async list(@Query() query: QueryRoleDto) {
    return this.roleService.list(query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.ADD)
  @OperLog({ module: '角色管理', action: '创建角色' })
  @ApiOperation({ summary: '创建角色' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  async create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.roleService.create(dto);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.QUERY)
  @ApiOperation({ summary: '角色详情' })
  @ApiOkResponse({ type: RoleResponseDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<RoleResponseDto> {
    return this.roleService.detail(id);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.EDIT)
  @OperLog({ module: '角色管理', action: '更新角色' })
  @ApiOperation({ summary: '更新角色' })
  @ApiOkResponse({ type: RoleResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.REMOVE)
  @OperLog({ module: '角色管理', action: '删除角色' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除角色（软删除；被占用或内置角色禁止删除）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.roleService.remove(id);
    return null;
  }

  @Get(':id/menus')
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.AUTH)
  @ApiOperation({ summary: '查询角色已授权的菜单 ID 集合' })
  @ApiOkResponse({ type: RoleMenusDto })
  async listMenus(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<RoleMenusDto> {
    return this.roleService.listMenus(id);
  }

  @Post(':id/menus')
  @RequirePermission(PERMISSIONS.SYSTEM.ROLE.AUTH)
  @OperLog({ module: '角色管理', action: '授权角色菜单' })
  @ApiOperation({ summary: '授权角色菜单（全量替换；仅限租户可用菜单范围）' })
  @ApiOkResponse({ type: RoleMenusDto })
  async authorizeMenus(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: RoleMenusDto,
  ): Promise<RoleMenusDto> {
    return this.roleService.authorizeMenus(id, dto);
  }
}
