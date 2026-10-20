import type { Buffer } from 'node:buffer';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { BaseException } from '@/common/exceptions/base.exception.js';
import { buildBizCode, MODULE_CODES } from '@/common/exceptions/module-registry.js';
import { getConfig } from '@/config/configuration.js';

/** 封面输出格式（与 config.upload.coverFormat 取值一致）。 */
export type CoverFormat = 'webp' | 'jpeg' | 'png';

/**
 * 图片核验业务错误码（MMSNN；90 = 文件模块号段，从 MODULE_CODES.FILE 构造）。
 *
 * ImageProcessorService 是文件上传管道的一环，错误码归 File 模块管。
 */
export const ImageBizCode = {
  INVALID_IMAGE: buildBizCode(MODULE_CODES.FILE, 'A', 7),
} as const;

function imageError(message: string, code: string): BaseException {
  return new BaseException({ message, status: HttpStatus.BAD_REQUEST, code });
}

export const imageErrors = {
  invalidImage: (message: string) => imageError(message, ImageBizCode.INVALID_IMAGE),
} as const;

/** 派生封面：新字节流 + 输出格式 + 实际输出尺寸。 */
export interface ProcessedCover {
  buffer: Buffer;
  format: CoverFormat;
  width: number;
  height: number;
}

/**
 * 图片核验与封面派生（ADR-012 D4）。
 *
 * 只做两件事，且**两件事的失败语义不同**，调用方必须分别处理：
 *
 * 1. `verify` —— 字节级真实性核验（失败 = **拒绝上传**）。
 *    只看 Content-Type / 扩展名是经典绕过点：把任意字节流顶个 `image/png` 头即可穿过
 *    MIME 白名单。这里用 sharp 解析真实像素结构——解析不出宽高即不是合法图片。
 *    同时按像素边长上限拒绝超大图：`UPLOAD_MAX_BYTES` 只约束**压缩体积**，
 *    一张 5 MiB 的 PNG 可以解出 20000×20000（RGBA 约 1.5 GB），
 *    不在解码前拦住就等于把「上传」变成内存耗尽入口。
 *
 * 2. `buildCover` —— 封面派生（失败 = **降级为仅原图**，见 ADR-012 D4）。
 *    EXIF 自动旋正 → 限宽不放大 → 转目标格式。任一环节异常只 warn 并返回 null，
 *    不阻断上传：封面是增强而非前置条件，`cover_*` 列留空由消费端容忍。
 *
 * 与 `StorageDriver` 的分工：驱动只负责字节的透明存取，**不感知**图片语义；
 * 本服务只负责字节的变换与核验，**不感知** Web 路由与存储后端。
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly maxDimension: number;
  private readonly coverMaxWidth: number;
  private readonly coverFormat: CoverFormat;
  private readonly coverQuality: number;

  constructor(configService: ConfigService) {
    const { upload } = getConfig(configService);
    // 构造期快照：与 FileService 同口径，避免每次调用重复解配置
    this.maxDimension = upload.imageMaxDimension;
    this.coverMaxWidth = upload.coverMaxWidth;
    this.coverFormat = upload.coverFormat;
    this.coverQuality = upload.coverQuality;
  }

  /**
   * 核验字节内容确实是图片，且像素尺寸在硬上限内；不通过则抛出 400（`90A07`）。
   *
   * 后端必须自己核验——前端校验只是体验优化，绕过它直发 multipart 的成本几乎为零
   * （AGENTS.md §15 纵深防御）。
   */
  async verify(buffer: Buffer): Promise<void> {
    // metadata 只读文件头，不做全量解码——这是「解码前拦截」的前提
    const meta = await sharp(buffer)
      .metadata()
      .catch(() => null);

    if (!meta?.width || !meta.height) {
      this.logger.warn('图片核验失败：字节内容不是可解析的图片');
      throw imageErrors.invalidImage('文件内容不是有效图片');
    }

    if (meta.width > this.maxDimension || meta.height > this.maxDimension) {
      this.logger.warn(
        `图片像素尺寸超限：${meta.width}×${meta.height}（上限 ${this.maxDimension}px）`,
      );
      throw imageErrors.invalidImage(
        `图片尺寸 ${meta.width}×${meta.height} 超过上限 ${this.maxDimension}px`,
      );
    }

    const frames = meta.pages ?? 1;
    if (frames > 1) {
      // 动图（GIF / 动图 webp）sharp 只取首帧 → 静态封面，属预期行为，留痕便于排查
      this.logger.debug(
        `动图封面只取首帧：${meta.width}×${meta.height} ${meta.format}，共 ${frames} 帧`,
      );
    }
  }

  /**
   * 派生封面：EXIF 旋正 → 限宽（不放大）→ 转目标格式；失败返回 null。
   *
   * - `rotate()` 无参数 = 按 EXIF Orientation 自动旋正（手机竖拍不躺倒），
   *   旋正后的像素不再带方向标记；sharp 默认不保留元数据，EXIF/GPS 一并剥离；
   * - `withoutEnlargement` 保证小图不被放大（封面尺寸 = 原图尺寸）；
   * - `resolveWithObject` 直接拿输出尺寸，省去对输出再解码一次取 metadata。
   */
  async buildCover(buffer: Buffer): Promise<ProcessedCover | null> {
    try {
      const { data, info } = await sharp(buffer)
        .rotate()
        .resize({ width: this.coverMaxWidth, withoutEnlargement: true })
        .toFormat(this.coverFormat, { quality: this.coverQuality })
        .toBuffer({ resolveWithObject: true });

      this.logger.debug(
        `封面派生：${info.width}×${info.height} ${info.format}`
        + `（${buffer.length} → ${data.length} 字节）`,
      );

      return {
        buffer: data,
        format: this.coverFormat,
        width: info.width,
        height: info.height,
      };
    }
    catch (err) {
      this.logger.warn(`封面派生失败，降级为仅原图：${(err as Error).message}`);
      return null;
    }
  }
}
