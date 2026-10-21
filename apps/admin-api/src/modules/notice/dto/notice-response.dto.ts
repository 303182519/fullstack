import { ApiProperty } from '@nestjs/swagger';

export class NoticeResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'] })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '公告标题' })
  title: string;

  @ApiProperty({ description: '公告内容' })
  content: string;

  @ApiProperty({ description: '公告类型', enum: ['NOTICE', 'BULLETIN'] })
  type: string;

  @ApiProperty({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'CLOSED'] })
  status: string;

  @ApiProperty({ description: '发布人姓名快照', nullable: true })
  publisherName: string | null;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}

/** 消费端公告（已发布，两级合并） */
export class NoticePublicDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '公告标题' })
  title: string;

  @ApiProperty({ description: '公告内容' })
  content: string;

  @ApiProperty({ description: '公告类型', enum: ['NOTICE', 'BULLETIN'] })
  type: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'] })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '发布人姓名快照', nullable: true })
  publisherName: string | null;

  @ApiProperty({ description: '发布时间（ISO 8601）' })
  publishedAt: string;
}
