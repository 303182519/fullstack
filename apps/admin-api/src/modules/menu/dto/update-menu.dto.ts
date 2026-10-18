import { PartialType } from '@nestjs/swagger';
import { CreateMenuDto } from './create-menu.dto.js';

/**
 * 更新菜单入参：全部字段可选。
 * 变更 permCode / parentId / menuType 时，Service 层会重新做唯一性与层级校验。
 */
export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
