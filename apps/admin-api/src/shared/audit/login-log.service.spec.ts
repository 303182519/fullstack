import { LoginLogStatus } from '@fedstack/database';
import { Logger } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { initSnowflake, resetSnowflake } from '@/shared/utils/snowflake.js';
import { LoginLogService } from './login-log.service.js';
import { LOGIN_LOG_UNKNOWN_TENANT_ID, LOGIN_MSG } from './login-msg.constants.js';

afterAll(() => {
  resetSnowflake();
});

describe('loginLogService', () => {
  const prisma = { sysLoginLog: { create: vi.fn() } };
  let service: LoginLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    // ID 生成器未初始化会在 append 内抛错并被吞掉，须显式初始化
    initSnowflake(0n, 0n);
    service = new LoginLogService(prisma as unknown as PrismaService);
  });

  it('落库字段完整且超长输入被截断', async () => {
    prisma.sysLoginLog.create.mockResolvedValue({});

    await service.append({
      tenantId: 10n,
      userId: 1n,
      username: 'u'.repeat(120),
      ip: '127.0.0.1',
      device: 'd'.repeat(60),
      status: LoginLogStatus.SUCCESS,
      msg: LOGIN_MSG.SUCCESS,
    });

    const data = prisma.sysLoginLog.create.mock.calls[0]?.[0]?.data;
    expect(data.tenantId).toBe(10n);
    expect(data.userId).toBe(1n);
    expect(data.username.length).toBe(100);
    expect(data.device.length).toBe(50);
    expect(data.status).toBe(LoginLogStatus.SUCCESS);
    expect(data.msg).toBe(LOGIN_MSG.SUCCESS);
  });

  it('userId 缺省落 null；租户未知用占位 0', async () => {
    prisma.sysLoginLog.create.mockResolvedValue({});

    await service.append({
      tenantId: LOGIN_LOG_UNKNOWN_TENANT_ID,
      username: 'ghost',
      status: LoginLogStatus.FAILURE,
      msg: LOGIN_MSG.TENANT_UNAVAILABLE,
    });

    const data = prisma.sysLoginLog.create.mock.calls[0]?.[0]?.data;
    expect(data.tenantId).toBe(0n);
    expect(data.userId).toBeNull();
  });

  it('落库失败吞掉并告警，绝不影响登录主链路', async () => {
    prisma.sysLoginLog.create.mockRejectedValue(new Error('db down'));
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    await expect(service.append({
      tenantId: 10n,
      username: 'alice',
      status: LoginLogStatus.FAILURE,
      msg: LOGIN_MSG.INVALID_CREDENTIALS,
    })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
  });
});
