import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 图形验证码应答 */
export class CaptchaResponseDto {
  @ApiProperty({ description: '验证码 ID（登录时回传）' })
  captchaId: string;

  @ApiProperty({ description: 'SVG 图片字符串' })
  svg: string;

  @ApiProperty({ description: '答案有效期（秒）' })
  expiresIn: number;
}

/** 登录 / 刷新成功应答：access token 走响应体，refresh token 走 HttpOnly Cookie */
export class TokenResponseDto {
  @ApiProperty({ description: '访问令牌' })
  accessToken: string;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: '访问令牌有效期（秒）' })
  expiresIn: number;
}

/**
 * MFA 待验应答（P3b，ADR-013 D8）。
 *
 * 密码校验通过但用户已启用 MFA 时，`/auth/login` 返回本结构代替 `TokenResponseDto`。
 * 客户端应引导用户输入 TOTP 验证码或恢复码，调用 `/auth/mfa/verify` 完成二次验证。
 */
export class MfaPendingDto {
  @ApiProperty({ description: '恒为 true，标识需要 MFA 二次验证', example: true })
  mfaRequired: true;

  @ApiProperty({ description: 'MFA 待验令牌（5 分钟有效期，一次性消费）' })
  pendingToken: string;

  @ApiProperty({ description: 'pendingToken 有效期（秒）' })
  expiresIn: number;
}

/** 角色摘要（个人资料中展示） */
export class RoleBriefDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  roleName: string;

  @ApiProperty({ description: '角色编码' })
  roleCode: string;

  @ApiProperty({ description: '数据权限档位', enum: ['ALL', 'DEPT_AND_CHILD'] })
  dataScope: string;
}

/** 当前用户资料 */
export class ProfileResponseDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '昵称' })
  nickname?: string | null;

  @ApiPropertyOptional({ description: '头像 URL' })
  avatar?: string | null;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string | null;

  @ApiPropertyOptional({ description: '手机号' })
  phone?: string | null;

  @ApiPropertyOptional({ description: '性别', enum: ['MALE', 'FEMALE', 'UNKNOWN'] })
  gender?: string | null;

  @ApiProperty({ description: '账号状态' })
  status: string;

  @ApiProperty({ description: '是否平台超级管理员' })
  isSuper: boolean;

  @ApiProperty({ description: '角色列表', type: [RoleBriefDto] })
  roles: RoleBriefDto[];
}
