import { LoginLogStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryLoginLogDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '用户名（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: '结果状态', enum: ['SUCCESS', 'FAILURE'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  status?: LoginLogStatus;

  @ApiPropertyOptional({ description: '起始时间（含，ISO 8601）' })
  @IsOptional()
  @IsISO8601()
  beginTime?: string;

  @ApiPropertyOptional({ description: '结束时间（含，ISO 8601）' })
  @IsOptional()
  @IsISO8601()
  endTime?: string;
}
