import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryUserMessageDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '标题（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '来源分类', example: 'system' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: '只看未读' })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}
