import { OperLogStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryOperLogDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '业务模块（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;

  @ApiPropertyOptional({ description: '操作人用户名（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: '结果状态', enum: ['SUCCESS', 'FAILURE'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  status?: OperLogStatus;

  @ApiPropertyOptional({ description: '起始时间（含，ISO 8601）' })
  @IsOptional()
  @IsISO8601()
  beginTime?: string;

  @ApiPropertyOptional({ description: '结束时间（含，ISO 8601）' })
  @IsOptional()
  @IsISO8601()
  endTime?: string;
}
