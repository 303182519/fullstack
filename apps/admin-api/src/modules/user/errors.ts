import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@/common/exceptions/base.exception.js';

/**
 * 用户模块业务错误码（MMSNN 规范，见 ADR-011）。
 *
 * 20 = 用户模块编号；A = 调用方/请求错误。
 * 集中定义在此，避免错误码在 service 内联散落。
 */
export const UserBizCode = {
  /** 用户不存在或无权限访问 */
  NOT_FOUND: '20A01',
  /** 用户名已被占用 */
  USERNAME_EXISTS: '20A02',
  /** 邮箱已被占用 */
  EMAIL_EXISTS: '20A03',
  /** 角色无效（不存在或不属于本租户） */
  INVALID_ROLE: '20A04',
  /** 不能删除当前登录账号 */
  DELETE_SELF: '20A05',
  /** 无权执行该操作 */
  FORBIDDEN: '20A06',
  /** 所属部门不存在或不在数据权限范围内 */
  INVALID_DEPT: '20A07',
} as const;

/** 用户模块内部错误构造器 */
function userError(
  message: string,
  status: HttpStatus,
  code: string,
): BaseException {
  return new BaseException({ message, status, code });
}

export const userErrors = {
  notFound: () =>
    userError('用户不存在', HttpStatus.NOT_FOUND, UserBizCode.NOT_FOUND),
  usernameExists: () =>
    userError(
      '用户名已被占用',
      HttpStatus.CONFLICT,
      UserBizCode.USERNAME_EXISTS,
    ),
  emailExists: () =>
    userError('邮箱已被占用', HttpStatus.CONFLICT, UserBizCode.EMAIL_EXISTS),
  invalidRole: () =>
    userError(
      '存在无效角色（不存在或不属于本租户）',
      HttpStatus.BAD_REQUEST,
      UserBizCode.INVALID_ROLE,
    ),
  deleteSelf: () =>
    userError(
      '不能删除当前登录账号',
      HttpStatus.BAD_REQUEST,
      UserBizCode.DELETE_SELF,
    ),
  forbidden: () =>
    userError(
      '无权删除平台超级管理员',
      HttpStatus.FORBIDDEN,
      UserBizCode.FORBIDDEN,
    ),
  invalidDept: () =>
    userError(
      '所属部门不存在或不在数据权限范围内',
      HttpStatus.BAD_REQUEST,
      UserBizCode.INVALID_DEPT,
    ),
} as const;
