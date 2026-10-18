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
 * 鉴权：全局 JwtAuthGuard + 按钮级 @RequirePermission（P2 收敛启用，见 ADR-008 D1）；
 * 租户隔离在 Service 层用「当前登录主体 tenantId」强制约束。
 */
@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SYSTEM.USER.QUERY)
  @ApiOperation({ summary: '分页查询本租户用户' })
  @ApiOkResponse({ description: '分页结果 { items, total, page, pageSize }', type: UserListItemDto, isArray: true })
  async list(@Query() query: QueryUserDto) {
    return this.userService.list(query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SYSTEM.USER.ADD)
  @OperLog({ module: '用户管理', action: '创建用户' })
  @ApiOperation({ summary: '创建用户' })
  @ApiCreatedResponse({ type: UserDetailDto })
  async create(@Body() dto: CreateUserDto): Promise<UserDetailDto> {
    return this.userService.create(dto);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.USER.QUERY)
  @ApiOperation({ summary: '用户详情' })
  @ApiOkResponse({ type: UserDetailDto })
  async detail(
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<UserDetailDto> {
    return this.userService.detail(id);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.USER.EDIT)
  @OperLog({ module: '用户管理', action: '更新用户' })
  @ApiOperation({ summary: '更新用户（含改密与角色重绑定）' })
  @ApiOkResponse({ type: UserDetailDto })
  async update(
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDetailDto> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SYSTEM.USER.REMOVE)
  @OperLog({ module: '用户管理', action: '删除用户' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除用户（软删除，强制下线并解绑角色）' })
  async remove(@Param('id', ParseSnowflakePipe) id: bigint): Promise<null> {
    await this.userService.remove(id);
    return null;
  }
}
