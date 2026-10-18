import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryConfigDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '参数名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  configName?: string;

  @ApiPropertyOptional({ description: '参数键（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  configKey?: string;
}
