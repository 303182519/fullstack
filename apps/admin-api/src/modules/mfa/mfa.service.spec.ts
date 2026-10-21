import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import { Prisma } from '@fedstack/database';
import { Secret, TOTP } from 'otpauth';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSnowflake } from '@/shared/utils/snowflake.js';
import { MfaService } from './mfa.service.js';

// ---------- shared fixtures ----------

const ENC_KEY_HEX = crypto.randomBytes(32).toString('hex');

function principal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    userId: '7',
    tenantId: '42',
    username: 'alice',
    isSuper: false,
    sessionId: 'sess-1',
    ...overrides,
  };
}

/** 与服务端 encryptSecret 相同的 AES-256-GCM 格式：iv:tag:ciphertext（base64） */
function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY_HEX, 'hex'), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted}`;
}

function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function makeRow(opts: {
  enabledAt?: Date | null;
  recoveryCodes?: unknown[];
  secret?: Secret;
} = {}) {
  const secret = opts.secret ?? new Secret({ size: 20 });
  return {
    row: {
      id: 1n,
      userId: 7n,
      tenantId: 42n,
      secretCipher: encryptSecret(secret.base32),
      recoveryCodes: opts.recoveryCodes ?? [],
      enabledAt: opts.enabledAt ?? null,
    },
    secret,
  };
}

type PrismaMock = {
  sysUserMfa: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): PrismaMock {
  return {
    sysUserMfa: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function makeConfigService(): any {
  // getConfig 会分别取 default / development（或 production）两份配置再 merge
  return {
    get: vi.fn(() => ({ mfa: { secretEncKey: ENC_KEY_HEX } })),
  };
}

let prisma: PrismaMock;
let service: MfaService;

beforeAll(() => {
  // setup 首次绑定会调用 generateSnowflakeId()
  initSnowflake(0n, 0n);
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma = makePrisma();
  service = new MfaService(
    prisma as unknown as import('@/shared/database/prisma.service.js').PrismaService,
    makeConfigService() as any,
  );
});

// ================================================================
// setup
// ================================================================

describe('mfaService.setup', () => {
  it('首次绑定：创建「绑定中」记录，恢复码明文仅返回一次', async () => {
    prisma.sysUserMfa.findUnique.mockResolvedValue(null);

    const result = await service.setup(principal());

    expect(prisma.sysUserMfa.create).toHaveBeenCalledTimes(1);
    const data = prisma.sysUserMfa.create.mock.calls[0]?.[0].data;
    expect(data.userId).toBe(7n);
    expect(data.tenantId).toBe(42n);
    expect(data.enabledAt).toBeNull();
    expect(data.recoveryCodes).toHaveLength(10);

    expect(result.otpauthUri.startsWith('otpauth://totp/')).toBe(true);
    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.recoveryCodes).toHaveLength(10);
    expect(result.recoveryCodes.every(c => /^[0-9A-F]{8}$/.test(c))).toBe(true);
  });

  it('绑定中记录：重新生成 secret 与恢复码并原子覆盖', async () => {
    const { row, secret } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);
    prisma.sysUserMfa.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.setup(principal());

    expect(prisma.sysUserMfa.create).not.toHaveBeenCalled();
    const args = prisma.sysUserMfa.updateMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({ userId: 7n, enabledAt: null });
    expect(args.data.secretCipher).not.toBe(row.secretCipher);
    expect(args.data.recoveryCodes).toHaveLength(10);
    expect(result.secret).not.toBe(secret.base32);
  });

  it('绑定中记录被并发启用（条件更新命中 0 行）：拒绝并返回 409', async () => {
    const { row } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);
    prisma.sysUserMfa.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.setup(principal())).rejects.toMatchObject({
      code: '97A02',
      status: 409,
    });
  });

  it('已启用记录：拒绝重复绑定', async () => {
    const { row } = makeRow({ enabledAt: new Date() });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);

    await expect(service.setup(principal())).rejects.toMatchObject({
      code: '97A02',
      status: 409,
    });
  });

  it('并发首次绑定命中唯一约束：退化为覆盖绑定中记录', async () => {
    prisma.sysUserMfa.findUnique.mockResolvedValue(null);
    prisma.sysUserMfa.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.sysUserMfa.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.setup(principal());

    expect(result.recoveryCodes).toHaveLength(10);
    expect(prisma.sysUserMfa.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7n, enabledAt: null } }),
    );
  });
});

// ================================================================
// bind
// ================================================================

describe('mfaService.bind', () => {
  it('首码正确：以读取到的 secretCipher 为条件更新 enabledAt', async () => {
    const { row, secret } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);
    prisma.sysUserMfa.updateMany.mockResolvedValue({ count: 1 });

    const code = new TOTP({ secret }).generate();
    await service.bind(principal(), { code });

    const args = prisma.sysUserMfa.updateMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({ userId: 7n, secretCipher: row.secretCipher });
    expect(args.data.enabledAt).toBeInstanceOf(Date);
  });

  it('首码错误：直接拒绝，不写库', async () => {
    const { row } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);

    await expect(service.bind(principal(), { code: '000000' })).rejects.toMatchObject({
      code: '97A03',
      status: 400,
    });
    expect(prisma.sysUserMfa.updateMany).not.toHaveBeenCalled();
  });

  it('提交期间 secret 被重新生成：返回 409 绑定状态已变更', async () => {
    const { row, secret } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);
    prisma.sysUserMfa.updateMany.mockResolvedValue({ count: 0 });

    const code = new TOTP({ secret }).generate();
    await expect(service.bind(principal(), { code })).rejects.toMatchObject({
      code: '97A06',
      status: 409,
    });
  });
});

// ================================================================
// unbind
// ================================================================

describe('mfaService.unbind', () => {
  it('绑定中记录：无需验证码，按 enabledAt = null 条件删除', async () => {
    const { row } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);
    prisma.sysUserMfa.deleteMany.mockResolvedValue({ count: 1 });

    await service.unbind(principal(), {});

    expect(prisma.sysUserMfa.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7n, enabledAt: null },
    });
    expect(prisma.sysUserMfa.delete).not.toHaveBeenCalled();
  });

  it('绑定中被并发 bind 抢先完成：不能当作取消成功', async () => {
    const { row } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ enabledAt: new Date() });
    prisma.sysUserMfa.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.unbind(principal(), {})).rejects.toMatchObject({
      code: '97A02',
      status: 409,
    });
  });

  it('绑定中记录已被其他请求取消：幂等成功', async () => {
    const { row } = makeRow({ enabledAt: null });
    prisma.sysUserMfa.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(null);
    prisma.sysUserMfa.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.unbind(principal(), {})).resolves.toBeUndefined();
  });

  it('已启用但未提供验证码：返回 400', async () => {
    const { row } = makeRow({ enabledAt: new Date() });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);

    await expect(service.unbind(principal(), {})).rejects.toMatchObject({
      code: '97A07',
      status: 400,
    });
    expect(prisma.sysUserMfa.delete).not.toHaveBeenCalled();
  });

  it('已启用且 TOTP 正确：删除记录', async () => {
    const { row, secret } = makeRow({ enabledAt: new Date() });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);

    const code = new TOTP({ secret }).generate();
    await service.unbind(principal(), { code });

    expect(prisma.sysUserMfa.delete).toHaveBeenCalledWith({ where: { userId: 7n } });
  });

  it('已启用且恢复码正确：标记使用后删除记录', async () => {
    const code = 'A3F9C2D1';
    const { row } = makeRow({
      enabledAt: new Date(),
      recoveryCodes: [{ hash: hashRecoveryCode(code), usedAt: null }],
    });
    prisma.sysUserMfa.findUnique.mockResolvedValue(row);

    await service.unbind(principal(), { code });

    expect(prisma.sysUserMfa.update).toHaveBeenCalledTimes(1);
    expect(prisma.sysUserMfa.delete).toHaveBeenCalledWith({ where: { userId: 7n } });
  });
});
