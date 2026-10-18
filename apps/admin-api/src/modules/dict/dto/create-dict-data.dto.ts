import { DictStatus } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ASSIGNABLE_DICT_STATUS } from './update-dict-type.dto.js';

export class CreateDictDataDto {
  @ApiProperty({ description: '所属字典类型键', example: 'sys_user_gender' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dictType: string;

  @ApiProperty({ description: '显示名', example: '男' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dictLabel: string;

  @ApiProperty({ description: '存储值', example: 'MALE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dictValue: string;

  @ApiPropertyOptional({ description: '排序值（越小越靠前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional({ description: '状态', enum: ASSIGNABLE_DICT_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_DICT_STATUS)
  status?: DictStatus;
}
