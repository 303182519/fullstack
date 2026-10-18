import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForceLogoutDto {
  @ApiProperty({ description: '目标用户 ID（雪花）', example: '1234567890123456789' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  userId: string;
}

export class OnlineUserResponseDto {
  @ApiProperty({ description: '会话 ID' })
  sessionId: string;

  @ApiProperty({ description: '用户 ID' })
  userId: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '设备标识' })
  device: string;

  @ApiProperty({ description: '登录 IP', nullable: true })
  ip: string | null;

  @ApiProperty({ description: '登录时间（ISO 8601）' })
  createdAt: string;

  @ApiProperty({ description: '过期时间（ISO 8601）' })
  expiresAt: string;
}

export class OperLogResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '操作人用户 ID' })
  userId: string;

  @ApiProperty({ description: '操作人用户名（快照）' })
  username: string;

  @ApiProperty({ description: '业务模块' })
  module: string;

  @ApiProperty({ description: '动作名' })
  action: string;

  @ApiProperty({ description: 'HTTP 方法' })
  method: string;

  @ApiProperty({ description: '请求路径' })
  path: string;

  @ApiProperty({ description: '来源 IP', nullable: true })
  ip: string | null;

  @ApiProperty({ description: '请求参数（敏感字段已掩码）', nullable: true })
  params: unknown;

  @ApiProperty({ description: '响应结果（截断）', nullable: true })
  result: unknown;

  @ApiProperty({ description: '结果状态', enum: ['SUCCESS', 'FAILURE'] })
  status: string;

  @ApiProperty({ description: '失败原因摘要', nullable: true })
  errorMsg: string | null;

  @ApiProperty({ description: '耗时毫秒' })
  costMs: number;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}

export class LoginLogResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '租户 ID（租户解析失败为 0）' })
  tenantId: string;

  @ApiProperty({ description: '关联用户 ID（登录成功才有）', nullable: true })
  userId: string | null;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '来源 IP', nullable: true })
  ip: string | null;

  @ApiProperty({ description: '设备标识', nullable: true })
  device: string | null;

  @ApiProperty({ description: '结果状态', enum: ['SUCCESS', 'FAILURE'] })
  status: string;

  @ApiProperty({ description: '结果枚举 token（见 LoginMsg）', example: 'SUCCESS' })
  msg: string;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
