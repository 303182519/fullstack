import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleBriefDto } from '@/modules/auth/dto/auth-response.dto.js';

/** 用户列表项（含角色摘要） */
export class UserListItemDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '昵称' })
  nickname?: string | null;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string | null;

  @ApiPropertyOptional({ description: '手机号' })
  phone?: string | null;

  @ApiPropertyOptional({ description: '头像 URL' })
  avatar?: string | null;

  @ApiProperty({ description: '账号状态' })
  status: string;

  @ApiProperty({ description: '是否平台超级管理员' })
  isSuper: boolean;

  @ApiPropertyOptional({ description: '所属部门 ID（null=未分配部门）' })
  deptId?: string | null;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;

  @ApiProperty({ description: '角色摘要', type: [RoleBriefDto] })
  roles: RoleBriefDto[];
}

/** 用户详情 */
export class UserDetailDto extends UserListItemDto {
  @ApiPropertyOptional({ description: '性别' })
  gender?: string | null;

  @ApiPropertyOptional({ description: '备注' })
  remark?: string | null;

  @ApiProperty({ description: '角色 ID 列表', type: [String] })
  roleIds: string[];
}
