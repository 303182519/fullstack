import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 数据库模块。
 *
 * 显式导入（不设为全局模块）：谁需要 PrismaService 就在自己的模块里 import PrismaModule，
 * 保持依赖关系可追踪，避免全局模块掩盖真实的依赖图谱。
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
