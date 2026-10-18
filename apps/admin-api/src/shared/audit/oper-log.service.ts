import { OperLogStatus } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';

/** 一次操作日志落库的完整入参（由 OperLogInterceptor 组装） */
export interface OperLogEntry {
  tenantId: bigint;
  userId: bigint;
  username: string;
  module: string;
  action: string;
  method: string;
  path: string;
  ip?: string | null;
  /** 已掩码的请求参数 */
  params: unknown;
  /** 已截断的响应结果 */
  result?: unknown;
  status: OperLogStatus;
  errorMsg?: string | null;
  costMs: number;
}

/**
 * 操作日志写入器（ADR-009）。
 *
 * 失败语义：审计日志**绝不阻塞业务** —— 任何落库失败（DB 抖动、连接池耗尽等）
 * 仅记 warn 后吞掉。这也意味着日志是 best-effort：极端情况下可能丢个别条目，
 * 这是「审计不拖垮主链路」这一优先级取舍的直接结果（见 AGENTS.md §4/§5）。
 */
@Injectable()
export class OperLogService {
  private readonly logger = new Logger(OperLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 异步落库（fire-and-forget 调用方不 await）。永不 reject。 */
  async append(entry: OperLogEntry): Promise<void> {
    try {
      await this.prisma.sysOperLog.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: entry.tenantId,
          userId: entry.userId,
          username: entry.username,
          module: entry.module,
          action: entry.action,
          method: entry.method,
          path: entry.path.slice(0, 200),
          ip: entry.ip ?? null,
          params: (entry.params ?? undefined) as never,
          result: (entry.result ?? undefined) as never,
          status: entry.status,
          errorMsg: entry.errorMsg ? entry.errorMsg.slice(0, 2000) : null,
          costMs: entry.costMs,
        },
      });
    }
    catch (err) {
      this.logger.warn(
        `操作日志落库失败（已忽略）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
