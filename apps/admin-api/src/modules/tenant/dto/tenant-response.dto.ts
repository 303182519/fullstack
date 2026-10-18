import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 租户列表 / 详情项（平台级视图） */
export class TenantResponseDto {
  @ApiProperty({ description: '租户 ID' })
  id: string;

  @ApiProperty({ description: '租户编码（登录入口）' })
  tenantCode: string;

  @ApiProperty({ description: '租户名称' })
  tenantName: string;

  @ApiPropertyOptional({ description: '租户专属域名' })
  domain?: string | null;

  @ApiPropertyOptional({ description: 'LOGO URL' })
  logo?: string | null;

  @ApiPropertyOptional({ description: '联系人' })
  contactName?: string | null;

  @ApiPropertyOptional({ description: '联系电话' })
  contactPhone?: string | null;

  @ApiProperty({ description: '租户状态', enum: ['ACTIVE', 'DISABLED', 'EXPIRED'] })
  status: string;

  @ApiPropertyOptional({ description: '过期时间（ISO 8601，null=永久有效）' })
  expireTime?: string | null;

  @ApiPropertyOptional({ description: '关联套餐 ID（P1 启用）' })
  packageId?: string | null;

  @ApiProperty({ description: '用户数上限' })
  userLimit: number;

  @ApiProperty({ description: '存储上限（字节）' })
  storageLimit: string;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
