import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

export class QueryUserDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '用户名（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ description: '昵称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ description: '账号状态', enum: ['ACTIVE', 'DISABLED', 'LOCKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED', 'LOCKED'])
  status?: 'ACTIVE' | 'DISABLED' | 'LOCKED';
}
