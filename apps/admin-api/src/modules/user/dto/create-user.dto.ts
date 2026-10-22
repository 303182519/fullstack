import type { Gender, UserStatus } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** 管理员可设置的状态（不含 LOCKED——锁定态由登录安全策略在运行时决定） */
export const ASSIGNABLE_USER_STATUS = ['ACTIVE', 'DISABLED'] as const;
export const ASSIGNABLE_GENDER = ['MALE', 'FEMALE', 'UNKNOWN'] as const;

export class CreateUserDto {
  @ApiProperty({ description: '用户名（租户内唯一）', example: 'zhangsan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ description: '初始密码（需满足复杂度策略）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ description: '邮箱（租户内唯一）' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @ApiPropertyOptional({ description: '性别', enum: ASSIGNABLE_GENDER })
  @IsOptional()
  // 白名单，防御未来 enum 扩展导致的未知值
  @IsIn(ASSIGNABLE_GENDER)
  gender?: Gender;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional({ description: '账号状态', enum: ASSIGNABLE_USER_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_USER_STATUS)
  status?: UserStatus;

  @ApiPropertyOptional({ description: '角色 ID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ description: '所属部门 ID（须为本租户且在数据权限范围内）' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: '部门 ID 必须为数字字符串' })
  deptId?: string;
}
