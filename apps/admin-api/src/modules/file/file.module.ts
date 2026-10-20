import { Module } from '@nestjs/common';
import { FileController } from './file.controller.js';
import { FileService } from './file.service.js';

/**
 * 文件业务模块（P3a，ADR-012）。
 *
 * 依赖的全局模块：
 * - PrismaModule（PrismaService）
 * - StorageModule（STORAGE_DRIVER 令牌）
 * - ImageProcessorModule（ImageProcessorService：图片核验与封面派生，ADR-012 D4）
 * - ConfigModule（ConfigService + getConfig）
 *
 * 无需显式 imports——全部标记 @Global()。
 */
@Module({
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
