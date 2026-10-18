import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryRoleDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '角色名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleName?: string;

  @ApiPropertyOptional({ description: '角色编码（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleCode?: string;

  @ApiPropertyOptional({ description: '角色状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
