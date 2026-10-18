import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryMenuDto {
  @ApiPropertyOptional({ description: '菜单名称（模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  menuName?: string;

  @ApiPropertyOptional({ description: '菜单类型', enum: ['DIRECTORY', 'MENU', 'BUTTON'] })
  @IsOptional()
  @IsIn(['DIRECTORY', 'MENU', 'BUTTON'])
  menuType?: 'DIRECTORY' | 'MENU' | 'BUTTON';

  @ApiPropertyOptional({ description: '菜单状态', enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
