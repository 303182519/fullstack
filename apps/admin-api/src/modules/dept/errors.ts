import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';

/**
 * 部门模块业务错误码（MMSNN 规范，见 ADR-011）。
 *
 * 50 = 部门模块编号；A = 调用方/请求错误。
 * 集中定义在此，避免错误码在 service 内联散落。
 */
export const DeptBizCode = {
  /** 部门不存在或已删除 */
  NOT_FOUND: '50A01',
  /** 上级部门不存在或不属于本租户 */
  PARENT_INVALID: '50A02',
  /** 存在下级部门 */
  HAS_CHILDREN: '50A03',
  /** 部门下存在用户 */
  IN_USE: '50A04',
  /** 移动上级会形成环 */
  CYCLE: '50A05',
} as const;

/** 部门模块内部错误构造器 */
function deptError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const deptErrors = {
  notFound: () =>
    deptError('部门不存在', HttpStatus.NOT_FOUND, DeptBizCode.NOT_FOUND),
  parentInvalid: () =>
    deptError(
      '上级部门不存在或不属于本租户',
      HttpStatus.BAD_REQUEST,
      DeptBizCode.PARENT_INVALID,
    ),
  hasChildren: () =>
    deptError(
      '存在下级部门，请先删除下级部门',
      HttpStatus.CONFLICT,
      DeptBizCode.HAS_CHILDREN,
    ),
  inUse: () =>
    deptError(
      '部门下存在用户，请先调整用户归属',
      HttpStatus.CONFLICT,
      DeptBizCode.IN_USE,
    ),
  cycle: () =>
    deptError(
      '不能把部门移动到自身或其下级部门之下',
      HttpStatus.CONFLICT,
      DeptBizCode.CYCLE,
    ),
} as const;
