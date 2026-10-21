import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMessageTemplateDto {
  @ApiPropertyOptional({ description: '邮件主题（仅 EMAIL 通道）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ description: '模板体' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  status?: string;
}
