import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 站内信自助模块业务错误码（MMSNN；93 = 站内信模块编号）。
 *
 * 注：本模块为**自助端点**，无权限码，仅认证 + 租户作用域。
 */
export const UserMessageBizCode = {
  /** 消息不存在或不属于当前用户 */
  NOT_FOUND: buildBizCode(MODULE_CODES.USER_MESSAGE, 'A', 1),
} as const;

function userMessageError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const userMessageErrors = {
  notFound: () =>
    userMessageError('消息不存在', HttpStatus.NOT_FOUND, UserMessageBizCode.NOT_FOUND),
} as const;
