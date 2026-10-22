import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 消息中心业务错误码（MMSNN；93 = 站内信模块编号，来自 MODULE_CODES.USER_MESSAGE）。
 *
 * 消息中心是编排层，本身不产生业务错误——各通道的具体错误由对应 provider 抛。
 * 本文件只收编排层的通用错误（模板未找到 / 通道未实现）。
 */
export const MessageBizCode = {
  /** 模板未找到或已禁用 */
  TEMPLATE_NOT_FOUND: buildBizCode(MODULE_CODES.USER_MESSAGE, 'A', 1),
  /** 通道未实现 */
  CHANNEL_UNSUPPORTED: buildBizCode(MODULE_CODES.USER_MESSAGE, 'A', 2),
  /** 通道投递失败（provider 返回 success=false） */
  SEND_FAILED: buildBizCode(MODULE_CODES.USER_MESSAGE, 'A', 3),
} as const;

function messageError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const messageErrors = {
  templateNotFound: (key: string) =>
    messageError(
      `消息模板不存在或已禁用：${key}`,
      HttpStatus.NOT_FOUND,
      MessageBizCode.TEMPLATE_NOT_FOUND,
    ),
  channelUnsupported: (channel: string) =>
    messageError(
      `消息通道未实现：${channel}`,
      HttpStatus.NOT_IMPLEMENTED,
      MessageBizCode.CHANNEL_UNSUPPORTED,
    ),
  /**
   * provider 返回 success=false 时抛出。
   * 调用时机：writeLog 之后——先记录投递流水（含 errorMsg），再让异常传播触发重试/任务失败。
   */
  sendFailed: (channel: string, errorMsg?: string | null) =>
    messageError(
      errorMsg ? `消息投递失败: channel=${channel} reason=${errorMsg}` : `消息投递失败: channel=${channel}`,
      HttpStatus.BAD_GATEWAY,
      MessageBizCode.SEND_FAILED,
    ),
} as const;
