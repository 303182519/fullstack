import { PartialType } from '@nestjs/swagger';
import { CreateDeptDto } from './create-dept.dto.js';

/**
 * 更新部门入参：全部字段可选。
 * parentId 变更会触发子树物化路径级联重算（见 DeptService.update）。
 */
export class UpdateDeptDto extends PartialType(CreateDeptDto) {}
