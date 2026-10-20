import type { Express } from 'express';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import type { ProcessedCover } from '@/shared/image/image-processor.service.js';
import type { StorageDriver } from '@/shared/storage/storage.types.js';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { FileStorage } from '@fedstack/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProcessorService } from '@/shared/image/image-processor.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';
import { FileService } from './file.service.js';

// ---------- shared fixtures ----------

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

function makeMultipartFile(opts: {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
} = {}): Express.Multer.File {
  const mimetype = opts.mimetype ?? 'image/jpeg';
  const size = opts.size ?? (opts.buffer?.length ?? 4096);
  return {
    fieldname: 'file',
    originalname: opts.originalname ?? 'photo.jpg',
    encoding: '7bit',
    mimetype,
    buffer: opts.buffer ?? Buffer.alloc(size),
    size,
    stream: undefined as unknown as Readable,
    destination: '',
    filename: '',
    path: '',
  };
}

function makeFileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345n,
    tenantId: 42n,
    uploaderId: 7n,
    storage: FileStorage.LOCAL,
    bucket: null,
    objectKey: '42/2026/10/20/12345',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 4096,
    module: null,
    coverKey: null,
    coverFormat: null,
    coverWidth: null,
    coverHeight: null,
    coverSize: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function coverOf(opts: Partial<ProcessedCover> = {}): ProcessedCover {
  return {
    buffer: Buffer.from('cover-bytes'),
    format: 'webp',
    width: 1600,
    height: 1200,
    ...opts,
  };
}

// ---------- per-test setup ----------

type PrismaMock = {
  sysTenant: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  sysFile: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  sysUser: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): PrismaMock {
  return {
    sysTenant: { findFirst: vi.fn() },
    sysFile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
    },
    sysUser: { findMany: vi.fn() },
  };
}

function makeDriver(): any {
  return {
    kind: 'local' as const,
    put: vi.fn().mockResolvedValue(undefined),
    getStream: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue(null),
  };
}

function makeImageProcessor(): any {
  return {
    verify: vi.fn().mockResolvedValue(undefined),
    buildCover: vi.fn().mockResolvedValue(null),
  };
}

function makeConfigService(): any {
  const cfg = {
    storage: {
      driver: 'local' as const,
      localRoot: 'storage',
      signedUrlTtl: 300,
      s3: undefined,
    },
    upload: {
      maxBytes: 5 * 1024 * 1024,
      maxBytesOther: 20 * 1024 * 1024,
      allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      allowedFileTypes: [
        'application/pdf',
        'application/zip',
        'application/json',
        'text/plain',
        'text/csv',
      ],
      coverMaxWidth: 1600,
      coverFormat: 'webp' as const,
      coverQuality: 82,
      imageMaxDimension: 10_000,
    },
  };
  return {
    get: vi.fn(() => cfg),
  };
}

let prisma: PrismaMock;
let driver: any;
let imageProcessor: any;
let service: FileService;

beforeAll(() => {
  // FileService.upload 调 generateSnowflakeId()，须先 init
  initSnowflake(0n, 0n);
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma = makePrisma();
  driver = makeDriver();
  imageProcessor = makeImageProcessor();
  service = new FileService(
    prisma as unknown as import('@/shared/database/prisma.service.js').PrismaService,
    driver as unknown as StorageDriver,
    imageProcessor as unknown as ImageProcessorService,
    makeConfigService(),
  );
});

// ================================================================
// Upload pipeline
// ================================================================

