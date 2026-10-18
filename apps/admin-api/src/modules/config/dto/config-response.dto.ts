import { ApiProperty } from '@nestjs/swagger';

export class ConfigResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'] })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '参数名称' })
  configName: string;

  @ApiProperty({ description: '参数键' })
  configKey: string;

  @ApiProperty({ description: '参数值' })
  configValue: string;

  @ApiProperty({ description: '是否内置参数（不允许删除）' })
  isSystem: boolean;

  @ApiProperty({ description: '备注', nullable: true })
  remark: string | null;

  @ApiProperty({
    description: '仅平台级行有意义：当前租户已建立同键定义时为 true（该平台参数被遮蔽）',
  })
  shadowed: boolean;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}

/** 消费端取值返回体 */
export class ConfigValueResponseDto {
  @ApiProperty({ description: '参数键' })
  configKey: string;

  @ApiProperty({ description: '有效参数值' })
  value: string;

  @ApiProperty({ description: '取值来源', enum: ['PLATFORM', 'TENANT'] })
  source: 'PLATFORM' | 'TENANT';
}
