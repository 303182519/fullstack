import type { DeptStatus } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** 管理员可设置的部门状态 */
export const ASSIGNABLE_DEPT_STATUS = ['ACTIVE', 'DISABLED'] as const;

export class CreateDeptDto {
  @ApiPropertyOptional({ description: '上级部门 ID（不传或空表示根部门）' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: '部门名称', example: '研发中心' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  deptName: string;

  @ApiPropertyOptional({ description: '负责人' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  leader?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '排序值（越小越靠前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '部门状态', enum: ASSIGNABLE_DEPT_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_DEPT_STATUS)
  status?: DeptStatus;
}
