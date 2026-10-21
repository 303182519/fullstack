import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageTemplateDto {
  @ApiProperty({ description: '模板键（创建后不可修改）', example: 'notice.publish' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateKey: string;

  @ApiProperty({ description: '通道', enum: ['INNER', 'EMAIL', 'SMS'] })
  @IsEnum(['INNER', 'EMAIL', 'SMS'])
  channel: string;

  @ApiPropertyOptional({ description: '邮件主题（仅 EMAIL 通道）', example: '您有新的通知' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({ description: '模板体（支持 {{var}} 占位）' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: '状态', enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  status?: string;
}