describe('fileService.upload — pipeline', () => {
  it('非图片文件：verify/buildCover 都不调，只写原图 + 写元数据', async () => {
    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 1_073_741_824n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({ _sum: { size: 0, coverSize: 0 } });
    prisma.sysFile.create.mockResolvedValue(makeFileRow({
      mimeType: 'application/pdf',
      size: 10_000_000,
      coverKey: null,
    }));

    await service.upload(
      principal(),
      makeMultipartFile({
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 10 * 1024 * 1024,
      }),
    );

    expect(imageProcessor.verify).not.toHaveBeenCalled();
    expect(imageProcessor.buildCover).not.toHaveBeenCalled();
    // 只 put 原图
    expect(driver.put).toHaveBeenCalledTimes(1);
    expect(driver.put).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'application/pdf',
    }));
    // coverSize=null, coverKey=null
    expect(prisma.sysFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        coverKey: null,
        coverFormat: null,
        coverWidth: null,
        coverHeight: null,
        coverSize: null,
      }),
    }));
  });

  it('图片文件：verify 通过 + buildCover 返回封面 → 写原图 + 封面 + 完整元数据', async () => {
    const cover = coverOf();
    imageProcessor.buildCover.mockResolvedValue(cover);

    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 1_073_741_824n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({ _sum: { size: 0, coverSize: 0 } });
    prisma.sysFile.create.mockResolvedValue(makeFileRow({
      coverKey: '42/2026/10/20/xxx.cover.webp',
      coverFormat: 'webp',
      coverWidth: 1600,
      coverHeight: 1200,
      coverSize: cover.buffer.length,
    }));

    await service.upload(
      principal(),
      makeMultipartFile({ originalname: 'photo.jpg', size: 4096 }),
      'avatar',
    );

    expect(imageProcessor.verify).toHaveBeenCalledTimes(1);
    expect(imageProcessor.buildCover).toHaveBeenCalledTimes(1);
    // put 原图 + 封面
    expect(driver.put).toHaveBeenCalledTimes(2);
    expect(driver.put).toHaveBeenNthCalledWith(1, expect.objectContaining({
      contentType: 'image/jpeg',
    }));
    expect(driver.put).toHaveBeenNthCalledWith(2, expect.objectContaining({
      contentType: 'image/webp',
    }));
    // 元数据含封面列
    expect(prisma.sysFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storage: FileStorage.LOCAL,
        coverFormat: 'webp',
        coverWidth: 1600,
        coverHeight: 1200,
        coverSize: cover.buffer.length,
        module: 'avatar',
      }),
    }));
  });

  it('verify 失败 → 拒绝上传（90A07），verify 失败不进配额不写对象', async () => {
    imageProcessor.verify.mockRejectedValue(
      { code: '90A07', message: '文件内容不是有效图片' },
    );

    await expect(
      service.upload(principal(), makeMultipartFile()),
    ).rejects.toMatchObject({ code: '90A07' });

    expect(prisma.sysTenant.findFirst).not.toHaveBeenCalled();
    expect(prisma.sysFile.create).not.toHaveBeenCalled();
    expect(driver.put).not.toHaveBeenCalled();
  });

  it('buildCover 返回 null → 降级为仅原图（不阻断上传）', async () => {
    imageProcessor.buildCover.mockResolvedValue(null);

    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 1_073_741_824n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({ _sum: { size: 0, coverSize: 0 } });
    prisma.sysFile.create.mockResolvedValue(makeFileRow({ coverKey: null }));

    await service.upload(principal(), makeMultipartFile());

    // 只 put 原图，封面跳过
    expect(driver.put).toHaveBeenCalledTimes(1);
    expect(prisma.sysFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        coverKey: null,
        coverSize: null,
        coverFormat: null,
      }),
    }));
  });

  it('mIME 白名单不匹配 → 90A02', async () => {
    await expect(
      service.upload(principal(), makeMultipartFile({ mimetype: 'image/bmp' })),
    ).rejects.toMatchObject({ code: '90A02' });

    expect(driver.put).not.toHaveBeenCalled();
    expect(prisma.sysFile.create).not.toHaveBeenCalled();
  });

  it('非图片超过 maxBytesOther 上限 → 90A03', async () => {
    await expect(
      service.upload(principal(), makeMultipartFile({
        mimetype: 'application/pdf',
        size: 20 * 1024 * 1024 + 1,
      })),
    ).rejects.toMatchObject({ code: '90A03' });
  });

  it('图片超过 maxBytes 上限 → 90A03', async () => {
    await expect(
      service.upload(principal(), makeMultipartFile({
        mimetype: 'image/jpeg',
        size: 5 * 1024 * 1024 + 1,
      })),
    ).rejects.toMatchObject({ code: '90A03' });
  });

  it('配额超限（含封面字节） → 90A04（不写对象）', async () => {
    const cover = coverOf({ buffer: Buffer.alloc(100) });
    imageProcessor.buildCover.mockResolvedValue(cover);

    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 100n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({ _sum: { size: 80, coverSize: 0 } });

    // projected = 80 + 4096 + 100 = 4276 > 100 → 超限
    await expect(
      service.upload(principal(), makeMultipartFile({ size: 4096 })),
    ).rejects.toMatchObject({ code: '90A04' });

    expect(driver.put).not.toHaveBeenCalled();
  });

  it('租户不存在 → 90A08（verify 之后抛，对象还没写）', async () => {
    prisma.sysTenant.findFirst.mockResolvedValue(null);

    await expect(
      service.upload(principal(), makeMultipartFile()),
    ).rejects.toMatchObject({ code: '90A08' });

    expect(driver.put).not.toHaveBeenCalled();
    expect(prisma.sysFile.create).not.toHaveBeenCalled();
  });

  it('storage 枚举正确写入（本地驱动 → LOCAL）', async () => {
    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 1_073_741_824n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({ _sum: { size: 0, coverSize: 0 } });
    prisma.sysFile.create.mockResolvedValue(makeFileRow());

    await service.upload(
      principal(),
      makeMultipartFile({ mimetype: 'application/pdf' }),
    );

    expect(prisma.sysFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storage: FileStorage.LOCAL }),
    }));
  });
});

