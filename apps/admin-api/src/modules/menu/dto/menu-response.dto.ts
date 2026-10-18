import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 菜单树节点 */
export class MenuResponseDto {
  @ApiProperty({ description: '菜单 ID' })
  id: string;

  @ApiPropertyOptional({ description: '父菜单 ID（null=根节点）' })
  parentId: string | null;

  @ApiProperty({ description: '菜单类型', enum: ['DIRECTORY', 'MENU', 'BUTTON'] })
  menuType: string;

  @ApiProperty({ description: '菜单名称' })
  menuName: string;

  @ApiPropertyOptional({ description: '前端路由 name' })
  routeName: string | null;

  @ApiPropertyOptional({ description: '前端路由 path' })
  routePath: string | null;

  @ApiPropertyOptional({ description: '前端组件路径' })
  component: string | null;

  @ApiPropertyOptional({ description: '权限编码' })
  permCode: string | null;

  @ApiPropertyOptional({ description: '图标' })
  icon: string | null;

  @ApiProperty({ description: '排序值' })
  sort: number;

  @ApiProperty({ description: '是否可见' })
  visible: boolean;

  @ApiProperty({ description: '菜单状态', enum: ['ACTIVE', 'DISABLED'] })
  status: string;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;

  @ApiProperty({ description: '子菜单', type: () => [MenuResponseDto] })
  children: MenuResponseDto[];
}
