import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateConfigDto {
  @ApiProperty({ description: '参数名称', example: '是否开启验证码' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  configName: string;

  @ApiProperty({ description: '参数键（创建后不可修改）', example: 'sys.account.captchaEnabled' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][\w.-]*$/i, {
    message: 'configKey 须以字母开头，仅含字母/数字/下划线/点/中划线',
  })
  configKey: string;

  @ApiProperty({ description: '参数值', example: 'true' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  configValue: string;

  @ApiPropertyOptional({ description: '是否内置参数（内置参数不允许删除；一般由平台预置时设置）', default: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