// ================================================================
// Quota 口径
// ================================================================

describe('fileService — 配额检查口径', () => {
  it('用量 = SUM(size + coverSize) over 未删除行', async () => {
    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 1_000_000n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({
      _sum: { size: 500_000, coverSize: 200_000 },
    });
    prisma.sysFile.create.mockResolvedValue(makeFileRow({
      mimeType: 'application/pdf',
      size: 100_000,
      coverKey: null,
    }));

    await service.upload(
      principal(),
      makeMultipartFile({ mimetype: 'application/pdf', size: 100_000 }),
    );

    expect(prisma.sysFile.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 42n, deletedAt: null },
      _sum: { size: true, coverSize: true },
    }));
    // projected = 500000 + 200000 + 100000 = 800000 ≤ 1000000 ✅
    expect(driver.put).toHaveBeenCalled();
  });

  it('边界：刚好用完允许，多 1 字节超限拒绝', async () => {
    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 700n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({
      _sum: { size: 500, coverSize: 200 },
    });

    // projected = 700 + 1 = 701 > 700
    await expect(
      service.upload(principal(), makeMultipartFile({
        mimetype: 'application/pdf',
        size: 1,
      })),
    ).rejects.toMatchObject({ code: '90A04' });

    driver.put.mockClear();
    prisma.sysFile.create.mockClear();
    prisma.sysFile.aggregate.mockClear();
    prisma.sysTenant.findFirst.mockClear();

    // 重置：刚好用完
    prisma.sysTenant.findFirst.mockResolvedValue({
      id: 42n,
      storageLimit: 700n,
    });
    prisma.sysFile.aggregate.mockResolvedValue({
      _sum: { size: 500, coverSize: 200 },
    });
    prisma.sysFile.create.mockResolvedValue(makeFileRow({
      mimeType: 'application/pdf',
      size: 0,
      coverKey: null,
    }));

    await service.upload(
      principal(),
      makeMultipartFile({ mimetype: 'application/pdf', size: 0 }),
    );
    expect(driver.put).toHaveBeenCalled();
  });
});

// ================================================================
// List / Detail
// ================================================================

