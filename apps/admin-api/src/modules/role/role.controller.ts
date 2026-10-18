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
 * 鉴权：由全局 JwtAuthGuard 保护；本租户隔离在 Service 层强制。
 * 菜单授权端点（`/:id/menus`）标注 `@RequirePermission(PERMISSIONS.SYSTEM.ROLE.AUTH)`（P1 新增，见 ADR-008 D3）；
 * 角色 CRUD 沿用 P0 行为不挂权限码，待 P2 播种菜单与初始授权后统一收敛。
 */
@ApiTags('角色管理')
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @ApiOperation({ summary: '分页查询本租户角色' })
  @ApiOkResponse({ description: '分页结果 { items, total, page, pageSize }', type: RoleResponseDto, isArray: true })
  async list(@Query() query: QueryRoleDto) {
    return this.roleService.list(query);
  }

  @Post()
  @ApiOperation({ summary: '创建角色' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  async create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.roleService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '角色详情' })
  @ApiOkResponse({ type: RoleResponseDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<RoleResponseDto> {
    return this.roleService.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新角色' })
  @ApiOkResponse({ type: RoleResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
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
  @ApiOperation({ summary: '授权角色菜单（全量替换；仅限租户可用菜单范围）' })
  @ApiOkResponse({ type: RoleMenusDto })
  async authorizeMenus(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: RoleMenusDto,
  ): Promise<RoleMenusDto> {
    return this.roleService.authorizeMenus(id, dto);
  }
}
