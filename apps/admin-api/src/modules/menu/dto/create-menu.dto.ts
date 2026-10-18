import type { MenuStatus, MenuType } from '@fedstack/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** 管理员可设置的菜单类型（三级，见 ADR-008 D1） */
export const ASSIGNABLE_MENU_TYPE = ['DIRECTORY', 'MENU', 'BUTTON'] as const;
export const ASSIGNABLE_MENU_STATUS = ['ACTIVE', 'DISABLED'] as const;

export class CreateMenuDto {
  @ApiPropertyOptional({ description: '父菜单 ID（不传或空表示根节点）' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: '菜单类型', enum: ASSIGNABLE_MENU_TYPE })
  @IsIn(ASSIGNABLE_MENU_TYPE)
  menuType: MenuType;

  @ApiProperty({ description: '菜单名称', example: '用户管理' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  menuName: string;

  @ApiPropertyOptional({ description: '前端路由 name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  routeName?: string;

  @ApiPropertyOptional({ description: '前端路由 path' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  routePath?: string;

  @ApiPropertyOptional({ description: '前端组件路径' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  component?: string;

  @ApiPropertyOptional({ description: '权限编码（BUTTON 类型必填），如 system:user:add' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  permCode?: string;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: '排序值（越小越靠前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '是否可见', default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ description: '菜单状态', enum: ASSIGNABLE_MENU_STATUS })
  @IsOptional()
  @IsIn(ASSIGNABLE_MENU_STATUS)
  status?: MenuStatus;
}
