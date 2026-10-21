import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import {
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
import { CurrentUser } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { QueryUserMessageDto, UserMessageResponseDto } from './dto/index.js';
import { UserMessageService } from './user-message.service.js';

/**
 * 站内信自助端点（ADR-013 D9）。
 *
 * 仅需认证，无权限码；所有操作限定 `userId = currentUser`。
 */
@ApiTags('站内信')
@ApiBearerAuth()
@Controller('user-messages')
export class UserMessageController {
  constructor(private readonly userMessageService: UserMessageService) {}

  @Get()
  @ApiOperation({ summary: '消息列表（分页）' })
  @ApiOkResponse({ description: '分页结果', type: UserMessageResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: QueryUserMessageDto,
  ) {
    return this.userMessageService.list(principal, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '未读消息数' })
  async unreadCount(@CurrentUser() principal: AuthPrincipal) {
    return this.userMessageService.unreadCount(principal);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记已读' })
  async markRead(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseSnowflakePipe) id: bigint,
  ) {
    return this.userMessageService.markRead(principal, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '全部标记已读' })
  async markAllRead(@CurrentUser() principal: AuthPrincipal) {
    return this.userMessageService.markAllRead(principal);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除消息（软删）' })
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseSnowflakePipe) id: bigint,
  ) {
    return this.userMessageService.remove(principal, id);
  }
}
