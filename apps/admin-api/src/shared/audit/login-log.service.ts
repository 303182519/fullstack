import type { LoginMsg } from './login-msg.constants.js';
import { LoginLogStatus } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';

/** 一次登录日志落库的完整入参（由 AuthService 在各成败分支显式埋点） */
export interface LoginLogEntry {
  tenantId: bigint;
  userId?: bigint | null;
  username: string;
  ip?: string | null;
  device?: string | null;
  status: LoginLogStatus;
  msg: LoginMsg;
}

/**
 * 登录日志写入器（ADR-009）。
 *
 * 失败语义与 OperLogService 一致：best-effort，落库失败仅 warn 吞掉，
 * 绝不影响登录主链路。埋点位置在 AuthService 的每个成败分支（成功 /
 * 凭据错误 / 锁定 / 验证码 / 禁用 / 租户不可用），保证一次登录恰好一条日志。
 */
@Injectable()
export class LoginLogService {
  private readonly logger = new Logger(LoginLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 异步落库。永不 reject。 */
  async append(entry: LoginLogEntry): Promise<void> {
    try {
      await this.prisma.sysLoginLog.create({
        data: {
          id: BigInt(generateSnowflakeId()),
          tenantId: entry.tenantId,
          userId: entry.userId ?? null,
          username: entry.username.slice(0, 100),
          ip: entry.ip ?? null,
          device: entry.device ? entry.device.slice(0, 50) : null,
          status: entry.status,
          msg: entry.msg,
        },
      });
    }
    catch (err) {
      this.logger.warn(
        `登录日志落库失败（已忽略）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
