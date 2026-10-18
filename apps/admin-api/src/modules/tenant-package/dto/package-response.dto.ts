import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 租户套餐（平台级） */
export class PackageResponseDto {
  @ApiProperty({ description: '套餐 ID' })
  id: string;

  @ApiProperty({ description: '套餐名称' })
  packageName: string;

  @ApiProperty({ description: '套餐编码（全局唯一）' })
  packageCode: string;

  @ApiPropertyOptional({ description: '套餐描述' })
  description: string | null;

  @ApiProperty({ description: '套餐状态', enum: ['ACTIVE', 'DISABLED'] })
  status: string;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
