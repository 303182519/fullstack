import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 角色模块业务错误码（MMSNN；30 = 角色模块号段）。
 */
export const RoleBizCode = {
  /** 角色不存在或不属于本租户 */
  NOT_FOUND: buildBizCode(MODULE_CODES.ROLE, 'A', 1),
  /** 角色编码已被占用 */
  CODE_EXISTS: buildBizCode(MODULE_CODES.ROLE, 'A', 2),
  /** 系统内置角色（PLATFORM / DEFAULT）不允许修改编码或删除 */
  SYSTEM_IMMUTABLE: buildBizCode(MODULE_CODES.ROLE, 'A', 3),
  /** 角色已被用户使用，不允许删除 */
  IN_USE: buildBizCode(MODULE_CODES.ROLE, 'A', 4),
  /** 授权菜单中存在当前租户不可用项（套餐未覆盖） */
  MENU_NOT_LICENSED: buildBizCode(MODULE_CODES.ROLE, 'A', 5),
} as const;

function roleError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const roleErrors = {
  notFound: () =>
    roleError('角色不存在', HttpStatus.NOT_FOUND, RoleBizCode.NOT_FOUND),
  codeExists: () =>
    roleError('角色编码已被占用', HttpStatus.CONFLICT, RoleBizCode.CODE_EXISTS),
  systemImmutable: (message: string) =>
    roleError(message, HttpStatus.CONFLICT, RoleBizCode.SYSTEM_IMMUTABLE),
  inUse: () =>
    roleError('角色已被用户使用，请先解绑', HttpStatus.CONFLICT, RoleBizCode.IN_USE),
  menuNotLicensed: () =>
    roleError(
      '存在当前租户不可用的菜单，授权已拒绝',
      HttpStatus.BAD_REQUEST,
      RoleBizCode.MENU_NOT_LICENSED,
    ),
} as const;
