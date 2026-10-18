import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 角色列表 / 详情项 */
export class RoleResponseDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  roleName: string;

  @ApiProperty({ description: '角色编码' })
  roleCode: string;

  @ApiPropertyOptional({ description: '角色描述' })
  description?: string | null;

  @ApiProperty({ description: '数据权限档位', enum: ['ALL', 'DEPT_AND_CHILD'] })
  dataScope: string;

  @ApiProperty({ description: '角色状态', enum: ['ACTIVE', 'DISABLED'] })
  status: string;

  @ApiProperty({ description: '是否系统内置角色（不可删改码）' })
  isSystem: boolean;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
