import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryPackageDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '套餐名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  packageName?: string;

  @ApiPropertyOptional({ description: '套餐编码（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  packageCode?: string;

  @ApiPropertyOptional({ description: '套餐状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
