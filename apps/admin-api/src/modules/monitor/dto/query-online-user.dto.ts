import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryOnlineUserDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '用户名（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: '设备（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  device?: string;
}

/** 按用户全设备下线（强制登出） */
export class ForceLogoutDto {
  @ApiProperty({ description: '目标用户 ID（雪花 ID 数字串）' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
