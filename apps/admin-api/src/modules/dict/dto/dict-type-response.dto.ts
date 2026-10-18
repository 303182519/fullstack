import { DictStatus } from '@fedstack/database';
import { ApiProperty } from '@nestjs/swagger';

/** 字典数据条目（消费端选项视图） */
export class DictOptionDto {
  @ApiProperty({ description: '显示名' })
  dictLabel: string;

  @ApiProperty({ description: '存储值' })
  dictValue: string;

  @ApiProperty({ description: '排序值' })
  sort: number;
}

export class DictTypeResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'], example: 'PLATFORM' })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '字典名称' })
  dictName: string;

  @ApiProperty({ description: '字典类型键' })
  dictType: string;

  @ApiProperty({ description: '备注', nullable: true })
  remark: string | null;

  @ApiProperty({ description: '状态', enum: ['ACTIVE', 'DISABLED'] })
  status: DictStatus;

  @ApiProperty({
    description: '仅平台级行有意义：当前租户已建立同名定义时为 true（该平台定义被遮蔽）',
  })
  shadowed: boolean;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
