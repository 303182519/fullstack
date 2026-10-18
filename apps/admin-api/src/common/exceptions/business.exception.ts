import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception.js';

/**
 * 资源类业务异常的轻量工厂。
 *
 * 避免每个模块反复写 `new BaseException({ message, status, code })` 样板。
 * 业务码（MMSNN）由调用方传入，模块内集中定义为常量对象，见各模块 service 顶部的 `*_BIZ_CODE`。
 */
export function businessException(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export function notFound(message: string, code: string) {
  return businessException(message, HttpStatus.NOT_FOUND, code);
}

export function conflict(message: string, code: string) {
  return businessException(message, HttpStatus.CONFLICT, code);
}

export function badRequest(message: string, code: string) {
  return businessException(message, HttpStatus.BAD_REQUEST, code);
}

export function forbidden(message: string, code: string) {
  return businessException(message, HttpStatus.FORBIDDEN, code);
}
