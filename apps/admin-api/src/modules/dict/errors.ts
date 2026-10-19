import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';

/**
 * 字典模块业务错误码（MMSNN 规范，见 ADR-011）。
 *
 * 80 = 字典模块编号；A = 调用方/请求错误。
 * 子类型内序号从 01 起按出现顺序递增；80A04 预留未使用（纯重构保持原样）。
 * 集中定义在此，避免错误码在 dict-type / dict-data service 内联散落。
 */
export const DictBizCode = {
  /** 字典类型不存在 */
  TYPE_NOT_FOUND: '80A01',
  /** 字典类型已存在 */
  TYPE_EXISTS: '80A02',
  /** 字典类型下仍有数据条目 */
  TYPE_HAS_DATA: '80A03',
  /** 字典数据不存在 */
  DATA_NOT_FOUND: '80A05',
  /** 字典数据值已存在（同类型内重复） */
  DATA_VALUE_EXISTS: '80A06',
  /** 创建字典数据时关联的类型不存在 */
  TYPE_MISSING: '80A07',
} as const;

/** 字典模块内部错误构造器 */
function dictError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const dictErrors = {
  typeNotFound: () =>
    dictError(
      '字典类型不存在',
      HttpStatus.NOT_FOUND,
      DictBizCode.TYPE_NOT_FOUND,
    ),
  typeExists: () =>
    dictError(
      '字典类型已存在',
      HttpStatus.CONFLICT,
      DictBizCode.TYPE_EXISTS,
    ),
  typeHasData: () =>
    dictError(
      '字典类型下仍有数据条目，请先删除',
      HttpStatus.CONFLICT,
      DictBizCode.TYPE_HAS_DATA,
    ),
  dataNotFound: () =>
    dictError(
      '字典数据不存在',
      HttpStatus.NOT_FOUND,
      DictBizCode.DATA_NOT_FOUND,
    ),
  dataValueExists: () =>
    dictError(
      '字典数据已存在',
      HttpStatus.CONFLICT,
      DictBizCode.DATA_VALUE_EXISTS,
    ),
  typeMissing: () =>
    dictError(
      '字典类型不存在，请先创建类型定义',
      HttpStatus.BAD_REQUEST,
      DictBizCode.TYPE_MISSING,
    ),
} as const;
