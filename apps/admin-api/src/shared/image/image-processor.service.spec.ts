import type { ProcessedCover } from './image-processor.service.js';
import { Buffer } from 'node:buffer';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageBizCode, ImageProcessorService } from './image-processor.service.js';

/**
 * 复用与默认配置一致的取值（覆盖 1600px / webp / 质量 82 / 像素上限 10000px），
 * 让「配置读取 → 归一化」这条链路整体参与测试，而不是被 mock 掩盖。
 */
vi.mock('@/config/configuration.js', () => ({
  getConfig: () => ({
    upload: {
      coverMaxWidth: 1600,
      coverFormat: 'webp',
      coverQuality: 82,
      imageMaxDimension: 10_000,
    },
  }),
}));

/** 由 sharp 现编图片字节，测试不依赖外部夹具文件。 */
function makeImage(width: number, height: number, format: 'png' | 'jpeg' = 'png') {
  return sharp({ create: { width, height, channels: 3, background: '#334455' } })
    .toFormat(format)
    .toBuffer();
}

/** 断言封面非空并收窄类型（避免在测试里散落非空断言）。 */
function requireCover(cover: ProcessedCover | null): ProcessedCover {
  if (!cover)
    throw new Error('封面派生不应返回 null');
  return cover;
}

describe('imageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    // 核验与派生都会写日志：压掉避免污染测试输出
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageProcessorService,
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ImageProcessorService);
  });

  describe('verify：核验失败 = 拒绝上传', () => {
    it('合法图片通过核验', async () => {
      await expect(service.verify(await makeImage(100, 60))).resolves.toBeUndefined();
    });

    it('非图片字节被拒绝——不能只凭 Content-Type 穿过 MIME 白名单', async () => {
      const spoofed = Buffer.from('<?php echo "not an image"; ?>', 'utf8');
      await expect(service.verify(spoofed)).rejects.toMatchObject({
        code: ImageBizCode.INVALID_IMAGE,
      });
    });

    it('像素边长超限被拒绝——压缩体积合规不代表解码内存合规', async () => {
      // 10001×1 的 PNG 体积很小，但宽度已超过 10000px 硬上限
      const tooWide = await makeImage(10_001, 1);
      await expect(service.verify(tooWide)).rejects.toMatchObject({
        code: ImageBizCode.INVALID_IMAGE,
      });
    });
  });

  describe('buildCover：派生失败 = 降级为仅原图', () => {
    it('小图不放大：封面尺寸等于原图尺寸', async () => {
      const cover = requireCover(await service.buildCover(await makeImage(100, 60)));

      expect(cover.format).toBe('webp');
      expect(cover.width).toBe(100);
      expect(cover.height).toBe(60);
      // 输出确实是目标格式的合法图片，而不只是「非空字节」
      expect((await sharp(cover.buffer).metadata()).format).toBe('webp');
    });

    it('宽图限宽至 1600px 并保持比例', async () => {
      const cover = requireCover(await service.buildCover(await makeImage(2000, 100)));

      expect(cover.width).toBe(1600);
      expect(cover.height).toBe(80);
    });

    it('按 EXIF Orientation 旋正：竖拍照片的封面不躺倒', async () => {
      // 像素仍为 100×60，EXIF Orientation=6 表示应顺时针旋转 90° 展示
      const rotated = await sharp({
        create: { width: 100, height: 60, channels: 3, background: '#8899aa' },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const cover = requireCover(await service.buildCover(rotated));

      expect(cover.width).toBe(60);
      expect(cover.height).toBe(100);
    });

    it('派生失败返回 null，不抛出（不阻断上传）', async () => {
      await expect(
        service.buildCover(Buffer.from('broken-bytes', 'utf8')),
      ).resolves.toBeNull();
    });
  });
});
