import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

/** MFA 绑定请求（TOTP 验证码） */
export class BindMfaDto {
  @ApiProperty({ description: 'TOTP 验证码（6 位）', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

/** MFA 解绑请求（已启用：TOTP 验证码或恢复码；绑定中：可省略） */
export class UnbindMfaDto {
  @ApiPropertyOptional({
    description: 'TOTP 验证码（6 位）或恢复码（8 位）；解绑已启用的 MFA 时必填，绑定中记录可省略',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;
}
