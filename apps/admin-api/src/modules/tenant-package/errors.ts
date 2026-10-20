import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 租户套餐业务错误码（MMSNN；91 = 套餐模块号段）。
 *
 * 注：原 service 硬编码 70Axx（误抄 config 号段），本次迁入 91Axx。
 */
export const TenantPackageBizCode = {
  /** 套餐不存在 */
  NOT_FOUND: buildBizCode(MODULE_CODES.TENANT_PACKAGE, 'A', 1),
  /** 套餐编码已被占用 */
  CODE_EXISTS: buildBizCode(MODULE_CODES.TENANT_PACKAGE, 'A', 2),
  /** 套餐已被租户使用，不允许删除 */
  IN_USE: buildBizCode(MODULE_CODES.TENANT_PACKAGE, 'A', 3),
  /** 菜单中存在不属于平台级启用的项（套餐只能授权平台级菜单） */
  MENU_INVALID: buildBizCode(MODULE_CODES.TENANT_PACKAGE, 'A', 4),
} as const;

function packageError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const tenantPackageErrors = {
  notFound: () =>
    packageError('套餐不存在', HttpStatus.NOT_FOUND, TenantPackageBizCode.NOT_FOUND),
  codeExists: () =>
    packageError('套餐编码已被占用', HttpStatus.CONFLICT, TenantPackageBizCode.CODE_EXISTS),
  inUse: () =>
    packageError('套餐已被租户使用，请先解绑', HttpStatus.CONFLICT, TenantPackageBizCode.IN_USE),
  menuInvalid: () =>
    packageError(
      '存在无效的菜单（仅允许平台级启用菜单）',
      HttpStatus.BAD_REQUEST,
      TenantPackageBizCode.MENU_INVALID,
    ),
} as const;
