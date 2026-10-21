import { ApiProperty } from '@nestjs/swagger';

export class MessageTemplateResponseDto {
  @ApiProperty({ description: '雪花 ID' })
  id: string;

  @ApiProperty({ description: '数据层级', enum: ['PLATFORM', 'TENANT'] })
  scope: 'PLATFORM' | 'TENANT';

  @ApiProperty({ description: '模板键' })
  templateKey: string;

  @ApiProperty({ description: '通道', enum: ['INNER', 'EMAIL', 'SMS'] })
  channel: string;

  @ApiProperty({ description: '邮件主题', nullable: true })
  subject: string | null;

  @ApiProperty({ description: '模板体' })
  content: string;

  @ApiProperty({ description: '状态', enum: ['ACTIVE', 'DISABLED'] })
  status: string;

  @ApiProperty({ description: '仅平台级行有意义：当前租户已建立同键模板时为 true（被遮蔽）' })
  shadowed: boolean;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;
}

/** 消费端模板（遮蔽解析后） */
export class EffectiveTemplateDto {
  @ApiProperty({ description: '模板键' })
  templateKey: string;

  @ApiProperty({ description: '通道', enum: ['INNER', 'EMAIL', 'SMS'] })
  channel: string;

  @ApiProperty({ description: '邮件主题', nullable: true })
  subject: string | null;

  @ApiProperty({ description: '模板体（已替换变量）' })
  content: string;
}
