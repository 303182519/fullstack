import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 租户模块业务错误码（MMSNN；60 = 租户模块号段）。
 *
 * 注：原 service 硬编码 40Axx（误抄 menu 号段），本次迁入 60Axx。
 */
export const TenantBizCode = {
  /** 租户不存在或已软删 */
  NOT_FOUND: buildBizCode(MODULE_CODES.TENANT, 'A', 1),
  /** 租户绑定的套餐不存在或不可用 */
  PACKAGE_NOT_FOUND: buildBizCode(MODULE_CODES.TENANT, 'A', 2),
} as const;

function tenantError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const tenantErrors = {
  notFound: () =>
    tenantError('租户不存在', HttpStatus.NOT_FOUND, TenantBizCode.NOT_FOUND),
  packageNotFound: () =>
    tenantError('套餐不存在', HttpStatus.BAD_REQUEST, TenantBizCode.PACKAGE_NOT_FOUND),
} as const;
