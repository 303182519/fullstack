import { ApiProperty } from '@nestjs/swagger';

export class UserMessageResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '消息标题' })
  title: string;

  @ApiProperty({ description: '消息内容' })
  content: string;

  @ApiProperty({ description: '来源分类', nullable: true })
  category: string | null;

  @ApiProperty({ description: '来源对象类型', nullable: true })
  sourceType: string | null;

  @ApiProperty({ description: '来源对象主键', nullable: true })
  sourceId: string | null;

  @ApiProperty({ description: '是否已读' })
  read: boolean;

  @ApiProperty({ description: '已读时间', nullable: true })
  readAt: string | null;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}
