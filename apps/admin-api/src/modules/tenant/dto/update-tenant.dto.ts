import type { TenantStatus } from '@fedstack/database';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** 平台运维可设置的租户状态（EXPIRED 允许手动置为过期） */
export const ASSIGNABLE_TENANT_STATUS = ['ACTIVE', 'DISABLED', 'EXPIRED'] as const;

/**
 * 更新租户入参（平台级）。
 *
 * 注意：tenantCode 是登录入口标识，属不可变字段，刻意不开放修改（改码会切断既有登录路径）。
 */
export class UpdateTenantDto {
  @ApiPropertyOptional({ description: '租户名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantName?: string;

  @ApiPropertyOptional({ description: '租户专属域名' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ description: 'LOGO URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo?: string;

  @ApiPropertyOptional({ description: '联系人' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ description: '租户状态', enum: ASSIGNABLE_TENANT_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_TENANT_STATUS)
  status?: TenantStatus;

  @ApiPropertyOptional({ description: '过期时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  expireTime?: string;

  @ApiPropertyOptional({
    description: '关联套餐 ID；传 null 表示解除套餐绑定（不传则保持原值）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: '套餐 ID 必须为数字字符串' })
  packageId?: string | null;

  @ApiPropertyOptional({ description: '用户数上限', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  userLimit?: number;

  @ApiPropertyOptional({
    description: '存储上限（字节）；使用 JS number 承载（配额量级远低于 2^53）',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storageLimit?: number;
}
