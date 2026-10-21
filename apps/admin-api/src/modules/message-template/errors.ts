import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 消息模板业务错误码（MMSNN；95 = SMS 通道号段，P3b 暂用 SMS 号段）。
 *
 * 待模块编号注册表扩展后迁入独立号段。
 */
export const MessageTemplateBizCode = {
  /** 模板不存在或不属于本作用域 */
  NOT_FOUND: buildBizCode(MODULE_CODES.SMS, 'A', 1),
  /** 同作用域内模板键已存在 */
  KEY_EXISTS: buildBizCode(MODULE_CODES.SMS, 'A', 2),
} as const;

function mtError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const messageTemplateErrors = {
  notFound: () =>
    mtError('消息模板不存在', HttpStatus.NOT_FOUND, MessageTemplateBizCode.NOT_FOUND),
  keyExists: () =>
    mtError('同作用域内模板键已存在', HttpStatus.CONFLICT, MessageTemplateBizCode.KEY_EXISTS),
} as const;
