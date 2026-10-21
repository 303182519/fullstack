import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNoticeDto {
  @ApiPropertyOptional({ description: '公告标题' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '公告内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '公告类型', enum: ['NOTICE', 'BULLETIN'] })
  @IsOptional()
  @IsEnum(['NOTICE', 'BULLETIN'])
  type?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'CLOSED'] })
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED', 'CLOSED'])
  status?: string;
}
