import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryTenantDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '租户编码（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantCode?: string;

  @ApiPropertyOptional({ description: '租户名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantName?: string;

  @ApiPropertyOptional({
    description: '租户状态',
    enum: ['ACTIVE', 'DISABLED', 'EXPIRED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED', 'EXPIRED'])
  status?: 'ACTIVE' | 'DISABLED' | 'EXPIRED';
}
