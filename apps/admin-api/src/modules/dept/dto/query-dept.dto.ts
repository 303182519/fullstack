import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryDeptDto {
  @ApiPropertyOptional({ description: '部门名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deptName?: string;

  @ApiPropertyOptional({ description: '部门状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
