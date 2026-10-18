import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfigDto {
  @ApiPropertyOptional({ description: '参数名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  configName?: string;

  @ApiPropertyOptional({ description: '参数值' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  configValue?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional({ description: '是否内置参数' })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
