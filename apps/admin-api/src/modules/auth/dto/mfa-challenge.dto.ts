import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * MFA 登录二步挑战入参（P3b，ADR-013 D8）。
 *
 * 密码校验通过且用户已启用 MFA 时，`/auth/login` 返回 `MfaPendingDto`，
 * 客户端提交本 DTO 完成二次验证后签发正式令牌。
 */
export class MfaChallengeDto {
  @ApiProperty({ description: 'MFA 待验令牌（登录接口返回，5 分钟有效期，一次性）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  pendingToken: string;

  @ApiProperty({
    description: 'TOTP 验证码（6 位）或恢复码（8 位十六进制大写）',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 8)
  code: string;

  @ApiPropertyOptional({
    description: '设备标识，仅用于在线会话展示与审计',
    example: 'Chrome / Windows',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  device?: string;
}