describe('fileService — 列表与详情', () => {
  it('list：scope deletedAt=null + createdAt desc', async () => {
    prisma.sysFile.findMany.mockResolvedValue([
      makeFileRow({ id: 1n, originalName: 'a.jpg' }),
      makeFileRow({ id: 2n, originalName: 'b.pdf', mimeType: 'application/pdf' }),
    ]);
    prisma.sysFile.count.mockResolvedValue(12);
    prisma.sysUser.findMany.mockResolvedValue([{ id: 7n, username: 'alice' }]);

    const out = await service.list(principal(), {
      page: 1,
      pageSize: 2,
      module: undefined,
      mimeType: undefined,
      keyword: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      get skip() { return (this.page - 1) * this.pageSize; },
    });

    expect(prisma.sysFile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 42n, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 2,
    }));
    expect(out.total).toBe(12);
    expect(out.items).toHaveLength(2);
  });

  it('list：module / mimeType / keyword 过滤拼 where', async () => {
    prisma.sysFile.findMany.mockResolvedValue([]);
    prisma.sysFile.count.mockResolvedValue(0);

    await service.list(principal(), {
      page: 1,
      pageSize: 20,
      module: 'avatar',
      mimeType: 'image/',
      keyword: 'photo',
      dateFrom: undefined,
      dateTo: undefined,
      get skip() { return 0; },
    });

    expect(prisma.sysFile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 42n,
        deletedAt: null,
        module: 'avatar',
        mimeType: { startsWith: 'image/' },
        originalName: { contains: 'photo' },
      },
    }));
  });

  it('detail：越权（非本租户）→ 90A01', async () => {
    prisma.sysFile.findFirst.mockResolvedValue(null);
    await expect(service.detail(principal(), 999n))
      .rejects
      .toMatchObject({ code: '90A01' });
  });

  it('detail：已软删 → 90A01（同 notFound，不泄露存在性）', async () => {
    prisma.sysFile.findFirst.mockResolvedValue(null);
    await expect(service.detail(principal(), 999n))
      .rejects
      .toMatchObject({ code: '90A01' });
  });
});

// ================================================================
// Remove
// ================================================================

describe('fileService — 删除', () => {
  it('remove：软删元数据 + 物理删原图 + 物理删封面', async () => {
    const row = makeFileRow({
      coverKey: '42/2026/10/20/xxx.cover.webp',
      coverFormat: 'webp',
      coverSize: 100,
      coverWidth: 1600,
      coverHeight: 1200,
    });
    prisma.sysFile.findFirst.mockResolvedValue(row);

    await service.remove(principal(), row.id);

    expect(prisma.sysFile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: row.id },
      data: { deletedAt: expect.any(Date) },
    }));
    expect(driver.delete).toHaveBeenCalledWith(row.objectKey);
    expect(driver.delete).toHaveBeenCalledWith(row.coverKey);
  });

  it('remove：物理删失败不阻断（只告警）', async () => {
    const row = makeFileRow({ coverKey: null });
    prisma.sysFile.findFirst.mockResolvedValue(row);
    driver.delete.mockRejectedValueOnce(new Error('boom'));

    await expect(service.remove(principal(), row.id)).resolves.toBeNull();
    expect(prisma.sysFile.update).toHaveBeenCalled();
  });
});

// ================================================================
// Content（代理 / 直连）
// ================================================================

describe('fileService — 下载双通路', () => {
  it('代理下载：返回 Readable 流 + mimeType + originalName', async () => {
    const row = makeFileRow({ mimeType: 'image/jpeg' });
    prisma.sysFile.findFirst.mockResolvedValue(row);
    const stream = new Readable({
      read() { this.push(null); },
    });
    driver.getStream.mockResolvedValue(stream);

    const out = await service.content(principal(), row.id, false);
    expect(out).toBeInstanceOf(Object);
    if (out && 'stream' in out) {
      expect(out.stream).toBe(stream);
      expect(out.mimeType).toBe('image/jpeg');
      expect(out.originalName).toBe('photo.jpg');
    }
  });

  it('代理下载：对象缺失但元数据存在 → 90A01', async () => {
    const row = makeFileRow();
    prisma.sysFile.findFirst.mockResolvedValue(row);
    driver.getStream.mockResolvedValue(null);

    await expect(service.content(principal(), row.id, false))
      .rejects
      .toMatchObject({ code: '90A01' });
  });

  it('直连下载：本地驱动返回 null', async () => {
    const row = makeFileRow();
    prisma.sysFile.findFirst.mockResolvedValue(row);
    driver.getSignedUrl.mockResolvedValue(null);

    expect(await service.content(principal(), row.id, true)).toBeNull();
  });

  it('直连下载：返回预签名 URL + mimeType + filename', async () => {
    const row = makeFileRow();
    prisma.sysFile.findFirst.mockResolvedValue(row);
    driver.getSignedUrl.mockResolvedValue('https://s3.example.com/signed?xxx');

    const out = await service.content(principal(), row.id, true);
    expect(out).toEqual({
      url: 'https://s3.example.com/signed?xxx',
      mimeType: row.mimeType,
      filename: row.originalName,
    });
    expect(driver.getSignedUrl).toHaveBeenCalledWith(row.objectKey, 300);
  });
});
