import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 菜单模块业务错误码（MMSNN；40 = 菜单模块号段）。
 *
 * 注：原 service 硬编码 60Axx（误抄 tenant 号段），本次迁入 40Axx。
 */
export const MenuBizCode = {
  /** 菜单不存在或不属于本租户 */
  NOT_FOUND: buildBizCode(MODULE_CODES.MENU, 'A', 1),
  /** 上级菜单不存在 / 非法（自己做自己上级、按钮做上级） */
  PARENT_INVALID: buildBizCode(MODULE_CODES.MENU, 'A', 2),
  /** 菜单存在子项，不能改为按钮类型或删除 */
  HAS_CHILDREN: buildBizCode(MODULE_CODES.MENU, 'A', 3),
  /** 权限编码已被其他按钮菜单占用 */
  PERM_CODE_EXISTS: buildBizCode(MODULE_CODES.MENU, 'A', 4),
  /** 按钮类型菜单必须提供权限编码 */
  PERM_CODE_REQUIRED: buildBizCode(MODULE_CODES.MENU, 'A', 5),
  /** 菜单已被角色或套餐引用 */
  IN_USE: buildBizCode(MODULE_CODES.MENU, 'A', 6),
} as const;

function menuError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const menuErrors = {
  notFound: () =>
    menuError('菜单不存在', HttpStatus.NOT_FOUND, MenuBizCode.NOT_FOUND),
  parentInvalid: (message = '上级菜单不存在') =>
    menuError(message, HttpStatus.BAD_REQUEST, MenuBizCode.PARENT_INVALID),
  hasChildren: (message = '存在子菜单，请先删除子菜单') =>
    menuError(message, HttpStatus.CONFLICT, MenuBizCode.HAS_CHILDREN),
  permCodeExists: () =>
    menuError('权限编码已存在', HttpStatus.CONFLICT, MenuBizCode.PERM_CODE_EXISTS),
  permCodeRequired: () =>
    menuError('按钮类型菜单必须提供权限编码', HttpStatus.BAD_REQUEST, MenuBizCode.PERM_CODE_REQUIRED),
  inUse: () =>
    menuError(
      '菜单已被角色或套餐引用，请先解绑',
      HttpStatus.CONFLICT,
      MenuBizCode.IN_USE,
    ),
} as const;
