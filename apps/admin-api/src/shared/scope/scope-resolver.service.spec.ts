import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { ScopeResolverService } from './scope-resolver.service.js';

function makeUser(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return { userId: '1', tenantId: '10', username: 'u', isSuper: false, sessionId: 's', ...overrides };
}

describe('scopeResolverService', () => {
  const requestContext = { requireUser: vi.fn() };
  const service = new ScopeResolverService(requestContext as unknown as RequestContextService);

  it('租户管理员恒定本租户，忽略任何代管参数（不信任客户端）', () => {
    requestContext.requireUser.mockReturnValue(makeUser());
    expect(service.resolve()).toEqual({ tenantId: 10n });
    expect(service.resolve('999')).toEqual({ tenantId: 10n });
  });

  it('平台超管默认平台级', () => {
    requestContext.requireUser.mockReturnValue(makeUser({ isSuper: true }));
    expect(service.resolve()).toEqual({ tenantId: null });
  });

  it('平台超管可代管指定租户', () => {
    requestContext.requireUser.mockReturnValue(makeUser({ isSuper: true }));
    expect(service.resolve('123')).toEqual({ tenantId: 123n });
  });

  it('代管参数非雪花数字串时抛 00A01', () => {
    requestContext.requireUser.mockReturnValue(makeUser({ isSuper: true }));
    expect(() => service.resolve('abc')).toThrowError(/00A01|tenantId/);
  });

  it('消费端：超管视为平台级', () => {
    requestContext.requireUser.mockReturnValue(makeUser({ isSuper: true }));
    expect(service.resolveConsumer()).toEqual({ tenantId: null });
  });

  it('消费端：租户管理员读本租户', () => {
    requestContext.requireUser.mockReturnValue(makeUser());
    expect(service.resolveConsumer()).toEqual({ tenantId: 10n });
  });
});
