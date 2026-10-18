import { DictStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';
import { ASSIGNABLE_DICT_STATUS } from './update-dict-type.dto.js';

export class QueryDictTypeDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '字典名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dictName?: string;

  @ApiPropertyOptional({ description: '字典类型键（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dictType?: string;

  @ApiPropertyOptional({ description: '状态', enum: ASSIGNABLE_DICT_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_DICT_STATUS)
  status?: DictStatus;
}
