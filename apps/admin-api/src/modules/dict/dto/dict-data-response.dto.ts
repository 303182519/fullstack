import { DictStatus } from '@fedstack/database';
import { ApiProperty } from '@nestjs/swagger';

export class DictDataResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'] })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '所属字典类型键' })
  dictType: string;

  @ApiProperty({ description: '显示名' })
  dictLabel: string;

  @ApiProperty({ description: '存储值' })
  dictValue: string;

  @ApiProperty({ description: '排序值' })
  sort: number;

  @ApiProperty({ description: '备注', nullable: true })
  remark: string | null;

  @ApiProperty({ description: '状态', enum: ['ACTIVE', 'DISABLED'] })
  status: DictStatus;

  @ApiProperty({
    description: '仅平台级行有意义：当前租户已建立同类型定义时为 true（该平台数据被遮蔽）',
  })
  shadowed: boolean;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
