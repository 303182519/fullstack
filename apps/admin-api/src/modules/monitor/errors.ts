import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 审计监控业务错误码（MMSNN；92 = 监控模块号段）。
 *
 * 注：原 online.service.ts 硬编码 95A02/95A03、oper-log-query.service.ts 硬编码 95A01
 * （均误抄 SMS 预留号段），本次统一迁入 92Axx。
 */
export const MonitorBizCode = {
  /** tenantId 参数不是雪花 ID 数字串（日志查询作用域校验） */
  TENANT_ID_INVALID: buildBizCode(MODULE_CODES.MONITOR, 'A', 1),
  /** 会话不存在或已过期（在线用户踢单 / 查询） */
  SESSION_NOT_FOUND: buildBizCode(MODULE_CODES.MONITOR, 'A', 2),
  /** 用户不存在（按用户全线下线时校验目标用户） */
  USER_NOT_FOUND: buildBizCode(MODULE_CODES.MONITOR, 'A', 3),
} as const;

function monitorError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const monitorErrors = {
  tenantIdInvalid: () =>
    monitorError(
      'tenantId 必须是雪花 ID 数字串',
      HttpStatus.BAD_REQUEST,
      MonitorBizCode.TENANT_ID_INVALID,
    ),
  sessionNotFound: () =>
    monitorError('会话不存在或已过期', HttpStatus.NOT_FOUND, MonitorBizCode.SESSION_NOT_FOUND),
  userNotFound: () =>
    monitorError('用户不存在', HttpStatus.NOT_FOUND, MonitorBizCode.USER_NOT_FOUND),
} as const;
