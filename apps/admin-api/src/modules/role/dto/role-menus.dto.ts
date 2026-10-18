import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, Matches } from 'class-validator';

/**
 * 角色菜单授权入参与回显：菜单 ID 集合（全量替换语义）。
 *
 * 传入空数组表示清空该角色的全部菜单授权。服务端会校验每个 ID 属于
 * 「当前租户可用菜单范围」（套餐许可集合，见 MenuService.resolveLicensedMenuIds）。
 */
export class RoleMenusDto {
  @ApiProperty({ description: '菜单 ID 列表（雪花数字字符串）', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true, message: '菜单 ID 必须为数字字符串' })
  menuIds: string[];
}
