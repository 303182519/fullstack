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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '@/common/decorators/index.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
// DTO 必须「值导入」：ValidationPipe 依赖 design:paramtypes 元数据。
import {
  ForceLogoutDto,
  LoginLogResponseDto,
  OnlineUserResponseDto,
  OperLogResponseDto,
  QueryLoginLogDto,
  QueryOnlineUserDto,
  QueryOperLogDto,
} from './dto/index.js';
import { LoginLogQueryService } from './login-log-query.service.js';
import { OnlineService } from './online.service.js';
import { OperLogQueryService } from './oper-log-query.service.js';

/**
 * 系统监控（P2）：操作日志 / 登录日志 / 在线用户。
 *
 * 作用域：租户管理员只读本租户数据；平台超管可读全部，
 * 日志查询可用 `?tenantId=` 收敛到单租户。
 */
@ApiTags('系统监控')
@ApiBearerAuth()
@Controller('oper-logs')
export class OperLogController {
  constructor(private readonly operLogQueryService: OperLogQueryService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MONITOR.OPER_LOG.QUERY)
  @ApiOperation({ summary: '操作日志分页查询' })
  @ApiOkResponse({ description: '分页结果', type: OperLogResponseDto, isArray: true })
  async list(
    @Query() query: QueryOperLogDto,
    @Query('tenantId') filterTenantId?: string,
  ) {
    return this.operLogQueryService.list(query, filterTenantId);
  }
}

@ApiTags('系统监控')
@ApiBearerAuth()
@Controller('login-logs')
export class LoginLogController {
  constructor(private readonly loginLogQueryService: LoginLogQueryService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MONITOR.LOGIN_LOG.QUERY)
  @ApiOperation({ summary: '登录日志分页查询' })
  @ApiOkResponse({ description: '分页结果', type: LoginLogResponseDto, isArray: true })
  async list(
    @Query() query: QueryLoginLogDto,
    @Query('tenantId') filterTenantId?: string,
  ) {
    return this.loginLogQueryService.list(query, filterTenantId);
  }
}

@ApiTags('系统监控')
@ApiBearerAuth()
@Controller('online-users')
export class OnlineController {
  constructor(private readonly onlineService: OnlineService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MONITOR.ONLINE.QUERY)
  @ApiOperation({ summary: '在线用户分页查询（按会话粒度）' })
  @ApiOkResponse({ description: '分页结果', type: OnlineUserResponseDto, isArray: true })
  async list(@Query() query: QueryOnlineUserDto) {
    return this.onlineService.list(query);
  }

  @Delete(':sessionId')
  @RequirePermission(PERMISSIONS.MONITOR.ONLINE.REMOVE)
  @OperLog({ module: '系统监控', action: '强制下线单个会话' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '强制下线单个会话' })
  async kick(@Param('sessionId') sessionId: string): Promise<null> {
    await this.onlineService.kick(sessionId);
    return null;
  }

  @Post('force-logout')
  @RequirePermission(PERMISSIONS.MONITOR.ONLINE.REMOVE)
  @OperLog({ module: '系统监控', action: '按用户强制下线全部设备' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '按用户强制下线全部设备' })
  async forceLogout(@Body() dto: ForceLogoutDto): Promise<null> {
    await this.onlineService.forceLogout(dto.userId);
    return null;
  }
}
