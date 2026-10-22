import { JobRunStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryJobDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '任务名（精确匹配，如 message-send）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ description: '任务状态', enum: JobRunStatus })
  @IsOptional()
  // 查询用`@IsEnum` 是因为全量都合法 。全量，所有值都是有效过滤条件
  @IsEnum(JobRunStatus)
  status?: JobRunStatus;
}
