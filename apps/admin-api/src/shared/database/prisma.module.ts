import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 数据库模块。
 *
 * 显式导入（不设为全局模块）：谁需要 PrismaService 就在自己的模块里 import PrismaModule，
 * 保持依赖关系可追踪，避免全局模块掩盖真实的依赖图谱。
 */
/**
 * PrismaModule 用 @Global()：
 *   PrismaService 是全应用共享的单例（一套连接池），几乎每个 feature module 都要用。
 *   标成 @Global 后，根模块 import 一次，其它模块直接注入 PrismaService，不必反复 import。
 *
 * ★ @Global 别滥用——它会让依赖关系变隐式。但"全局唯一的基础设施"（DB / 缓存 client）
 *   是 @Global 的标准场景，符合官方建议。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
