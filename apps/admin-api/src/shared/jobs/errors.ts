import { HttpStatus } from '@nestjs/common';
import {
  businessException,
  conflict,
  forbidden,
  notFound,
} from '@/common/exceptions/business.exception.js';
import {
  buildBizCode,
  MODULE_CODES,
} from '@/common/exceptions/module-registry.js';

/**
 * Jobs 模块业务错误码（MMSNN 规范，MODULE_CODES.JOB=98）。
 *
 * 模块号分配：shared/jobs 属 P3b 基础设施，预留 98 号段（见 module-registry.ts）。
 */

// ── A 类：4xx 客户端错误 ───────────────────────────────────────

/** 任务不存在（DB 查无此 jobId） */
export const JOB_NOT_FOUND_CODE = buildBizCode(MODULE_CODES.JOB, 'A', 1);

/** 任务处理器未注册（提交时 registry 查无此 name） */
export const JOB_HANDLER_NOT_FOUND_CODE = buildBizCode(MODULE_CODES.JOB, 'A', 2);

/** 任务已达终态或已被 worker 抢占，不可取消 */
export const JOB_NOT_CANCELLABLE_CODE = buildBizCode(MODULE_CODES.JOB, 'A', 3);

/** 补偿失败（任务已达终态） */
export const JOB_COMPENSATE_FAILED_CODE = buildBizCode(MODULE_CODES.JOB, 'A', 4);

/** 租户越权（非超管操作其他租户任务） */
export const JOB_TENANT_FORBIDDEN_CODE = buildBizCode(MODULE_CODES.JOB, 'A', 5);

// ── B 类：SSE / 连接管理（Phase 3 用） ──────────────────────────

/** SSE 并发连接数超限 */
export const SSE_CONNECTIONS_EXCEEDED_CODE = buildBizCode(MODULE_CODES.JOB, 'B', 1);

// ── 异常工厂 ───────────────────────────────────────────────────

export const jobErrors = {
  notFound: (jobId: string) =>
    notFound(`任务不存在: ${jobId}`, JOB_NOT_FOUND_CODE),

  handlerNotFound: (name: string) =>
    businessException(
      `任务处理器未注册: ${name}`,
      HttpStatus.BAD_REQUEST,
      JOB_HANDLER_NOT_FOUND_CODE,
    ),

  notCancellable: (jobId: string) =>
    conflict(`任务不可取消（已达终态或被 worker 抢占）: ${jobId}`, JOB_NOT_CANCELLABLE_CODE),

  compensateFailed: (jobId: string) =>
    forbidden(`任务已达终态或不可补偿: ${jobId}`, JOB_COMPENSATE_FAILED_CODE),

  tenantForbidden: (rowTenantId: string, scopeTenantId: string) =>
    forbidden(
      `租户越权：任务属租户 ${rowTenantId}，当前作用域 ${scopeTenantId}`,
      JOB_TENANT_FORBIDDEN_CODE,
    ),

  sseConnectionsExceeded: () =>
    businessException(
      'SSE 并发连接数超限，请稍后重试',
      HttpStatus.SERVICE_UNAVAILABLE,
      SSE_CONNECTIONS_EXCEEDED_CODE,
    ),
};
