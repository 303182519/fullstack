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
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据。
import {
  CreateMenuDto,
  MenuResponseDto,
  QueryMenuDto,
  UpdateMenuDto,
} from './dto/index.js';
import { MenuService } from './menu.service.js';

/**
 * 菜单管理。
 *
 * - `GET /menus/available`：当前租户可用菜单树（登录即可读，供角色授权界面选树）；
 * - `GET /menus/tree` 与其余增改删：平台级维护，叠加 SuperAdminGuard（要求 isSuper 主体）。
 *   平台级端点由 SuperAdminGuard 控制，不再叠加 @RequirePermission（isSuper 会绕过功能权限）。
 */
@ApiTags('菜单管理')
@ApiBearerAuth()
@Controller('menus')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('available')
  @ApiOperation({ summary: '当前租户可用菜单树（按套餐许可集合）' })
  @ApiOkResponse({ description: '菜单树', type: MenuResponseDto, isArray: true })
  async available(): Promise<MenuResponseDto[]> {
    return this.menuService.availableTree();
  }

  @Get('tree')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: '平台全量菜单树（平台级）' })
  @ApiOkResponse({ description: '菜单树', type: MenuResponseDto, isArray: true })
  async tree(@Query() query: QueryMenuDto): Promise<MenuResponseDto[]> {
    return this.menuService.platformTree(query);
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  @OperLog({ module: '菜单管理', action: '创建菜单' })
  @ApiOperation({ summary: '创建菜单（平台级）' })
  @ApiCreatedResponse({ type: MenuResponseDto })
  async create(@Body() dto: CreateMenuDto): Promise<MenuResponseDto> {
    return this.menuService.create(dto);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @OperLog({ module: '菜单管理', action: '更新菜单' })
  @ApiOperation({ summary: '更新菜单（平台级）' })
  @ApiOkResponse({ type: MenuResponseDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateMenuDto,
  ): Promise<MenuResponseDto> {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @OperLog({ module: '菜单管理', action: '删除菜单' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除菜单（存在子菜单或被引用时拒绝）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.menuService.remove(id);
    return null;
  }
}
