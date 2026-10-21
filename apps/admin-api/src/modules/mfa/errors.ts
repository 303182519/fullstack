import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * MFA 业务错误码（MMSNN；97 = MFA 模块编号，来自 MODULE_CODES.MFA）。
 */
export const MfaBizCode = {
  /** MFA 配置不存在（用户未绑定） */
  NOT_FOUND: buildBizCode(MODULE_CODES.MFA, 'A', 1),
  /** MFA 已绑定，需先解绑 */
  ALREADY_BOUND: buildBizCode(MODULE_CODES.MFA, 'A', 2),
  /** TOTP 验证码错误 */
  INVALID_TOTP: buildBizCode(MODULE_CODES.MFA, 'A', 3),
  /** 恢复码无效或已使用 */
  INVALID_RECOVERY_CODE: buildBizCode(MODULE_CODES.MFA, 'A', 4),
  /** MFA 策略为 DISABLED */
  DISABLED_BY_POLICY: buildBizCode(MODULE_CODES.MFA, 'A', 5),
  /** 绑定状态已变更（secret 被重新生成或记录被删除） */
  BIND_STATE_CHANGED: buildBizCode(MODULE_CODES.MFA, 'A', 6),
  /** 解绑已启用的 MFA 未提供验证码 */
  CODE_REQUIRED: buildBizCode(MODULE_CODES.MFA, 'A', 7),
} as const;

function mfaError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const mfaErrors = {
  notFound: () =>
    mfaError('MFA 未绑定', HttpStatus.NOT_FOUND, MfaBizCode.NOT_FOUND),
  alreadyBound: () =>
    mfaError('MFA 已绑定，如需重置请先解绑', HttpStatus.CONFLICT, MfaBizCode.ALREADY_BOUND),
  invalidTotp: () =>
    mfaError('TOTP 验证码错误', HttpStatus.BAD_REQUEST, MfaBizCode.INVALID_TOTP),
  invalidRecoveryCode: () =>
    mfaError('恢复码无效或已使用', HttpStatus.BAD_REQUEST, MfaBizCode.INVALID_RECOVERY_CODE),
  disabledByPolicy: () =>
    mfaError('当前 MFA 策略为 DISABLED', HttpStatus.FORBIDDEN, MfaBizCode.DISABLED_BY_POLICY),
  bindStateChanged: () =>
    mfaError('绑定状态已变更，请重新获取二维码后再试', HttpStatus.CONFLICT, MfaBizCode.BIND_STATE_CHANGED),
  codeRequired: () =>
    mfaError('请提供 TOTP 验证码或恢复码', HttpStatus.BAD_REQUEST, MfaBizCode.CODE_REQUIRED),
} as const;
