import { DictStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ASSIGNABLE_DICT_STATUS } from './update-dict-type.dto.js';

export class UpdateDictDataDto {
  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dictLabel?: string;

  @ApiPropertyOptional({ description: '排序值（越小越靠前）' })
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
