import type { KeyPrefixer, RedisClientType } from '@fedstack/redis';
import type { ConfigService } from '@nestjs/config';
import type { SessionRecord } from '@/shared/auth/auth.types.js';
import { hashCacheToken } from '@fedstack/redis';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '@/shared/auth/session.service.js';
import { CacheKeys } from '@/shared/caching/cache.constants.js';

const TTL_SECONDS = 604800;

/** ConfigService 桩：getConfig() 只读取 default / development 两个命名空间 */
function makeConfigService(): ConfigService {
  return {
    get: vi.fn((key: string) =>
      key === 'default'
        ? { jwt: { accessExpiresIn: 7200, refreshExpiresIn: TTL_SECONDS } }
        : {},
    ),
  } as unknown as ConfigService;
}

/** KeyPrefixer 桩：原样返回业务 key，便于断言落盘 key */
function makePrefixer(): KeyPrefixer {
  return { prefix: vi.fn((key: string) => key) } as unknown as KeyPrefixer;
}

/** 直连 Redis 客户端桩（仅覆盖本服务用到的命令） */
function makeRedis() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    sMembers: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    getDel: vi.fn(),
    eval: vi.fn(),
  };
}

function makeRecord(sessionId: string): SessionRecord {
  return {
    sessionId,
    userId: '1',
    tenantId: '10',
    username: 'alice',
    isSuper: false,
    device: 'Chrome',
    ip: '127.0.0.1',
    createdAt: new Date(1000).toISOString(),
    expiresAt: new Date(2000).toISOString(),
  };
}

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

const CREATE_INPUT = {
  userId: '1',
  tenantId: '10',
  username: 'alice',
  isSuper: false,
  device: 'Chrome',
  ip: '127.0.0.1',
};

