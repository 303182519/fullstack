import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateDictTypeDto {
  @ApiProperty({ description: '字典名称', example: '用户性别' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dictName: string;

  @ApiProperty({ description: '字典类型键（创建后不可修改）', example: 'sys_user_gender' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][\w.-]*$/i, {
    message: 'dictType 须以字母开头，仅含字母/数字/下划线/点/中划线',
  })
  dictType: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
