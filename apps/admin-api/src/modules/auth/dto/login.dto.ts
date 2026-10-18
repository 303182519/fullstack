import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** 账号密码登录入参 */
export class LoginDto {
  @ApiProperty({ description: '租户编码', example: 'default' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tenantCode: string;

  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ description: '密码', example: 'Admin@123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ description: '图形验证码 ID（连续失败 3 次后必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  captchaId?: string;

  @ApiPropertyOptional({ description: '图形验证码答案' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  captchaText?: string;

  @ApiPropertyOptional({
    description: '设备标识，仅用于在线会话展示与审计',
    example: 'Chrome / Windows',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  device?: string;
}
