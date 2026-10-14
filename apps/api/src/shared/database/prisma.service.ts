import { createPrismaClientOptions, PrismaClient } from '@fedstack/database';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 业务服务（api）的 Prisma 客户端。
 *
 * 说明：
 * - 继承 PrismaClient 以保留完整的类型化查询能力（各服务自建，见 ADR-001 Q1）。
 * - 连接参数从本服务自身的环境注入；共享包 @fedstack/database 不读取任何环境变量。
 * - 生命周期钩子由 main.ts 的 app.enableShutdownHooks() 触发，用于释放连接池。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const url = configService.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error('缺少必填环境变量 DATABASE_URL，无法初始化数据库连接');
    }
    const connectionLimit = Number(configService.get('DB_CONNECTION_LIMIT') ?? 10);

    super(createPrismaClientOptions({ url, connectionLimit }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
