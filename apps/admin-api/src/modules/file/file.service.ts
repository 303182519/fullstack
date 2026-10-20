import type { Express } from 'express';
import type { FileRow } from './dto/index.js';
import type { PaginatedResult } from '@/common/dto/pagination.dto.js';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import type { ProcessedCover } from '@/shared/image/image-processor.service.js';
import type { StorageDriver } from '@/shared/storage/storage.types.js';
import { Readable } from 'node:stream';
import { Prisma } from '@fedstack/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ImageProcessorService } from '@/shared/image/image-processor.service.js';
import { STORAGE_DRIVER } from '@/shared/storage/storage.constants.js';
import { toFileStorage } from '@/shared/storage/storage.types.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { FileResponseDto, QueryFileDto } from './dto/index.js';
import { fileErrors } from './errors.js';

interface UploadConfigRuntime {
  maxBytes: number;
  maxBytesOther: number;
  imageTypes: Set<string>;
  fileTypes: Set<string>;
}

/** 对象键生成：顶层 tenantId + 日期分区 + 雪花 ID（全局唯一、便于运维） */
function buildObjectKey(tenantId: string, fileId: bigint): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${tenantId}/${yyyy}/${mm}/${dd}/${fileId.toString()}`;
}

/**
 * 文件服务（P3a，ADR-012）。
 *
 * 职责：
 * - 上传管道（校验 → 归一化 → 配额预检 → 写入对象 → 写元数据）；
 * - 文件列表 / 详情 / 删除 / 下载（代理 + 直连签名双通路）。
 *
 * 设计约束：
 * - tenantId 由 AuthPrincipal 注入，不信任客户端传入（安全边界，AGENTS.md §15）；
 * - 配额用量 = 未删除 SysFile 行 `SUM(size + coverSize)`（单一真相源，ADR-012 D5）；
 * - 配额预检与实际存储之间存在小并发超限窗口（ADR-009 D3 同口径，已接受）；
 * - 删除 = 元数据软删 + 对象物理删（best-effort）——物理删失败只告警，不回滚元数据；
 * - 图片字节级核验失败（非真实图片 / 像素超限）**拒绝上传**；封面派生失败降级为「仅原图」
 *   （cover_* 列留空），不阻断上传；
 * - 核验与封面派生统一由 `ImageProcessorService` 承担（ADR-012 D4），本服务只做管道编排，
 *   自身不直接依赖 sharp。
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadConfig: UploadConfigRuntime;
  private readonly signedUrlTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
    private readonly imageProcessor: ImageProcessorService,
    configService: ConfigService,
  ) {
    const cfg = getConfig(configService);
    this.uploadConfig = {
      maxBytes: cfg.upload.maxBytes,
      maxBytesOther: cfg.upload.maxBytesOther,
      imageTypes: new Set(cfg.upload.allowedImageTypes),
      fileTypes: new Set(cfg.upload.allowedFileTypes),
    };
    this.signedUrlTtlSec = cfg.storage.signedUrlTtl;
  }

  // ---------------- 上传 ----------------

  /**
   * 上传文件（memoryStorage 已把 buffer 给到 file.buffer）。
   *
   * 管道顺序（关键：核验与归一化必须在配额预检之前，配额预检必须在对象写入之前）：
   *   1. MIME 白名单 + 分类上限校验（防御层；Multer 的 fileFilter 已拦一次）；
   *   2. 字节级核验 + 封面派生（图片类）——核验不过即拒绝；全部在内存完成，配额未被占；
   *   3. 配额预检（原图大小 + 封面大小，精确口径）；
   *   4. 写入存储后端（原图 + 封面）；
   *   5. 写元数据（SysFile）。
   *
   * 任何步骤在 3 之前失败，配额均未被触碰；4 与 5 之间存在极小窗口（已接受，见类注释）。
   */
  async upload(
    principal: AuthPrincipal,
    file: Express.Multer.File,
    moduleTag?: string,
  ): Promise<FileResponseDto> {
    const mimeType = file.mimetype || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');

    // 1. MIME + 大小校验（防御层）
    const sizeLimit = isImage ? this.uploadConfig.maxBytes : this.uploadConfig.maxBytesOther;
    if (isImage) {
      if (!this.uploadConfig.imageTypes.has(mimeType))
        throw fileErrors.mimeForbidden(mimeType);
    }
    else {
      if (!this.uploadConfig.fileTypes.has(mimeType))
        throw fileErrors.mimeForbidden(mimeType);
    }
    if (file.size > sizeLimit) {
      throw fileErrors.sizeExceeded(file.size, sizeLimit);
    }

    // 2. 字节级核验 + 封面派生（图片类）——全部在内存完成，配额未被占
    //    核验不过（非真实图片 / 像素超限）→ 抛错拒绝；派生失败 → 降级为仅原图
    let cover: ProcessedCover | null = null;
    if (isImage) {
      await this.imageProcessor.verify(file.buffer);
      cover = await this.imageProcessor.buildCover(file.buffer);
    }
    const coverSize = cover?.buffer.length ?? 0;
    const totalBytes = file.size + coverSize;

    const tenantId = BigInt(principal.tenantId);

    // 3. 配额预检（精确口径：原图 + 封面）
    await this.assertQuota(tenantId, totalBytes);

    // 4. 写入存储后端（写入失败向上抛——配额预检已做，写失败即配额未被占）
    const fileId = BigInt(generateSnowflakeId());
    const objectKey = buildObjectKey(principal.tenantId, fileId);

    await this.driver.put({
      key: objectKey,
      body: file.buffer,
      contentType: mimeType,
    });

    let coverKey: string | null = null;
    if (cover) {
      coverKey = `${objectKey}.cover.${cover.format}`;
      await this.driver.put({
        key: coverKey,
        body: cover.buffer,
        contentType: `image/${cover.format}`,
      });
    }

    // 5. 写元数据（含 cover 列，精确尺寸）
    const row = await this.prisma.sysFile.create({
      data: {
        id: fileId,
        tenantId,
        uploaderId: BigInt(principal.userId),
        storage: toFileStorage(this.driver.kind),
        bucket: null,
        objectKey,
        originalName: file.originalname,
        mimeType,
        size: file.size,
        module: moduleTag ?? null,
        coverKey,
        coverFormat: cover?.format ?? null,
        coverWidth: cover?.width ?? null,
        coverHeight: cover?.height ?? null,
        coverSize: coverSize || null, // Prisma 非可选 Int：0 写进去，但用 null 更清晰表达「无封面」
      },
    });

    return FileResponseDto.from({ ...row, uploaderName: principal.username });
  }

  // ---------------- 查询 ----------------

  /** 管理列表：分页 + 多维度过滤 */
  async list(
    principal: AuthPrincipal,
    query: QueryFileDto,
  ): Promise<PaginatedResult<FileResponseDto>> {
    const tenantId = BigInt(principal.tenantId);
    const where: Prisma.SysFileWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.module ? { module: query.module } : {}),
      ...(query.mimeType ? { mimeType: { startsWith: query.mimeType } } : {}),
      ...(query.keyword ? { originalName: { contains: query.keyword } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sysFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sysFile.count({ where }),
    ]);

    // 批量取上传者用户名快照（上传者删除后快照仍有效）
    const uploaderIds = new Set(rows.map(r => r.uploaderId));
    const userMap = uploaderIds.size > 0
      ? new Map(
          (await this.prisma.sysUser.findMany({
            where: { id: { in: [...uploaderIds] } },
            select: { id: true, username: true },
          })).map(u => [u.id, u.username]),
        )
      : new Map<bigint, string>();

    return {
      items: rows.map(r =>
        FileResponseDto.from({
          ...r,
          uploaderName: userMap.get(r.uploaderId) ?? null,
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 文件详情（含封面元数据） */
  async detail(principal: AuthPrincipal, id: bigint): Promise<FileResponseDto> {
    const tenantId = BigInt(principal.tenantId);
    const row = await this.requireInScope(tenantId, id);
    return FileResponseDto.from({ ...row, uploaderName: principal.username });
  }

  // ---------------- 删除 ----------------

  /**
   * 删除文件：软删元数据 + 物理删对象（best-effort）。
   *
   * 物理删失败只告警不抛错——元数据软删已做，配额随之自动释放（ADR-012 D5）；
   * 遗留孤儿对象由补偿任务（P3b 队列，见 ADR-013）收口。
   */
  async remove(principal: AuthPrincipal, id: bigint): Promise<null> {
    const tenantId = BigInt(principal.tenantId);
    const row = await this.requireInScope(tenantId, id);

    await this.prisma.sysFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    try {
      await this.driver.delete(row.objectKey);
    }
    catch (err) {
      this.logger.warn(
        `删除文件原图物理对象失败（已软删元数据）：${row.objectKey}（${(err as Error).message}）`,
      );
    }
    if (row.coverKey) {
      try {
        await this.driver.delete(row.coverKey);
      }
      catch (err) {
        this.logger.warn(
          `删除文件封面物理对象失败：${row.coverKey}（${(err as Error).message}）`,
        );
      }
    }

    return null;
  }

  // ---------------- 下载 ----------------

  /**
   * 下载内容：代理流式返回（默认）或预签名直连（direct=true）。
   *
   * - 代理：返回 `{ stream, mimeType, originalName }`——调用方据此设置响应头并 pipe；
   * - 直连：返回 `{ url, mimeType, filename }`；驱动不支持直连（本地）时返回 null；
   * - 对象流不存在：对象被物理删但元数据还在 → 抛 404（软删已做但物理删失败或不一致）。
   */
  async content(
    principal: AuthPrincipal,
    id: bigint,
    direct: boolean,
  ): Promise<
    | { stream: Readable; mimeType: string; originalName: string }
    | { url: string; mimeType: string; filename: string }
    | null
  > {
    const tenantId = BigInt(principal.tenantId);
    const row = await this.requireInScope(tenantId, id);

    if (direct) {
      const url = await this.driver.getSignedUrl(row.objectKey, this.signedUrlTtlSec);
      if (!url)
        return null;
      return { url, mimeType: row.mimeType, filename: row.originalName };
    }

    const stream = await this.driver.getStream(row.objectKey);
    if (!stream) {
      this.logger.warn(`文件元数据存在但物理对象缺失：${row.objectKey}（id=${row.id}）`);
      throw fileErrors.notFound('文件不存在或已损坏');
    }
    return { stream, mimeType: row.mimeType, originalName: row.originalName };
  }

  // ---------------- 内部 ----------------

  /** 配额预检：当前用量 + 本次体积是否超过租户上限 */
  private async assertQuota(tenantId: bigint, incBytes: number): Promise<void> {
    const [tenant, usage] = await Promise.all([
      this.prisma.sysTenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { storageLimit: true },
      }),
      this.prisma.sysFile.aggregate({
        where: { tenantId, deletedAt: null },
        _sum: { size: true, coverSize: true },
      }),
    ]);

    if (!tenant)
      throw fileErrors.tenantMissing();

    const used
      = BigInt(usage._sum.size ?? 0) + BigInt(usage._sum.coverSize ?? 0);
    const projected = used + BigInt(incBytes);

    if (projected > tenant.storageLimit) {
      throw fileErrors.quotaExceeded(used, incBytes, tenant.storageLimit);
    }
  }

  /** 按作用域查文件，越权 / 不存在 / 已软删一律 404（不泄露存在性） */
  private async requireInScope(
    tenantId: bigint,
    id: bigint,
  ): Promise<FileRow> {
    const row = await this.prisma.sysFile.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!row)
      throw fileErrors.notFound();
    // Prisma 返回的行结构与 FileRow 兼容（storage 字段是枚举）
    return row as unknown as FileRow;
  }
}
