import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

/**
 * 更新用户入参：全部字段可选。
 *
 * 复用 CreateUserDto 的校验规则（复杂度、长度、枚举值），避免规则漂移；
 * password 传入即代表改密（服务端会做密码历史复用校验）。
 * deptId 先 Omit 再以可空类型重新声明：传 null 表示把用户移出部门（创建时只允许具体部门 ID）。
 */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['deptId'] as const)) {
  @ApiPropertyOptional({
    description: '所属部门 ID；传 null 表示移出部门（须为本租户且在数据权限范围内）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: '部门 ID 必须为数字字符串' })
  deptId?: string | null;
}
