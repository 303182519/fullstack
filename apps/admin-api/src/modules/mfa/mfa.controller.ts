import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/index.js';
import { BindMfaDto, MfaSetupDto, MfaStatusDto, UnbindMfaDto } from './dto/index.js';
import { MfaService } from './mfa.service.js';

/**
 * MFA 自助管理端点（P3b，ADR-013 D8）。
 *
 * 全部端点仅需认证（无按钮级权限码）；策略开关（`security.mfa.mode`）
 * 只影响登录链路是否强制二步，不影响用户自助绑定/解绑。
 */
@ApiTags('MFA')
@ApiBearerAuth()
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get('status')
  @ApiOperation({ summary: '查询当前用户 MFA 状态' })
  @ApiOkResponse({ type: MfaStatusDto })
  status(@CurrentUser() user: AuthPrincipal): Promise<MfaStatusDto> {
    return this.mfaService.status(user);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发起 MFA 绑定（生成 otpauth URI 与恢复码）' })
  @ApiOkResponse({ type: MfaSetupDto })
  setup(@CurrentUser() user: AuthPrincipal): Promise<MfaSetupDto> {
    return this.mfaService.setup(user);
  }

  @Post('bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证首码，完成 MFA 绑定' })
  bind(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: BindMfaDto,
  ): Promise<void> {
    return this.mfaService.bind(user, dto);
  }

  @Post('unbind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解绑 MFA（需 TOTP 或恢复码验证）' })
  unbind(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: UnbindMfaDto,
  ): Promise<void> {
    return this.mfaService.unbind(user, dto);
  }

  @Post('recovery-codes/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置恢复码（需 TOTP 验证）' })
  resetRecoveryCodes(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: BindMfaDto,
  ): Promise<{ codes: string[] }> {
    return this.mfaService.resetRecoveryCodes(user, dto);
  }
}
