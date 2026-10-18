import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, Matches } from 'class-validator';

/**
 * 套餐菜单绑定入参与回显：菜单 ID 集合（全量替换语义）。
 *
 * 传入空数组表示清空该套餐的全部菜单绑定。服务端校验每个 ID 必须为「平台级启用菜单」。
 */
export class PackageMenusDto {
  @ApiProperty({ description: '菜单 ID 列表（雪花数字字符串）', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true, message: '菜单 ID 必须为数字字符串' })
  menuIds: string[];
}
