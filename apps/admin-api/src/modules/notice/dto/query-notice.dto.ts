import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryNoticeDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '标题（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '公告类型', enum: ['NOTICE', 'BULLETIN'] })
  @IsOptional()
  @IsEnum(['NOTICE', 'BULLETIN'])
  type?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'CLOSED'] })
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED', 'CLOSED'])
  status?: string;
}
