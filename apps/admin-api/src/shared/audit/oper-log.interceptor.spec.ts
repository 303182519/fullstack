import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { OperLogStatus } from '@fedstack/database';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { OperLogInterceptor } from './oper-log.interceptor.js';
import { MASK_PLACEHOLDER } from './oper-log.mask.js';
import { OperLogService } from './oper-log.service.js';

const meta = { module: '用户管理', action: '创建用户' };

function makeContext(req: Partial<Request>): ExecutionContext {
  return {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const principal = { userId: '1', tenantId: '10', username: 'alice', isSuper: false, sessionId: 's1' };

describe('operLogInterceptor', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  const operLogService = { append: vi.fn() };
  const requestContext = { getUser: vi.fn() };
  let interceptor: OperLogInterceptor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    interceptor = new OperLogInterceptor(
      reflector as unknown as Reflector,
      operLogService as unknown as OperLogService,
      requestContext as unknown as RequestContextService,
    );
    requestContext.getUser.mockReturnValue(principal);
    operLogService.append.mockResolvedValue(undefined);
  });

  it('未标注 @OperLog 的路由直接透传，不落库', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const handler: CallHandler = { handle: () => of('ok') };

    const result = await new Promise((resolve) => {
      interceptor.intercept(makeContext({ method: 'GET', url: '/users' }), handler)
        .subscribe(resolve);
    });

    expect(result).toBe('ok');
    expect(operLogService.append).not.toHaveBeenCalled();
  });

  it('成功响应记录 SUCCESS，参数敏感键掩码', async () => {
    reflector.getAllAndOverride.mockReturnValue(meta);
    const req = {
      method: 'POST',
      url: '/users',
      originalUrl: '/api/users',
      ip: '127.0.0.1',
      query: {},
      body: { username: 'bob', password: 'Secret123' },
    };
    const handler: CallHandler = { handle: () => of({ id: '1' }) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(makeContext(req), handler).subscribe(() => resolve());
    });

    expect(operLogService.append).toHaveBeenCalledTimes(1);
    const entry = operLogService.append.mock.calls[0]?.[0];
    expect(entry.status).toBe(OperLogStatus.SUCCESS);
    expect(entry.module).toBe('用户管理');
    expect(entry.action).toBe('创建用户');
    expect(entry.params).toEqual({
      query: null,
      body: { username: 'bob', password: MASK_PLACEHOLDER },
    });
    expect(entry.result).toEqual({ id: '1' });
    expect(entry.errorMsg).toBeNull();
    expect(typeof entry.costMs).toBe('number');
  });

  it('业务抛错记录 FAILURE 与错误消息，不写 result', async () => {
    reflector.getAllAndOverride.mockReturnValue(meta);
    const req = { method: 'POST', url: '/users', query: {}, body: {} };
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await new Promise<void>((resolve) => {
      interceptor.intercept(makeContext(req), handler).subscribe({
        error: () => resolve(),
      });
    });

    const entry = operLogService.append.mock.calls[0]?.[0];
    expect(entry.status).toBe(OperLogStatus.FAILURE);
    expect(entry.errorMsg).toBe('boom');
    expect(entry.result).toBeUndefined();
  });

  it('请求主体缺失时跳过记录（宁可不记也不写脏数据）', async () => {
    reflector.getAllAndOverride.mockReturnValue(meta);
    requestContext.getUser.mockReturnValue(undefined);
    const req = { method: 'POST', url: '/users', query: {}, body: {} };
    const handler: CallHandler = { handle: () => of('ok') };

    await new Promise<void>((resolve) => {
      interceptor.intercept(makeContext(req), handler).subscribe(() => resolve());
    });

    expect(operLogService.append).not.toHaveBeenCalled();
  });
});
