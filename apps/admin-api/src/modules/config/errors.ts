import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 参数配置业务错误码（MMSNN；70 = 参数模块号段）。
 *
 * 注：原 service 硬编码 90Axx（误抄 file 号段），本次迁入 70Axx。
 */
export const ConfigBizCode = {
  /** 参数不存在或不属于本作用域 */
  NOT_FOUND: buildBizCode(MODULE_CODES.CONFIG, 'A', 1),
  /** 参数键已被占用（同作用域内重复） */
  KEY_EXISTS: buildBizCode(MODULE_CODES.CONFIG, 'A', 2),
  /** 内置参数不允许删除或作用域变更 */
  SYSTEM_IMMUTABLE: buildBizCode(MODULE_CODES.CONFIG, 'A', 3),
} as const;

function configError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const configErrors = {
  notFound: () =>
    configError('参数不存在', HttpStatus.NOT_FOUND, ConfigBizCode.NOT_FOUND),
  keyExists: () =>
    configError('参数键已存在', HttpStatus.CONFLICT, ConfigBizCode.KEY_EXISTS),
  systemImmutable: () =>
    configError('内置参数不允许删除', HttpStatus.CONFLICT, ConfigBizCode.SYSTEM_IMMUTABLE),
} as const;
