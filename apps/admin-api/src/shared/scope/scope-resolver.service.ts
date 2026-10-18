import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { badRequest } from '@/common/exceptions/business.exception.js';

/** 代管参数的合法形态：雪花 ID 是纯数字串 */
const SNOWFLAKE_PATTERN = /^\d+$/;

/**
 * 当前请求的**操作作用域**：本次管理操作落在平台级（tenantId=null）还是某个租户级。
 *
 * 注入规则（P2 决策，见 ADR-009）：
 * - 租户管理员（非 isSuper）：恒定为本租户 —— 请求中的任何 tenantId 参数一律忽略，
 *   租户归属由服务端会话决定，绝不信任客户端传入（安全边界，见 AGENTS.md §15）；
 * - 平台超管（isSuper）：默认平台级（tenantId=null）；显式传 `tenantId` 查询参数时代管该租户。
 */
export interface OperateScope {
  /** null = 平台级 */
  tenantId: bigint | null;
}

/** scope 的缓存 key 片段（tenantId 为 null 时用 'platform' 占位） */
export function scopeKeyOf(tenantId: bigint | null): string {
  return tenantId === null ? 'platform' : tenantId.toString();
}

@Injectable()
export class ScopeResolverService {
  constructor(private readonly requestContext: RequestContextService) {}

  /** 解析当前操作作用域；delegatedTenantId 仅在平台超管请求下生效 */
  resolve(delegatedTenantId?: string): OperateScope {
    const user = this.requestContext.requireUser();
    if (user.isSuper) {
      if (delegatedTenantId !== undefined && !SNOWFLAKE_PATTERN.test(delegatedTenantId))
        throw badRequest('tenantId 必须是雪花 ID 数字串', '00A01');
      return { tenantId: delegatedTenantId ? BigInt(delegatedTenantId) : null };
    }
    return { tenantId: BigInt(user.tenantId) };
  }

  /**
   * 消费端作用域：字典选项 / 参数取值按「调用者自己的租户」解析；
   * 平台超管视为平台级（其消费的平台定义就是平台级本身）。
   */
  resolveConsumer(): OperateScope {
    const user = this.requestContext.requireUser();
    return { tenantId: user.isSuper ? null : BigInt(user.tenantId) };
  }
}
