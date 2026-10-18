import type { PackageStatus } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 平台可设置的套餐状态 */
export const ASSIGNABLE_PACKAGE_STATUS = ['ACTIVE', 'DISABLED'] as const;

export class CreatePackageDto {
  @ApiProperty({ description: '套餐名称', example: '标准版' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  packageName: string;

  @ApiProperty({ description: '套餐编码（全局唯一）', example: 'standard' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  packageCode: string;

  @ApiPropertyOptional({ description: '套餐描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '套餐状态', enum: ASSIGNABLE_PACKAGE_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_PACKAGE_STATUS)
  status?: PackageStatus;
}