describe('sessionService', () => {
  let redis: ReturnType<typeof makeRedis>;
  let service: SessionService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    redis = makeRedis();
    service = new SessionService(
      redis as unknown as RedisClientType,
      makePrefixer(),
      makeConfigService(),
    );
  });

  describe('createSession', () => {
    it('写入会话记录并挂入用户会话集合', async () => {
      redis.set.mockResolvedValue('OK');
      redis.sAdd.mockResolvedValue(1);
      redis.expire.mockResolvedValue(true);

      const sid = await service.createSession(CREATE_INPUT);

      expect(sid).toMatch(/^[0-9a-f-]{36}$/);
      const [key, payload, options] = redis.set.mock.calls[0] ?? [];
      expect(key).toBe(CacheKeys.AUTH_SESSION(sid));
      expect(options).toEqual({ EX: TTL_SECONDS });

      const record = JSON.parse(payload as string) as SessionRecord;
      expect(record.sessionId).toBe(sid);
      expect(record.userId).toBe('1');
      expect(record.tenantId).toBe('10');
      expect(record.username).toBe('alice');

      expect(redis.sAdd).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'), sid);
      expect(redis.expire).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'), TTL_SECONDS);
    });

    it('redis 未配置时上抛 503（不静默降级）', async () => {
      const nullService = new SessionService(null, makePrefixer(), makeConfigService());
      const error = await nullService.createSession(CREATE_INPUT).catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });
  });

  describe('lookupSession', () => {
    it('redis 未配置返回 unavailable', async () => {
      const nullService = new SessionService(null, makePrefixer(), makeConfigService());
      await expect(nullService.lookupSession('sid')).resolves.toEqual({ status: 'unavailable' });
    });

    it('记录不存在返回 missing', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.lookupSession('sid')).resolves.toEqual({ status: 'missing' });
    });

    it('记录存在返回 ok 与快照', async () => {
      redis.get.mockResolvedValue(JSON.stringify(makeRecord('sid')));
      const result = await service.lookupSession('sid');
      expect(result.status).toBe('ok');
      expect(result.record?.userId).toBe('1');
    });

    it('读取异常时降级返回 unavailable', async () => {
      redis.get.mockRejectedValue(new Error('connection lost'));
      await expect(service.lookupSession('sid')).resolves.toEqual({ status: 'unavailable' });
    });
  });

  describe('touchSession', () => {
    it('重写会话主体并重置集合 TTL，但不触碰 refresh 摘要', async () => {
      redis.set.mockResolvedValue('OK');
      redis.expire.mockResolvedValue(true);
      const record = makeRecord('sid');

      const next = await service.touchSession(record);

      expect(next.expiresAt).not.toBe(record.expiresAt);
      // 仅写会话主体一次；refresh 摘要由 casRotateRefresh 原子负责
      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.set.mock.calls[0]?.[0]).toBe(CacheKeys.AUTH_SESSION('sid'));
      expect(redis.expire).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'), TTL_SECONDS);
    });
  });

  describe('casRotateRefresh', () => {
    it('旧哈希匹配时写入新哈希并返回 true', async () => {
      redis.eval.mockResolvedValue(1);

      const ok = await service.casRotateRefresh('sid', 'old-hash', 'new-refresh');

      expect(ok).toBe(true);
      const [, opts] = redis.eval.mock.calls[0] ?? [];
      expect(opts.keys).toEqual([CacheKeys.AUTH_REFRESH('sid')]);
      expect(opts.arguments).toEqual([
        'old-hash',
        hashCacheToken('new-refresh'),
        String(TTL_SECONDS),
      ]);
    });

    it('旧哈希不匹配（已被轮换/重放）时返回 false 且不写入', async () => {
      redis.eval.mockResolvedValue(0);

      const ok = await service.casRotateRefresh('sid', 'old-hash', 'new-refresh');

      expect(ok).toBe(false);
    });

    it('redis 未配置时上抛 503（正确性敏感不降级）', async () => {
      const nullService = new SessionService(null, makePrefixer(), makeConfigService());
      const error = await nullService.casRotateRefresh('sid', 'old', 'new').catch(e => e);
      expect(codeOf(error)).toBe('10B01');
    });
  });

  describe('removeSession', () => {
    it('删除会话主体、refresh 摘要与集合成员', async () => {
      redis.del.mockResolvedValue(2);
      redis.sRem.mockResolvedValue(1);

      await service.removeSession('sid', '1');

      expect(redis.del).toHaveBeenCalledWith([
        CacheKeys.AUTH_SESSION('sid'),
        CacheKeys.AUTH_REFRESH('sid'),
      ]);
      expect(redis.sRem).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'), 'sid');
    });
  });

  describe('removeAllSessions', () => {
    it('返回被移除的会话数并清理集合键', async () => {
      redis.sMembers.mockResolvedValue(['s1', 's2']);
      redis.del.mockResolvedValue(4);

      const count = await service.removeAllSessions('1');

      expect(count).toBe(2);
      expect(redis.del).toHaveBeenNthCalledWith(1, [
        CacheKeys.AUTH_SESSION('s1'),
        CacheKeys.AUTH_REFRESH('s1'),
        CacheKeys.AUTH_SESSION('s2'),
        CacheKeys.AUTH_REFRESH('s2'),
      ]);
      expect(redis.del).toHaveBeenNthCalledWith(2, CacheKeys.AUTH_USER_SESSIONS('1'));
    });

    it('无会话时仅删除集合键且返回 0', async () => {
      redis.sMembers.mockResolvedValue([]);
      redis.del.mockResolvedValue(0);

      await expect(service.removeAllSessions('1')).resolves.toBe(0);
      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'));
    });
  });

  describe('listSessions', () => {
    it('过滤陈旧成员并清理，标记当前会话', async () => {
      redis.sMembers.mockResolvedValue(['s1', 'stale']);
      redis.get.mockImplementation((key: string) =>
        key === CacheKeys.AUTH_SESSION('s1')
          ? Promise.resolve(JSON.stringify(makeRecord('s1')))
          : Promise.resolve(null),
      );
      redis.sRem.mockResolvedValue(1);

      const sessions = await service.listSessions('1', 's1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.sessionId).toBe('s1');
      expect(sessions[0]?.current).toBe(true);
      expect(redis.sRem).toHaveBeenCalledWith(CacheKeys.AUTH_USER_SESSIONS('1'), ['stale']);
    });

    it('redis 未配置返回空列表', async () => {
      const nullService = new SessionService(null, makePrefixer(), makeConfigService());
      await expect(nullService.listSessions('1', 's1')).resolves.toEqual([]);
    });

    it('读取异常时降级返回空列表', async () => {
      redis.sMembers.mockRejectedValue(new Error('boom'));
      await expect(service.listSessions('1', 's1')).resolves.toEqual([]);
    });
  });

  it('getSessionTtlSeconds 返回 refresh 有效期', () => {
    expect(service.getSessionTtlSeconds()).toBe(TTL_SECONDS);
  });
});
