import { Global, Module } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service.js';

/**
 * 图片核验与封面派生模块（ADR-012 D4）。
 *
 * 与 StorageModule 同构：配置由 config 层注入，服务本身不读 env、不打印凭据。
 * 抽为独立共享服务而非 file 模块的私有方法，原因有三：
 * - 「核验失败 = 拒绝」与「派生失败 = 降级」是两类失败语义，需要各自独立的测试面；
 * - 归一化管道属跨模块基础设施（`SysFile.module` 已预留 avatar / notice 等消费方），
 *   留在 file 模块内会迫使后续消费方跨模块依赖文件业务；
 * - 纯字节入 / 字节出，不依赖 Prisma 与存储驱动，可脱离库表单测。
 */
@Global()
@Module({
  providers: [ImageProcessorService],
  exports: [ImageProcessorService],
})
export class ImageProcessorModule {}
