import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryMessageTemplateDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '模板键（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateKey?: string;

  @ApiPropertyOptional({ description: '通道', enum: ['INNER', 'EMAIL', 'SMS'] })
  @IsOptional()
  @IsEnum(['INNER', 'EMAIL', 'SMS'])
  channel?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  status?: string;
}
