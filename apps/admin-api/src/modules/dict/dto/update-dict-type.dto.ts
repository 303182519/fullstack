import { DictStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const ASSIGNABLE_DICT_STATUS = ['ACTIVE', 'DISABLED'] as const;

export class UpdateDictTypeDto {
  @ApiPropertyOptional({ description: '字典名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dictName?: string;

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
