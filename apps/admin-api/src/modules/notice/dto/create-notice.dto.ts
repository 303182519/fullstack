import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNoticeDto {
  @ApiProperty({ description: '公告标题', example: '系统维护通知' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: '公告内容（富文本 / Markdown）' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: '公告类型', enum: ['NOTICE', 'BULLETIN'], default: 'NOTICE' })
  @IsOptional()
  @IsEnum(['NOTICE', 'BULLETIN'])
  type?: string;
}
