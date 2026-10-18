import type { DataScope, RoleStatus } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 管理员可设置的角色状态（系统内置角色的状态变更由 Service 层拒绝） */
export const ASSIGNABLE_ROLE_STATUS = ['ACTIVE', 'DISABLED'] as const;
/** 数据权限档位（P0 两档，见 ADR-008） */
export const ASSIGNABLE_DATA_SCOPE = ['ALL', 'DEPT_AND_CHILD'] as const;

export class CreateRoleDto {
  @ApiProperty({ description: '角色名称', example: '部门管理员' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleName: string;

  @ApiProperty({ description: '角色编码（租户内唯一）', example: 'dept_manager' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleCode: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '数据权限档位', enum: ASSIGNABLE_DATA_SCOPE })
  @IsOptional()
  @IsIn(ASSIGNABLE_DATA_SCOPE)
  dataScope?: DataScope;

  @ApiPropertyOptional({ description: '角色状态', enum: ASSIGNABLE_ROLE_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLE_STATUS)
  status?: RoleStatus;
}
