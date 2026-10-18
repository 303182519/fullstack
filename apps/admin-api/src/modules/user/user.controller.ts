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
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据，
// import type 会把元数据擦成 Object 导致校验失效；@ApiOkResponse({ type }) 也需要类引用。
import {
  CreateUserDto,
  QueryUserDto,
  UpdateUserDto,
  UserDetailDto,
  UserListItemDto,
} from './dto/index.js';
import { UserService } from './user.service.js';

/**
 * 用户管理（租户内）。
 *
 * 鉴权：由全局 JwtAuthGuard 保护，租户隔离在 Service 层用「当前登录主体 tenantId」强制约束。
 * 缺口：P0 尚未引入权限编码（菜单/按钮级）校验，登录用户即可管理本租户用户；
 * 按钮级权限由 P1 角色授权补齐（见路线图 §4）。
 */
@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '分页查询本租户用户' })
  @ApiOkResponse({ description: '分页结果 { items, total, page, pageSize }', type: UserListItemDto, isArray: true })
  async list(@Query() query: QueryUserDto) {
    return this.userService.list(query);
  }

  @Post()
  @ApiOperation({ summary: '创建用户' })
  @ApiCreatedResponse({ type: UserDetailDto })
  async create(@Body() dto: CreateUserDto): Promise<UserDetailDto> {
    return this.userService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  @ApiOkResponse({ type: UserDetailDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<UserDetailDto> {
    return this.userService.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户（含改密与角色重绑定）' })
  @ApiOkResponse({ type: UserDetailDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDetailDto> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除用户（软删除，强制下线并解绑角色）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.userService.remove(id);
    return null;
  }
}
