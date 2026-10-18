import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto.js';

/**
 * 更新角色入参（所有字段可选）。
 * 说明：roleCode 的可变性由 Service 依据 isSystem 判定（系统内置角色禁止改码）。
 * isSystem 本身不开放给客户端设置。
 */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
