import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';

/**
 * 文件模块业务错误码（MMSNN；90 = 文件模块编号，来自 MODULE_CODES.FILE）。
 *
 * 原裸占 Auth 号段（10Axx），P3a 迁入独立 90 号段并收口于此。
 * ImageProcessorService 的图片校验错误也挂在本段——它是文件上传管道的一环。
 */
export const FileBizCode = {
  /** 文件不存在或已软删（包含物理对象缺失） */
  NOT_FOUND: buildBizCode(MODULE_CODES.FILE, 'A', 1),
  /** MIME 类型不在白名单内 */
  MIME_FORBIDDEN: buildBizCode(MODULE_CODES.FILE, 'A', 2),
  /** 文件大小超过该类型上限 */
  SIZE_EXCEEDED: buildBizCode(MODULE_CODES.FILE, 'A', 3),
  /** 租户存储配额已达上限 */
  QUOTA_EXCEEDED: buildBizCode(MODULE_CODES.FILE, 'A', 4),
  /** 请求缺少 file 字段（Controller 入口校验） */
  FILE_REQUIRED: buildBizCode(MODULE_CODES.FILE, 'A', 5),
  /** 驱动不支持直连下载，需改用代理通路 */
  DIRECT_UNAVAILABLE: buildBizCode(MODULE_CODES.FILE, 'A', 6),
  /** 图片字节内容无效或像素尺寸超限（ImageProcessorService 抛出） */
  INVALID_IMAGE: buildBizCode(MODULE_CODES.FILE, 'A', 7),
  /** 租户不存在（assertQuota 防御性检查） */
  TENANT_MISSING: buildBizCode(MODULE_CODES.FILE, 'A', 8),
} as const;

function fileError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const fileErrors = {
  notFound: (message = '文件不存在或已删除') =>
    fileError(message, HttpStatus.NOT_FOUND, FileBizCode.NOT_FOUND),
  mimeForbidden: (mime: string) =>
    fileError(
      `不支持的文件类型：${mime}`,
      HttpStatus.BAD_REQUEST,
      FileBizCode.MIME_FORBIDDEN,
    ),
  sizeExceeded: (size: number, limit: number) =>
    fileError(
      `文件大小 ${size} 超过该类型上限 ${limit}`,
      HttpStatus.BAD_REQUEST,
      FileBizCode.SIZE_EXCEEDED,
    ),
  quotaExceeded: (used: bigint, inc: number, limit: bigint) =>
    fileError(
      `超出存储配额：当前 ${used} 字节，本次 ${inc}，上限 ${limit}`,
      HttpStatus.CONFLICT,
      FileBizCode.QUOTA_EXCEEDED,
    ),
  fileRequired: () =>
    fileError('缺少 file 字段', HttpStatus.BAD_REQUEST, FileBizCode.FILE_REQUIRED),
  directUnavailable: () =>
    fileError(
      '当前驱动不支持直连下载，请改用代理下载',
      HttpStatus.BAD_REQUEST,
      FileBizCode.DIRECT_UNAVAILABLE,
    ),
  invalidImage: (message: string) =>
    fileError(message, HttpStatus.BAD_REQUEST, FileBizCode.INVALID_IMAGE),
  tenantMissing: () =>
    fileError('租户不存在或已删除', HttpStatus.NOT_FOUND, FileBizCode.TENANT_MISSING),
} as const;
