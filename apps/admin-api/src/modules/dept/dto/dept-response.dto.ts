import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 部门树节点 */
export class DeptResponseDto {
  @ApiProperty({ description: '部门 ID' })
  id: string;

  @ApiPropertyOptional({ description: '上级部门 ID（null=根部门）' })
  parentId: string | null;

  @ApiProperty({ description: '部门名称' })
  deptName: string;

  @ApiPropertyOptional({ description: '负责人' })
  leader: string | null;

  @ApiPropertyOptional({ description: '联系电话' })
  phone: string | null;

  @ApiProperty({ description: '物化路径，如 /1/3/5/' })
  path: string;

  @ApiProperty({ description: '排序值' })
  sort: number;

  @ApiProperty({ description: '部门状态', enum: ['ACTIVE', 'DISABLED'] })
  status: string;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;

  @ApiProperty({ description: '子部门', type: () => [DeptResponseDto] })
  children: DeptResponseDto[];
}
