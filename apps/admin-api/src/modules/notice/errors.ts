import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 通知公告业务错误码（MMSNN；94 = 通知公告模块编号，来自 MODULE_CODES.NOTICE）。
 */
export const NoticeBizCode = {
  /** 公告不存在或不属于本作用域 */
  NOT_FOUND: buildBizCode(MODULE_CODES.NOTICE, 'A', 1),
} as const;

function noticeError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const noticeErrors = {
  notFound: () =>
    noticeError('公告不存在', HttpStatus.NOT_FOUND, NoticeBizCode.NOT_FOUND),
} as const;
